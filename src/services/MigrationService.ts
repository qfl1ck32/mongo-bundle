import { ContainerInstance, Service } from "@kaviar/core";
import { LoggerService } from "@kaviar/logger-bundle";
import { MigrationsCollection } from "../models/MigrationsCollection";

export interface IMigrationStatus {
  version: number;
  locked: boolean;
  lockedAt?: Date;
  lastError?: {
    fromVersion: number;
    message: string;
  };
}

export interface IMigrationConfig {
  up: (container: ContainerInstance) => any;
  down: (container: ContainerInstance) => any;
  version: number;
  name: string;
}

@Service()
export class MigrationService {
  migrationConfigs: IMigrationConfig[] = [];

  constructor(
    protected migrationsCollection: MigrationsCollection,
    protected logger: LoggerService,
    protected container: ContainerInstance
  ) {}

  add(config: IMigrationConfig) {
    if (this.getConfigByVersion(config.version)) {
      throw new Error(`You already have a migration added with this version.`);
    }
    this.migrationConfigs.push(config);
    this.migrationConfigs = this.migrationConfigs.sort((a, b) => {
      return a.version - b.version;
    });
  }

  getConfigByVersion(version: number): IMigrationConfig | null {
    return this.migrationConfigs.find((config) => {
      return config.version === version;
    });
  }

  async getVersion() {
    return (await this.getStatus()).version;
  }

  async updateStatus(data: Partial<IMigrationStatus>) {
    const status = await this.getStatus();
    await this.migrationsCollection.updateOne(
      {
        _id: "status",
      },
      {
        $set: data,
      }
    );
  }

  async getStatus(): Promise<IMigrationStatus> {
    const control = await this.migrationsCollection.findOne({ _id: "status" });
    if (!control) {
      await this.migrationsCollection.insertOne({
        _id: "status",
        version: this.migrationConfigs[this.migrationConfigs.length - 1],
      });
    }

    return control;
  }

  async lock() {
    // This is atomic. The selector ensures only one caller at a time will see
    // the unlocked control, and locking occurs in the same update's modifier.
    // All other simultaneous callers will get false back from the update.
    const result = await this.migrationsCollection.updateOne(
      { _id: "status", locked: false },
      { $set: { locked: true, lockedAt: new Date() } }
    );

    if (result.modifiedCount === 1) {
      return true;
    } else {
      return false;
    }
  }

  async run(direction: "up" | "down", config: IMigrationConfig) {
    if (typeof config[direction] !== "function") {
      throw new Error(
        "Cannot migrate " + direction + " on version " + config.version
      );
    }

    function maybeName() {
      return config.name ? " (" + config.name + ")" : "";
    }

    this.logger.info(
      "Running " + direction + "() on version " + config.version + maybeName()
    );

    await config[direction](this.container);
  }

  // Side effect: saves version.
  async unlock(currentVersion: number) {
    await this.updateStatus({
      locked: false,
      version: currentVersion,
      lastError: null,
    });
  }

  /**
   * Migrates to latest version
   */
  async migrateToLatest(): Promise<void> {
    if (this.migrationConfigs.length > 0) {
      return this.migrateTo(
        this.migrationConfigs[this.migrationConfigs.length - 1].version
      );
    }
  }

  async rerun(version: number) {
    // We are now in locked mode and we can do our thingie
    this.logger.info("Rerunning version " + version);
    this.run("up", this.getConfigByVersion(version));
    this.logger.info("Finished migrating.");
  }

  async migrateTo(version: number) {
    const status = await this.getStatus();
    let currentVersion = status.version;

    if ((await this.lock()) === false) {
      this.logger.info("Not migrating, control is locked.");
      return;
    }

    if (currentVersion === version) {
      this.logger.info("Not migrating, already at version " + version);
      this.unlock(currentVersion);
      return;
    }

    var startIdx = this.migrationConfigs.findIndex(
      (c) => c.version === currentVersion
    );
    var endIdx = this.migrationConfigs.findIndex((c) => c.version === version);

    // this.logger.info('startIdx:' + startIdx + ' endIdx:' + endIdx);
    this.logger.info(`Migrating from ${currentVersion} to ${version}`);

    try {
      if (currentVersion < version) {
        for (var i = startIdx; i < endIdx; i++) {
          await this.run("up", this.migrationConfigs[i + 1]);
          currentVersion = this.migrationConfigs[i + 1].version;
        }
      } else {
        for (var i = startIdx; i > endIdx; i--) {
          await this.run("down", this.migrationConfigs[i + 1]);
          currentVersion = this.migrationConfigs[i + 1].version;
        }
      }
    } catch (e) {
      this.logger.error(`Error while migrating abort`);
      this.updateStatus({
        lastError: {
          fromVersion: currentVersion,
          message: e.toString(),
        },
      });
      await this.lock();
      throw e;
    }

    await this.unlock(currentVersion);
    this.logger.info("Finished migrating.");
  }
}
