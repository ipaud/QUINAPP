import assert from 'node:assert/strict';
import { normalizeSongKey } from '../apps/api/src/lib/songs.mjs';

const a = normalizeSongKey({ artist: '  ROSALÍA ', title: '  Despechá  ' });
const b = normalizeSongKey({ artist: 'rosalia', title: 'despecha' });
const c = normalizeSongKey({ artist: 'Daft Punk', title: 'Get Lucky' });

assert.equal(a, b, 'Debe ignorar acentos, case y espacios laterales');
assert.notEqual(a, c, 'Canciones distintas no deben colisionar');

console.log('unit-normalize passed');
