// Certificat HTTPS autosignat per a ús en LAN (perquè la càmera del mòbil
// funcioni: getUserMedia exigeix context segur). Es persisteix a data/ i es
// regenera si canvien les IPs de la xarxa local.
import selfsigned from 'selfsigned';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function dataDir() {
  return process.env.QUINAPP_DATA_DIR
    ? path.resolve(process.env.QUINAPP_DATA_DIR)
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../data');
}

export function lanIps() {
  const ips = [];
  const ifaces = os.networkInterfaces();
  for (const entries of Object.values(ifaces)) {
    for (const inf of entries || []) {
      if (!inf || inf.internal || inf.family !== 'IPv4' || !inf.address) continue;
      ips.push(inf.address);
    }
  }
  return ips;
}

export async function getOrCreateCert() {
  const dir = dataDir();
  const certPath = path.join(dir, 'cert.pem');
  const keyPath = path.join(dir, 'key.pem');
  const metaPath = path.join(dir, 'cert.meta.json');
  const ips = lanIps();

  try {
    if (fs.existsSync(certPath) && fs.existsSync(keyPath) && fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      const covered = ips.every((ip) => (meta.ips || []).includes(ip));
      if (covered) {
        return { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) };
      }
    }
  } catch {
    // regenera
  }

  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' },
    ...ips.map((ip) => ({ type: 7, ip })),
  ];
  // selfsigned v5: generate() és asíncron (webcrypto).
  const pems = await selfsigned.generate([{ name: 'commonName', value: 'QUINAPP' }], {
    days: 3650,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [{ name: 'subjectAltName', altNames }],
  });

  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(keyPath, pems.private, { mode: 0o600 });
    fs.writeFileSync(certPath, pems.cert, { mode: 0o600 });
    fs.writeFileSync(metaPath, JSON.stringify({ ips, createdAt: new Date().toISOString() }), { mode: 0o600 });
  } catch {
    // efímer en memòria si no es pot escriure
  }
  return { cert: pems.cert, key: pems.private };
}
