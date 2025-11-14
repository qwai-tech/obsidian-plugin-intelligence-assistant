// Service interface
export interface IService {
  name: string;
  version: string;
  initialize(config?: unknown): Promise<void>;
  cleanup(): Promise<void>;
}