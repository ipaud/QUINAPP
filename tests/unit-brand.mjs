import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { symbolSvg } from '../apps/api/src/lib/brand.mjs';

// Web SVGs are generated from brand.mjs; fail if someone edits one side only.
for (const [variant, file] of [['principal', ''], ['mono', '-mono'], ['negatiu', '-negatiu']]) {
  const onDisk = readFileSync(new URL(`../apps/web/brand/quinapp-symbol${file}.svg`, import.meta.url), 'utf8');
  assert.equal(onDisk, symbolSvg(variant), `quinapp-symbol${file}.svg out of sync: run node scripts/brand-assets.mjs`);
}

console.log('unit-brand passed');
