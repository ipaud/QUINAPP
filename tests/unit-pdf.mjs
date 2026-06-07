import assert from 'node:assert/strict';
import { buildCardsPdf } from '../apps/api/src/lib/pdf-cards.mjs';

process.env.QR_HMAC_SECRET = process.env.QR_HMAC_SECRET || 'unit-pdf-secret';

const session = {
  pin: 'PDF01',
  seed: 'seed-pdf',
  rows: 3,
  cols: 5,
};

const makeSongs = (offset = 0) => Array.from({ length: 15 }, (_, i) => ({
  artist: `Artista ${i + 1 + offset}`,
  title: i === 0 ? 'Cançó especial' : `Titulo ${i + 1 + offset}`,
}));

const cards = [
  { id: 'c1', number: 1, songs: makeSongs(0) },
  { id: 'c2', number: 2, songs: makeSongs(20) },
];

const bytesA5 = await buildCardsPdf(session, [cards[0]], {
  format: 'a5',
  preset: 'evento',
  showMeta: true,
  baseUrl: 'http://127.0.0.1:8787',
});
assert.ok(bytesA5.length > 1000, 'PDF A5 debe contener contenido');
assert.equal(Buffer.from(bytesA5).subarray(0, 4).toString('utf8'), '%PDF', 'Cabecera PDF valida');

const bytesA4 = await buildCardsPdf(session, cards, {
  format: 'a4-2up',
  preset: 'imprenta',
  showMeta: true,
  baseUrl: 'http://127.0.0.1:8787',
});
assert.ok(bytesA4.length > 1500, 'PDF A4 2up debe contener contenido');
assert.equal(Buffer.from(bytesA4).subarray(0, 4).toString('utf8'), '%PDF', 'Cabecera PDF valida');

console.log('unit-pdf passed');
