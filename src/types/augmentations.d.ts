declare global {
  interface CanvasRenderingContext2D {
    roundRect?(
      x: number,
      y: number,
      width: number,
      height: number,
      radii?: number | DOMPointInit | Array<number | DOMPointInit>
    ): void;
  }
}

export {};
