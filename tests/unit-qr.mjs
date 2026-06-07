import assert from 'node:assert/strict';
import { buildCardQrQuery, decodeAndVerifyQrQuery } from '../apps/api/src/lib/qr.mjs';

function makeFixture() {
  return {
    session: { pin: 'ABCD1' },
    card: {
      id: 'card-1',
      number: 1,
      songs: [
        { artist: 'Beyoncé', title: 'Cuff It' },
        { artist: 'Rosalía', title: 'Despechá' },
      ],
    },
  };
}

const prevSecret = process.env.QR_HMAC_SECRET;
try {
  process.env.QR_HMAC_SECRET = 'unit-secret-1';
  const { session, card } = makeFixture();
  const qrUrl = buildCardQrQuery('http://127.0.0.1:8787', session, card);
  const parsed = new URL(qrUrl);
  const d = parsed.searchParams.get('d');
  const s = parsed.searchParams.get('s');

  assert.ok(d, 'Debe generar payload d');
  assert.ok(s, 'Debe generar firma s');

  const payload = decodeAndVerifyQrQuery(d, s);
  assert.equal(payload.pin, session.pin);
  assert.equal(payload.cardId, card.id);
  assert.equal(payload.cardNumber, card.number);
  assert.equal(typeof payload.songsHash, 'string');
  assert.equal(payload.songsHash.length, 16);

  assert.throws(() => decodeAndVerifyQrQuery(`${d}x`, s), /firma incorrecta/i);
  assert.throws(() => decodeAndVerifyQrQuery(d, `${s}a`), /firma incorrecta/i);

  process.env.QR_HMAC_SECRET = 'unit-secret-2';
  assert.throws(() => decodeAndVerifyQrQuery(d, s), /firma incorrecta/i);

  console.log('unit-qr passed');
} finally {
  if (prevSecret === undefined) {
    delete process.env.QR_HMAC_SECRET;
  } else {
    process.env.QR_HMAC_SECRET = prevSecret;
  }
}
