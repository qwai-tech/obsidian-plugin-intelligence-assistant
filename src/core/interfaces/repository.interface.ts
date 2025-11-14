// Repository interface
export interface IRepository<T> {
  save(_entity: T): Promise<T>;
  findById(_id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
  update(_id: string, _updates: Partial<T>): Promise<T>;
  delete(_id: string): Promise<boolean>;
}