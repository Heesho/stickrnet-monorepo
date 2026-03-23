import { Bytes, JSONValue, JSONValueKind, TypedMap, dataSource, json } from "@graphprotocol/graph-ts";
import { IpfsMetadata } from "../generated/schema";

function getStringField(value: TypedMap<string, JSONValue>, key: string): string | null {
  let field = value.get(key);
  if (field == null || field.kind == JSONValueKind.NULL) return null;
  if (field.kind != JSONValueKind.STRING) return null;
  return field.toString();
}

function getStringArrayField(value: TypedMap<string, JSONValue>, key: string): string[] {
  let field = value.get(key);
  let items = new Array<string>();
  if (field == null || field.kind != JSONValueKind.ARRAY) return items;

  let arr = field.toArray();
  for (let i = 0; i < arr.length; i++) {
    let item = arr[i];
    if (item.kind == JSONValueKind.STRING) {
      items.push(item.toString());
    }
  }

  return items;
}

export function handleMetadata(content: Bytes): void {
  let value = json.fromBytes(content);
  if (value.kind != JSONValueKind.OBJECT) return;

  let obj = value.toObject();
  let id = dataSource.stringParam();
  let metadata = new IpfsMetadata(id);

  metadata.name = getStringField(obj, "name");
  metadata.symbol = getStringField(obj, "symbol");
  metadata.imageUri = getStringField(obj, "image");
  metadata.description = getStringField(obj, "description");
  metadata.defaultMessage = getStringField(obj, "defaultMessage");
  metadata.recipientName = getStringField(obj, "recipientName");
  metadata.links = getStringArrayField(obj, "links");

  metadata.save();
}
