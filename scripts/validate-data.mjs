#!/usr/bin/env node
// Vérifie la cohérence de data.json : segments contigus et non chevauchants,
// bornes cohérentes avec firstYear/lastYear, années dans la plage déclarée.
// Usage : node scripts/validate-data.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dataPath = join(here, '..', 'data.json');

const data = JSON.parse(readFileSync(dataPath, 'utf8'));
const errors = [];

const years = data.years;
const minYear = Math.min(...years);
const maxYear = Math.max(...years);
const validCats = new Set(['world', 'pro', 'special']);

data.lineages.forEach((l) => {
  const label = `lignée #${l.id} (${l.segments[0] ? l.segments[0].name : '?'})`;
  const segs = l.segments;

  if (!Array.isArray(segs) || segs.length === 0) {
    errors.push(`${label} : aucun segment`);
    return;
  }

  segs.forEach((seg, i) => {
    if (seg.start > seg.end) errors.push(`${label} segment ${i} : start (${seg.start}) > end (${seg.end})`);
    if (seg.start < minYear || seg.end > maxYear) errors.push(`${label} segment ${i} : année hors plage ${minYear}-${maxYear}`);
    if (!validCats.has(seg.cat)) errors.push(`${label} segment ${i} : cat "${seg.cat}" inconnue`);
    if (seg.cat !== 'special' && !seg.country) errors.push(`${label} segment ${i} : pays manquant`);
  });

  for (let i = 0; i < segs.length - 1; i++) {
    if (segs[i].end + 1 !== segs[i + 1].start) {
      errors.push(`${label} : trou ou chevauchement entre segment ${i} (fin ${segs[i].end}) et segment ${i + 1} (début ${segs[i + 1].start})`);
    }
  }

  if (segs[0].start !== l.firstYear) errors.push(`${label} : firstYear (${l.firstYear}) ≠ début du premier segment (${segs[0].start})`);
  const lastEnd = segs[segs.length - 1].end;
  if (lastEnd !== l.lastYear) errors.push(`${label} : lastYear (${l.lastYear}) ≠ fin du dernier segment (${lastEnd})`);
});

const ids = data.lineages.map((l) => l.id);
const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dupIds.length > 0) errors.push(`ids dupliqués : ${[...new Set(dupIds)].join(', ')}`);

if (errors.length > 0) {
  console.error(`data.json invalide (${errors.length} erreur(s)) :`);
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}

console.log(`data.json OK — ${data.lineages.length} lignées, années ${minYear}-${maxYear}.`);
