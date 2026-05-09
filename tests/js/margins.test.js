'use strict';
// Tests for 03-margins.js: rtm (round-to-module), smoothMargins

// Inline pure math functions under test (no browser globals needed)
function rtm(v, mod) {
  if (mod <= 0) return Math.round(v);
  return Math.round(v / mod) * mod;
}

function smoothMargins(arr, pct) {
  if (!pct || pct <= 0 || arr.length < 2) return arr;
  const out = arr.slice();
  // Find index of maximum extent (smallest margin = closest to ink)
  let anchorIdx = 0;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] !== null && (arr[anchorIdx] === null || arr[i] < arr[anchorIdx])) {
      anchorIdx = i;
    }
  }
  const zH = 1; // normalized zone height for unit tests
  const maxDelta = pct / 100 * zH;
  // Smooth outward from anchor in both directions
  for (let i = anchorIdx - 1; i >= 0; i--) {
    if (out[i] === null || out[i+1] === null) continue;
    const delta = out[i] - out[i+1];
    if (delta > maxDelta) out[i] = out[i+1] + maxDelta;
  }
  for (let i = anchorIdx + 1; i < out.length; i++) {
    if (out[i] === null || out[i-1] === null) continue;
    const delta = out[i] - out[i-1];
    if (delta > maxDelta) out[i] = out[i-1] + maxDelta;
  }
  return out;
}

describe('rtm — round to module', () => {
  test('rounds to nearest multiple of 20', () => {
    // Math.round(5.5)=6 in JS, so rtm(110,20)=120 (rounds half-up)
    expect(rtm(110, 20)).toBe(120);
    expect(rtm(109, 20)).toBe(100);
    expect(rtm(115, 20)).toBe(120);
    expect(rtm(0, 20)).toBe(0);
    expect(rtm(-35, 20)).toBe(-40);
  });

  test('module=1 behaves like Math.round', () => {
    expect(rtm(3.6, 1)).toBe(4);
    expect(rtm(-3.6, 1)).toBe(-4);
  });

  test('module=0 falls back to Math.round', () => {
    expect(rtm(7.4, 0)).toBe(7);
  });

  test('handles large modules', () => {
    expect(rtm(1499, 1000)).toBe(1000);
    expect(rtm(1500, 1000)).toBe(2000);
  });
});

describe('smoothMargins', () => {
  test('no-op when pct=0', () => {
    const arr = [100, 50, 80];
    expect(smoothMargins(arr, 0)).toEqual([100, 50, 80]);
  });

  test('constrains upward jump from anchor', () => {
    // Anchor at index 1 (value 10), index 2 jumps to 100
    // With pct=10 and zH=1, maxDelta=0.1 → out[2] capped at 10.1
    const arr = [50, 10, 100];
    const out = smoothMargins(arr, 10);
    expect(out[2]).toBeCloseTo(10.1, 5);
  });

  test('leaves values inside limit unchanged', () => {
    const arr = [10, 10, 10];
    const out = smoothMargins(arr, 50);
    expect(out).toEqual([10, 10, 10]);
  });

  test('single element returns as-is', () => {
    expect(smoothMargins([42], 99)).toEqual([42]);
  });

  test('null zones are skipped', () => {
    const arr = [null, 10, 100];
    const out = smoothMargins(arr, 10);
    // null at 0 should not propagate
    expect(out[0]).toBeNull();
    expect(out[2]).toBeCloseTo(10.1, 5);
  });
});
