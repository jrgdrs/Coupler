'use strict';
// Tests for the kerning correction pipeline: outputPairs, pairMean, correction formula

// Inline the core correction logic (extracted from 07-output.js / 05-compute-browser.js)

function rtm(v, mod) {
  if (mod <= 0) return Math.round(v);
  return Math.round(v / mod) * mod;
}

function computeCorrection({ pairMean, base, lazy, round, threshold, mingap, minGapActual }) {
  // base - pairMean = raw correction; negative = tighten
  let raw = base - pairMean;
  // Lazy reduction
  if (lazy > 0) raw = raw * (1 - lazy / 100);
  // Round to module
  let corr = rtm(raw, round);
  // Min gap floor: if applying corr would close gap below minGapActual
  if (mingap > 0 && minGapActual !== undefined) {
    const projected = minGapActual - corr; // applying negative corr tightens → gap shrinks
    if (projected < mingap) {
      corr = rtm(minGapActual - mingap, round);
    }
  }
  // Threshold: zero out small non-capped corrections
  if (Math.abs(corr) < threshold) corr = 0;
  return corr;
}

function outputPairs(kerningData, pairlimit) {
  const nz = kerningData.filter(d => d.correction !== 0);
  return pairlimit > 0 ? nz.slice(0, pairlimit) : nz;
}

describe('computeCorrection', () => {
  test('negative correction tightens (pairMean > base)', () => {
    const c = computeCorrection({ pairMean: 200, base: 150, lazy: 0, round: 20, threshold: 0 });
    expect(c).toBe(-40); // rtm(150-200, 20) = rtm(-50, 20) = -60? Wait: base-pairMean = 150-200 = -50, rtm(-50,20)=-60? No: round(-50/20)*20 = round(-2.5)*20 = -2*20=-40 (JS rounds half away from zero for negative... actually Math.round(-2.5)=-2)
    // Math.round(-50/20) = Math.round(-2.5) = -2 → -2*20 = -40
    expect(c).toBeLessThan(0);
  });

  test('positive correction loosens (pairMean < base)', () => {
    const c = computeCorrection({ pairMean: 100, base: 150, lazy: 0, round: 20, threshold: 0 });
    // base-pairMean = 50, rtm(50,20)=60? Math.round(50/20)*20 = Math.round(2.5)*20 = 3*20=60
    expect(c).toBeGreaterThan(0);
  });

  test('lazy=20 reduces magnitude', () => {
    const full = computeCorrection({ pairMean: 200, base: 100, lazy: 0,  round: 1, threshold: 0 });
    const lazy = computeCorrection({ pairMean: 200, base: 100, lazy: 20, round: 1, threshold: 0 });
    expect(Math.abs(lazy)).toBeLessThan(Math.abs(full));
  });

  test('threshold zeroes out small corrections', () => {
    const c = computeCorrection({ pairMean: 195, base: 200, lazy: 0, round: 1, threshold: 10 });
    expect(c).toBe(0);
  });

  test('threshold keeps large corrections intact', () => {
    const c = computeCorrection({ pairMean: 100, base: 200, lazy: 0, round: 1, threshold: 10 });
    expect(c).not.toBe(0);
  });

  test('round module snaps to grid', () => {
    const c = computeCorrection({ pairMean: 173, base: 100, lazy: 0, round: 20, threshold: 0 });
    // Use Math.abs to handle -0 vs 0 distinction in JS modulo
    expect(Math.abs(c % 20)).toBe(0);
  });
});

describe('outputPairs', () => {
  const data = [
    { left: 'A', right: 'V', correction: -40 },
    { left: 'T', right: 'a', correction: -20 },
    { left: 'n', right: 'n', correction: 0  },
    { left: 'V', right: 'A', correction: -60 },
  ];

  test('filters zero corrections', () => {
    const out = outputPairs(data, 0);
    expect(out.every(d => d.correction !== 0)).toBe(true);
    expect(out.length).toBe(3);
  });

  test('pairlimit=0 returns all non-zero', () => {
    expect(outputPairs(data, 0).length).toBe(3);
  });

  test('pairlimit=2 caps at 2', () => {
    expect(outputPairs(data, 2).length).toBe(2);
  });

  test('pairlimit=1 returns only first non-zero pair', () => {
    const out = outputPairs(data, 1);
    expect(out.length).toBe(1);
    expect(out[0].left).toBe('A');
  });

  test('pairlimit larger than data returns all non-zero', () => {
    expect(outputPairs(data, 999).length).toBe(3);
  });
});
