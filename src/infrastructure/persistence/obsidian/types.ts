// Entity serializer type
export interface EntitySerializer<T> {
  serialize(entity: T): string;
  deserialize(content: string): T;
}