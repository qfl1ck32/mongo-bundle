import { Kernel, Bundle, ContainerInstance } from "@kaviar/core";
import { MongoBundle } from "../MongoBundle";
import { DatabaseService } from "../services/DatabaseService";

export async function createEcosystem(
  init?: any
): Promise<{ container: ContainerInstance; teardown: () => void }> {
  const kernel = new Kernel();
  kernel.addBundle(
    new MongoBundle({
      uri: "mongodb://localhost:27017/test",
    })
  );

  class AppBundle extends Bundle {
    async init() {
      if (init) {
        return init.call(this);
      }
    }
  }

  kernel.addBundle(new AppBundle());

  await kernel.init();

  const dbService = kernel.container.get<DatabaseService>(DatabaseService);
  await dbService.client.db("test").dropDatabase();

  return {
    container: kernel.container,
    teardown: async () => {
      await dbService.client.close();
    },
  };
}
