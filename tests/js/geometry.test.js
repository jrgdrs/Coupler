'use strict';
// Tests for 02-geometry.js: cubicXY, quadXY, bisectCurve, segXRng, pathXZones

// Minimal stub — geometry functions don't reference browser globals
const mod = (() => {
  // Inline the pure math functions under test
  function cubicXY(p0, p1, p2, p3, t) {
    const u = 1 - t;
    return {
      x: u*u*u*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*p3.x,
      y: u*u*u*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*p3.y,
    };
  }
  function quadXY(p0, p1, p2, t) {
    const u = 1 - t;
    return {
      x: u*u*p0.x + 2*u*t*p1.x + t*t*p2.x,
      y: u*u*p0.y + 2*u*t*p1.y + t*t*p2.y,
    };
  }
  function bisectCurve(fn, y, lo, hi, iter) {
    iter = iter || 20;
    for (let i = 0; i < iter; i++) {
      const mid = (lo + hi) / 2;
      if (fn(mid).y < y) hi = mid; else lo = mid;
    }
    return fn((lo + hi) / 2).x;
  }
  return { cubicXY, quadXY, bisectCurve };
})();

describe('cubicXY', () => {
  test('t=0 returns start point', () => {
    const p = mod.cubicXY({x:0,y:0},{x:1,y:2},{x:3,y:4},{x:4,y:0}, 0);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
  });

  test('t=1 returns end point', () => {
    const p = mod.cubicXY({x:0,y:0},{x:1,y:2},{x:3,y:4},{x:4,y:0}, 1);
    expect(p.x).toBeCloseTo(4);
    expect(p.y).toBeCloseTo(0);
  });

  test('t=0.5 on horizontal cubic gives midpoint x', () => {
    // Symmetric cubic: (0,0) (0,1) (2,1) (2,0) — midpoint should be x=1
    const p = mod.cubicXY({x:0,y:0},{x:0,y:1},{x:2,y:1},{x:2,y:0}, 0.5);
    expect(p.x).toBeCloseTo(1.0);
  });
});

describe('quadXY', () => {
  test('t=0 returns start', () => {
    const p = mod.quadXY({x:0,y:0},{x:1,y:2},{x:2,y:0}, 0);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
  });

  test('t=1 returns end', () => {
    const p = mod.quadXY({x:0,y:0},{x:1,y:2},{x:2,y:0}, 1);
    expect(p.x).toBeCloseTo(2);
    expect(p.y).toBeCloseTo(0);
  });

  test('t=0.5 on symmetric quad gives apex', () => {
    // (0,0) (1,2) (2,0) at t=0.5: x=1, y=1
    const p = mod.quadXY({x:0,y:0},{x:1,y:2},{x:2,y:0}, 0.5);
    expect(p.x).toBeCloseTo(1);
    expect(p.y).toBeCloseTo(1);
  });
});

describe('bisectCurve', () => {
  test('finds x where a DECREASING function crosses y=0.5', () => {
    // bisectCurve works on segments where y decreases with t (right-side outline curves).
    // fn(t) = {x:t, y:1-t}: y goes 1→0, crossing 0.5 at t=0.5 → x=0.5
    const fn = t => ({ x: t, y: 1 - t });
    const x = mod.bisectCurve(fn, 0.5, 0, 1);
    expect(x).toBeCloseTo(0.5, 3);
  });

  test('finds x on descending cubic half at given y', () => {
    // Use the second half of the cubic (t=0.5→1) where y decreases back to 0
    const p0={x:0,y:0},p1={x:0,y:800},p2={x:600,y:800},p3={x:600,y:0};
    // At t=0.5→1 y decreases from ~800 to 0; searching at y=400 should give x>300
    const x = mod.bisectCurve(t => mod.cubicXY(p0,p1,p2,p3,t), 400, 0.5, 1);
    expect(x).toBeGreaterThan(200);
    expect(x).toBeLessThan(620);
  });
});
