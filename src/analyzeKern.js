#!/usr/bin/env node
// Reads googleFontsKern.json, produces:
//   kernSorted.json   — flat {pair: value} sorted by absolute kerning value (desc)
//   kernGroups.json   — top 20% split into 9 natural-break groups

const fs = require('fs');
const path = require('path');

const INPUT  = path.join(__dirname, 'googleFontsKern.json');
const OUT1   = path.join(__dirname, 'kernSorted.json');
const OUT2   = path.join(__dirname, 'kernGroups.json');

// --- 1. Flatten nested structure → [{pair, value, abs}] ---
const data = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
const pairs = [];
for (const [left, rights] of Object.entries(data)) {
    for (const [right, value] of Object.entries(rights)) {
        pairs.push({ pair: left + right, value, abs: Math.abs(value) });
    }
}

// --- 2. Sort by absolute value descending ---
pairs.sort((a, b) => b.abs - a.abs);

// --- 3. Write flat sorted JSON ---
const sorted = {};
for (const { pair, value } of pairs) {
    sorted[pair] = value;
}
fs.writeFileSync(OUT1, JSON.stringify(sorted, null, 2));
console.log(`Wrote ${pairs.length} pairs → ${OUT1}`);

// --- 4. Take top 20% ---
const top = pairs.slice(0, Math.ceil(pairs.length * 0.2));

// --- 5. Find natural breaks via largest gaps between consecutive absolute values ---
// "Häufung": values that cluster together stay in one group; large gaps become boundaries.
const absVals = top.map(p => p.abs);
const gaps = [];
for (let i = 0; i < absVals.length - 1; i++) {
    gaps.push({ idx: i + 1, gap: absVals[i] - absVals[i + 1] });
}

// Use exactly 9 groups: natural breaks with minimum group size constraint.
// Greedily pick the largest gaps, skipping any that would create a group below minSize.
const numGroups = 9;
const minSize = Math.round(top.length * 0.03); // at least 3% of top-20% per group
console.log(`Top 20%: ${top.length} pairs → ${numGroups} groups (natural breaks, minSize=${minSize})`);

const sortedByGap = [...gaps].sort((a, b) => b.gap - a.gap);
const chosen = [];
for (const g of sortedByGap) {
    if (chosen.length === numGroups - 1) break;
    const candidate = [...chosen, g.idx].sort((a, b) => a - b);
    const bounds = [0, ...candidate, top.length];
    const allLargeEnough = bounds.every((b, i) => i === 0 || (b - bounds[i - 1]) >= minSize);
    if (allLargeEnough) chosen.push(g.idx);
}
console.log(`  → found ${chosen.length} valid boundaries`);
const boundaryIdxs = new Set(chosen);

// --- 6. Split top pairs at those boundaries ---
const groups = [];
let current = [];
for (let i = 0; i < top.length; i++) {
    if (boundaryIdxs.has(i) && current.length > 0) {
        groups.push(current);
        current = [];
    }
    current.push(top[i]);
}
if (current.length > 0) groups.push(current);

// Build output: array of group objects
const groupsOut = groups.map((slice, g) => {
    const absMax = slice[0].abs.toFixed(2);
    const absMin = slice[slice.length - 1].abs.toFixed(2);
    const label  = `group_${String(g + 1).padStart(2, '0')}_abs${absMax}-${absMin}`;
    const obj = {};
    for (const { pair, value } of slice) obj[pair] = value;
    return { [label]: obj };
});
fs.writeFileSync(OUT2, JSON.stringify(groupsOut, null, 2));
console.log(`Wrote ${numGroups} groups → ${OUT2}`);
