/**
 * Deterministischer Zufallsgenerator (sfc32) – nur Ganzzahl-Operationen,
 * daher auf allen Plattformen bitgleich. Zustand ist serialisierbar.
 */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    this.a = 0x9e3779b9;
    this.b = 0x243f6a88;
    this.c = 0xb7e15162;
    this.d = seed >>> 0;
    for (let i = 0; i < 15; i++) this.nextU32();
  }

  nextU32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Gleichverteilt in [0, 1) */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /** Ganzzahl in [0, n) */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** Ganzzahl in [min, max] */
  range(min: number, max: number): number {
    return min + this.int(max - min + 1);
  }

  getState(): [number, number, number, number] {
    return [this.a, this.b, this.c, this.d];
  }

  setState(s: [number, number, number, number]): void {
    [this.a, this.b, this.c, this.d] = s;
  }
}
