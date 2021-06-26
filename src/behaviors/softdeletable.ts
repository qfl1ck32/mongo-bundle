import { BehaviorType, ISoftdeletableBehaviorOptions } from "../defs";
import { Collection } from "../models/Collection";
import { FilterQuery, CollectionAggregationOptions } from "mongodb";
import { BeforeRemoveEvent, AfterRemoveEvent } from "../events";
import { IAstToQueryOptions } from "../../../nova/dist/core/defs";
import { QueryBodyType } from "@kaviar/nova";

export default function softdeletable(
  options: ISoftdeletableBehaviorOptions = {}
): BehaviorType {
  const fields = options.fields || {
    isDeleted: "isDeleted",
    deletedAt: "deletedAt",
    deletedBy: "deletedBy",
  };

  const userIdFieldInContext = "userId";

  const extractUserID = (context) => {
    if (!context) {
      return null;
    }

    return context[userIdFieldInContext] || null;
  };

  return (collection: Collection<any>) => {
    // To refactor, deleteOne and deleteMany share so much code, that it can be put in 1.
    collection.onInit(() => {
      collection.collection.createIndex({
        [fields.isDeleted]: 1,
      });
    });

    collection.deleteOne = async (filter: FilterQuery<any>, options?: any) => {
      await collection.emit(
        new BeforeRemoveEvent({
          filter,
          isMany: false,
          context: options?.context,
        })
      );

      // We do it directly on the collection to avoid event dispatching
      const result = await collection.collection.updateOne(
        getPreparedFiltersForSoftdeletion(filter, fields.isDeleted),
        {
          $set: {
            [fields.isDeleted]: true,
            [fields.deletedAt]: new Date(),
            [fields.deletedBy]: extractUserID(options?.context),
          },
        }
      );

      await collection.emit(
        new AfterRemoveEvent({
          filter,
          isMany: false,
          context: options?.context,
          result,
        })
      );

      // Hackish, should we "map" it to the DeleteWriteREsponse?
      return result as any;
    };

    collection.deleteMany = async (filter: FilterQuery<any>, options?: any) => {
      await collection.emit(
        new BeforeRemoveEvent({
          filter,
          isMany: true,
          context: options?.context,
        })
      );

      // We do it directly on the collection to avoid event dispatching
      const result = await collection.collection.updateMany(
        getPreparedFiltersForSoftdeletion(filter, fields.isDeleted),
        {
          $set: {
            [fields.isDeleted]: true,
            [fields.deletedAt]: new Date(),
            [fields.deletedBy]: extractUserID(options?.context),
          },
        },
        options
      );

      await collection.emit(
        new BeforeRemoveEvent({
          filter,
          isMany: true,
          context: options?.context,
        })
      );

      return result as any;
    };

    const overrides = [
      "find",
      "findOne",
      "findOneAndDelete",
      "findOneAndUpdate",
      "updateOne",
      "updateMany",
    ];

    // For all of them the filter field is the first argument
    overrides.forEach((override) => {
      const old = collection[override];
      collection[override] = (filter: FilterQuery<any>, ...args: any[]) => {
        return old.call(
          collection,
          getPreparedFiltersForSoftdeletion(filter, fields.isDeleted),
          ...args
        );
      };
    });

    const oldAggregate = collection.aggregate;
    collection.aggregate = (
      pipeline: any[],
      options?: CollectionAggregationOptions
    ) => {
      // Search for pipeline a $match containing the isDeleted field
      let containsIsDeleted = false;
      for (const pipe of pipeline) {
        if (pipe.$match && pipe.$match[fields.isDeleted] !== undefined) {
          containsIsDeleted = true;
          break;
        }
      }
      if (!containsIsDeleted) {
        pipeline = [
          {
            $match: { isDeleted: { $ne: true } },
          },
          ...pipeline,
        ];
      }

      return oldAggregate.call(collection, pipeline, options);
    };

    const oldQuery = collection.query;
    collection.query = (request: QueryBodyType<any>): Promise<any[]> => {
      if (!request.$) {
        request.$ = {};
      } else {
        if (!request.$.filters) {
          request.$.filters = {};
        }
      }
      request.$.filters = getPreparedFiltersForSoftdeletion(
        request.$.filters,
        fields.isDeleted
      );

      return oldQuery.call(collection, request);
    };

    const oldQueryGraphQL = collection.queryGraphQL;
    collection.queryGraphQL = (
      ast: any,
      config?: IAstToQueryOptions
    ): Promise<any[]> => {
      if (!config) {
        config = {};
      }
      if (!config.filters) {
        config.filters = {};
      }
      config.filters = getPreparedFiltersForSoftdeletion(
        config.filters,
        fields.isDeleted
      );

      return oldQueryGraphQL.call(collection, ast, config);
    };
  };
}

function getPreparedFiltersForSoftdeletion(filter, deleteFieldName) {
  if (filter[deleteFieldName] === undefined) {
    filter = Object.assign({}, filter);
    filter[deleteFieldName] = {
      $ne: true,
    };
  }

  return filter;
}
