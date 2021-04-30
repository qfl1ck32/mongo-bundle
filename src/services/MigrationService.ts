import { ContainerInstance, Service } from "@kaviar/core";
import { LoggerService } from "@kaviar/logger-bundle";
import { IMigrationConfig } from "../defs";
import { MigrationsCollection } from "../models/MigrationsCollection";

var DefaultMigration = { version: 0, up: function () {} };

@Service()
class MigrationService {
  migrationConfigs: IMigrationConfig[] = [];

  constructor(
    protected migrationsCollection: MigrationsCollection,
    protected logger: LoggerService,
    protected container: ContainerInstance
  ) {}

  add(config: IMigrationConfig) {
    this.migrationConfigs.push(config);
    this.migrationConfigs = this.migrationConfigs.sort((a, b) => {
      return a.version - b.version;
    });
  }

  async updateStatus(data) {
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

  async getStatus() {
    const control = await this.migrationsCollection.findOne({ _id: "status" });
    if (!control) {
      await this.migrationsCollection.insertOne({
        _id: "status",
        version: 0,
      });
    }
  }
}

// Add a new migration:
// {up: function *required
//  version: Number *required
//  down: function *optional
//  name: String *optional
// }
Migrations.add = function (migration) {
  if (typeof migration.up !== "function")
    throw new Meteor.Error("Migration must supply an up function.");

  if (typeof migration.version !== "number")
    throw new Meteor.Error("Migration must supply a version number.");

  if (migration.version <= 0)
    throw new Meteor.Error("Migration version must be greater than 0");

  // Freeze the migration object to make it hereafter immutable
  Object.freeze(migration);

  this._list.push(migration);
  this._list = _.sortBy(this._list, function (m) {
    return m.version;
  });
};

// just returns the current version
Migrations.getVersion = function () {
  return this._getControl().version;
};

// migrates to the specific version passed in
Migrations._migrateTo = function (version, rerun) {
  var self = this;
  var control = this._getControl(); // Side effect: upserts control document.
  var currentVersion = control.version;

  if (lock() === false) {
    log.info("Not migrating, control is locked.");
    return;
  }

  if (rerun) {
    log.info("Rerunning version " + version);
    migrate("up", this._findIndexByVersion(version));
    log.info("Finished migrating.");
    unlock();
    return;
  }

  if (currentVersion === version) {
    if (Migrations.options.logIfLatest) {
      log.info("Not migrating, already at version " + version);
    }
    unlock();
    return;
  }

  var startIdx = this._findIndexByVersion(currentVersion);
  var endIdx = this._findIndexByVersion(version);

  // log.info('startIdx:' + startIdx + ' endIdx:' + endIdx);
  log.info(
    "Migrating from version " +
      this._list[startIdx].version +
      " -> " +
      this._list[endIdx].version
  );

  // run the actual migration
  function migrate(direction, idx) {
    var migration = self._list[idx];

    if (typeof migration[direction] !== "function") {
      unlock();
      throw new Meteor.Error(
        "Cannot migrate " + direction + " on version " + migration.version
      );
    }

    function maybeName() {
      return migration.name ? " (" + migration.name + ")" : "";
    }

    log.info(
      "Running " +
        direction +
        "() on version " +
        migration.version +
        maybeName()
    );

    migration[direction](migration);
  }

  // Returns true if lock was acquired.
  function lock() {
    // This is atomic. The selector ensures only one caller at a time will see
    // the unlocked control, and locking occurs in the same update's modifier.
    // All other simultaneous callers will get false back from the update.
    return (
      self._collection.update(
        { _id: "control", locked: false },
        { $set: { locked: true, lockedAt: new Date() } }
      ) === 1
    );
  }

  // Side effect: saves version.
  function unlock() {
    self._setControl({ locked: false, version: currentVersion });
  }

  if (currentVersion < version) {
    for (var i = startIdx; i < endIdx; i++) {
      migrate("up", i + 1);
      currentVersion = self._list[i + 1].version;
    }
  } else {
    for (var i = startIdx; i > endIdx; i--) {
      migrate("down", i);
      currentVersion = self._list[i - 1].version;
    }
  }

  unlock();
  log.info("Finished migrating.");
};

// gets the current control record, optionally creating it if non-existant
Migrations._getControl = function () {
  var control = this._collection.findOne({ _id: "control" });

  return control || this._setControl({ version: 0, locked: false });
};

// sets the control record
Migrations._setControl = function (control) {
  // be quite strict
  check(control.version, Number);
  check(control.locked, Boolean);

  this._collection.update(
    { _id: "control" },
    { $set: { version: control.version, locked: control.locked } },
    { upsert: true }
  );

  return control;
};

// returns the migration index in _list or throws if not found
Migrations._findIndexByVersion = function (version) {
  for (var i = 0; i < this._list.length; i++) {
    if (this._list[i].version === version) return i;
  }

  throw new Meteor.Error("Can't find migration version " + version);
};

//reset (mainly intended for tests)
Migrations._reset = function () {
  this._list = [{ version: 0, up: function () {} }];
  this._collection.remove({});
};

// unlock control
Migrations.unlock = function () {
  this._collection.update({ _id: "control" }, { $set: { locked: false } });
};
