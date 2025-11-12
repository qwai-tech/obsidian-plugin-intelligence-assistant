// Service interface
export interface IService {
  name: string;
  version: string;
  initialize(config?: any): Promise<void>;
  cleanup(): Promise<void>;
}