// Base Obsidian repository as specified in architecture
import { Vault } from 'obsidian';
import type { IRepository } from '../../../core/interfaces/repository.interface';
import type { EntitySerializer } from './types';

export abstract class BaseObsidianRepository<T> implements IRepository<T> {
  constructor(
    protected readonly vault: Vault,
    protected readonly basePath: string,
    protected readonly serializer: EntitySerializer<T>
  ) {}

  async save(entity: T): Promise<T> {
    const filePath = this.getFilePath(this.getEntityId(entity));
    const content = this.serializer.serialize(entity);
    await this.vault.adapter.write(filePath, content);
    return entity;
  }

  async findById(id: string): Promise<T | null> {
    const filePath = this.getFilePath(id);
    if (!(await this.vault.adapter.exists(filePath))) {
      return null;
    }
    const content = await this.vault.adapter.read(filePath);
    return this.serializer.deserialize(content);
  }

  async findAll(): Promise<T[]> {
    const files = await this.vault.adapter.list(this.basePath);
    const entities: T[] = [];
    
    for (const file of files.files) {
      if (file.endsWith('.json')) { // Assuming JSON files
        const content = await this.vault.adapter.read(file);
        const entity = this.serializer.deserialize(content);
        if (entity) {
          entities.push(entity);
        }
      }
    }
    
    return entities;
  }

  async update(id: string, updates: Partial<T>): Promise<T> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error(`Entity with id ${id} not found`);
    }
    
    const updatedEntity = { ...existing, ...updates } as T;
    return await this.save(updatedEntity);
  }

  async delete(id: string): Promise<boolean> {
    const filePath = this.getFilePath(id);
    if (!(await this.vault.adapter.exists(filePath))) {
      return false;
    }
    await this.vault.adapter.remove(filePath);
    return true;
  }

  protected getFilePath(id: string): string {
    return `${this.basePath}/${id}.json`;
  }

  protected abstract getEntityId(entity: T): string;
}
