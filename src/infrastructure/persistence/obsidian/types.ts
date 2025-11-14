// Entity serializer type
export interface EntitySerializer<T> {
  serialize(_entity: T): string;
  deserialize(_content: string): T;
}