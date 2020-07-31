import { Bundle } from "@kaviar/core";
import { MongoClientOptions } from "mongodb";
import { MONGO_URL, MONGO_CONNECTION_OPTIONS } from "./constants";
import { DatabaseService } from "./services/DatabaseService";

export interface IMongoBundleConfigType {
  uri: string;
  options?: MongoClientOptions;
}

export class MongoBundle extends Bundle<IMongoBundleConfigType> {
  async prepare() {
    this.container.set(MONGO_URL, this.config.uri);
    this.container.set(MONGO_CONNECTION_OPTIONS, this.config.options || {});
    const databaseService = this.container.get(DatabaseService);
    await databaseService.init();
  }

  async init() {}
}
