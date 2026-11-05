import { describe, expect, it, vi } from 'vitest';

describe('Nachrüstungen für ältere WebKit-Versionen (macOS)', () => {
  it('structuredClone wird ergänzt, wenn es fehlt', async () => {
    const g = globalThis as unknown as { structuredClone?: unknown };
    const orig = g.structuredClone;
    try {
      delete g.structuredClone;
      vi.resetModules();
      await import('../../src/polyfills');
      const src = { a: 1, b: [1, 2, { c: 'x' }], d: new Float32Array([1, 2]), m: new Map([[1, { z: 2 }]]) };
      const copy = (globalThis as unknown as { structuredClone<T>(v: T): T }).structuredClone(src);
      expect(copy).toEqual(src);
      expect(copy.b).not.toBe(src.b);
      expect(copy.d).not.toBe(src.d);
      expect(copy.m.get(1)).not.toBe(src.m.get(1));
    } finally {
      g.structuredClone = orig;
    }
  });
});
