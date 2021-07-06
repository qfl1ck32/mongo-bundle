import {
  CollectionAggregationOptions,
  CommonOptions,
  FilterQuery,
} from "mongodb";
import {
  BehaviorType,
  IContextAware,
  ISoftdeletableBehaviorOptions,
} from "../defs";
import { AfterRemoveEvent, BeforeRemoveEvent } from "../events";
import { Collection } from "../models/Collection";

interface IDeleteOneOrManySettings {
  isMany: boolean;
}

export default function softdeletable(
  options: ISoftdeletableBehaviorOptions = {}
): BehaviorType {
  const fields = Object.assign(
    {
      isDeleted: "isDeleted",
      deletedAt: "deletedAt",
      deletedBy: "deletedBy",
    },
    options.fields
  );

  const userIdFieldInContext = "userId";

  const extractUserID = (context: any) => {
    if (!context) {
      return null;
    }

    return context[userIdFieldInContext] || null;
  };

  const deleteOneOrMany = async (
    filter: FilterQuery<any>,
    options: IContextAware & CommonOptions,
    collection: Collection<any>,
    settings: IDeleteOneOrManySettings
  ) => {
    const { isMany } = settings;

    await collection.emit(
      new BeforeRemoveEvent({
        filter,
        isMany,
        context: options?.context,
      })
    );

    const updateMethod = (
      isMany
        ? collection.collection.updateMany
        : collection.collection.updateOne
    ).bind(collection.collection);

    // We do it directly on the collection to avoid event dispatching
    const result = await updateMethod(
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
      new AfterRemoveEvent({
        filter,
        isMany,
        context: options?.context,
        result,
      })
    );

    // Hackish, should we "map" it to the DeleteWriteREsponse?
    return result as any;
  };

  return (collection: Collection<any>) => {
    collection.deleteOne = async (filter, options) => {
      return deleteOneOrMany(filter, options, collection, { isMany: false });
    };

    collection.deleteMany = async (filter, options) => {
      return deleteOneOrMany(filter, options, collection, { isMany: true });
    };

    const overrides = [
      "find",
      "findOne",
      "findOneAndDelete",
      "findOneAndUpdate",
      "updateOne",
      "updateMany",
      "count",
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
  };
}

function getPreparedFiltersForSoftdeletion(
  filter: FilterQuery<any>,
  isDeletedField: string
) {
  filter = Object.assign({}, filter);
  if (filter[isDeletedField] === undefined) {
    filter = Object.assign({}, filter);
    filter[isDeletedField] = {
      $ne: true,
    };
  }

  return filter;
}
