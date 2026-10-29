declare global {
  interface CanvasRenderingContext2D {
    roundRect?(
      _x: number,
      _y: number,
      _width: number,
      _height: number,
      _radii?: number | DOMPointInit | Array<number | DOMPointInit>
    ): void;
  }
}

export {};
