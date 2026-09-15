import { describe, expect, it } from 'vitest';
import { fitWithin, MAX_PHOTO_EDGE } from './image';

describe('photo sizing', () => {
  it('leaves small images alone', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(MAX_PHOTO_EDGE, 400)).toEqual({ width: MAX_PHOTO_EDGE, height: 400 });
  });

  it('caps the longest edge and keeps the aspect ratio', () => {
    // A 12 MP phone photo, portrait.
    expect(fitWithin(3024, 4032)).toEqual({ width: 960, height: 1280 });
    // Landscape.
    expect(fitWithin(4032, 3024)).toEqual({ width: 1280, height: 960 });
  });

  it('honours a custom cap', () => {
    expect(fitWithin(2000, 1000, 500)).toEqual({ width: 500, height: 250 });
  });

  it('handles square and extreme ratios without rounding to zero', () => {
    expect(fitWithin(2000, 2000)).toEqual({ width: 1280, height: 1280 });
    const thin = fitWithin(4000, 20);
    expect(thin.width).toBe(1280);
    expect(thin.height).toBeGreaterThanOrEqual(1);
  });
});
