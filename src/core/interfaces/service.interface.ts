// Service interface
export interface IService {
  name: string;
  version: string;
  initialize(_config?: unknown): Promise<void>;
  cleanup(): Promise<void>;
}