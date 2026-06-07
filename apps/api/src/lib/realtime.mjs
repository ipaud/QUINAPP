export function getSseSet(sseClients, pin) {
  const key = String(pin);
  if (!sseClients.has(key)) sseClients.set(key, new Set());
  return sseClients.get(key);
}

export function broadcast(sseClients, pin, event, payload) {
  const clients = sseClients.get(String(pin));
  if (!clients || clients.size === 0) return;
  const packet = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    res.write(packet);
  }
}

export function startSsePing(sseClients, intervalMs = 15000) {
  return setInterval(() => {
    const packet = `event: ping\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`;
    for (const clients of sseClients.values()) {
      for (const res of clients) {
        res.write(packet);
      }
    }
  }, intervalMs);
}
