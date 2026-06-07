import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let cachedSecret = null;
let warnedDevQrSecret = false;

function resolveSecretPath() {
  const dataDir = process.env.QUINAPP_DATA_DIR
    ? path.resolve(process.env.QUINAPP_DATA_DIR)
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../data');
  return path.join(dataDir, 'qr-secret.key');
}

// Persist a random per-install HMAC secret. Avoids shipping a known hardcoded
// secret in the packaged app (which would let anyone forge valid QR payloads).
export function getQrSecret() {
  if (process.env.QR_HMAC_SECRET && process.env.QR_HMAC_SECRET.trim()) {
    return process.env.QR_HMAC_SECRET.trim();
  }
  if (cachedSecret) return cachedSecret;

  const file = resolveSecretPath();
  try {
    if (existsSync(file)) {
      const existing = readFileSync(file, 'utf8').trim();
      if (existing) {
        cachedSecret = existing;
        return cachedSecret;
      }
    }
    const generated = randomBytes(32).toString('hex');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, generated, { mode: 0o600 });
    cachedSecret = generated;
    return cachedSecret;
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('No se pudo inicializar el secreto QR persistente');
    }
    if (!warnedDevQrSecret) {
      warnedDevQrSecret = true;
      // eslint-disable-next-line no-console
      console.warn('[QR] Secreto persistente no disponible; usando secreto efímero en memoria');
    }
    cachedSecret = randomBytes(32).toString('hex');
    return cachedSecret;
  }
}

export function b64urlEncodeBuffer(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function b64urlDecodeToBuffer(str) {
  const base = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = base.length % 4 === 0 ? '' : '='.repeat(4 - (base.length % 4));
  return Buffer.from(base + pad, 'base64');
}

export function signQrPayloadData(data) {
  const secret = getQrSecret();
  return createHmac('sha256', secret).update(data).digest('hex');
}

export function timingSafeHexEqual(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function buildCardQrQuery(baseUrl, session, card) {
  const songsHash = createHash('sha256')
    .update(JSON.stringify(card.songs.map((s) => ({ artist: s.artist, title: s.title }))), 'utf8')
    .digest('hex')
    .slice(0, 16);
  const payload = {
    v: 1,
    pin: session.pin,
    cardId: card.id,
    cardNumber: card.number,
    songsHash,
    issuedAt: Date.now(),
    nonce: randomBytes(6).toString('hex'),
  };
  const d = b64urlEncodeBuffer(Buffer.from(JSON.stringify(payload), 'utf8'));
  const s = signQrPayloadData(d);
  const u = new URL('/validate-card', baseUrl);
  u.searchParams.set('d', d);
  u.searchParams.set('s', s);
  return u.toString();
}

export function buildPlayCardUrl(baseUrl, pin, cardId) {
  const u = new URL('/play-card', baseUrl);
  u.searchParams.set('pin', pin);
  u.searchParams.set('card', cardId);
  return u.toString();
}

export function decodeAndVerifyQrQuery(d, s) {
  if (!d || !s) throw new Error('QR invalido: faltan parametros');
  const expected = signQrPayloadData(d);
  if (!timingSafeHexEqual(expected, s)) throw new Error('QR invalido: firma incorrecta');
  let payload;
  try {
    payload = JSON.parse(b64urlDecodeToBuffer(d).toString('utf8'));
  } catch {
    throw new Error('QR invalido: payload corrupto');
  }
  if (!payload || payload.v !== 1 || !payload.pin || !payload.cardId) {
    throw new Error('QR invalido: payload incompleto');
  }
  return payload;
}
