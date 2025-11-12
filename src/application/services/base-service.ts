// Base service class
export class BaseService {
  protected ready: boolean = false;

  async initialize(): Promise<void> {
    this.ready = true;
  }

  async cleanup(): Promise<void> {
    this.ready = false;
  }
}