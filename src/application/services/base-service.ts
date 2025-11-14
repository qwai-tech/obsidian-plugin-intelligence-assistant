// Base service class
export class BaseService {
  protected ready: boolean = false;

  initialize(): Promise<void> {
    this.ready = true;
    return Promise.resolve();
  }

  cleanup(): Promise<void> {
    this.ready = false;
    return Promise.resolve();
  }
}
