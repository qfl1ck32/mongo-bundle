import { Event } from "@kaviar/core";
import {
  FilterQuery,
  UpdateQuery,
  UpdateWriteOpResult,
  DeleteWriteOpResultObject,
} from "mongodb";
import { IGetFieldsResponse } from "./defs";
import { Collection } from "./models/Collection";
import { FindAndModifyWriteOpResultObject } from "mongodb";

export abstract class CollectionEvent<T> extends Event<T> {
  protected _collection: Collection<any>;

  get collection(): Collection<any> {
    return this._collection;
  }

  setCollection(collection: Collection<any>) {
    this._collection = collection;
  }
}

export class BeforeInsertEvent extends CollectionEvent<{
  document: any;
  context: any;
}> {}

export class AfterInsertEvent extends CollectionEvent<{
  document: any;
  _id: any;
  context: any;
}> {}

export class BeforeUpdateEvent extends CollectionEvent<{
  filter: FilterQuery<any>;
  update: UpdateQuery<any>;
  fields: IGetFieldsResponse;
  isMany: boolean;
  context: any;
}> {}

export class AfterUpdateEvent extends CollectionEvent<{
  filter: FilterQuery<any>;
  update: UpdateQuery<any>;
  fields: IGetFieldsResponse;
  isMany: boolean;
  context: any;
  result: UpdateWriteOpResult | FindAndModifyWriteOpResultObject<any>;
}> {}

export class BeforeRemoveEvent extends CollectionEvent<{
  filter: object;
  isMany: boolean;
  context: any;
}> {}

export class AfterRemoveEvent extends CollectionEvent<{
  filter: object;
  isMany: boolean;
  context: any;
  result: DeleteWriteOpResultObject | FindAndModifyWriteOpResultObject<any>;
}> {}
