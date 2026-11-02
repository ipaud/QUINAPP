// Audience screen for a projector: /projector.html?pin=1234.
// Reads only public data (songs already drawn); it never asks for the next one.
const pin = new URLSearchParams(location.search).get('pin') || '';
const $ = (id) => document.getElementById(id);

async function refresh() {
  try {
    const [drawnRes, sessionRes] = await Promise.all([
      fetch(`/api/sessions/${encodeURIComponent(pin)}/drawn`),
      fetch(`/api/sessions/${encodeURIComponent(pin)}`),
    ]);
    if (!drawnRes.ok || !sessionRes.ok) throw new Error('missing');
    const { drawn = [] } = await drawnRes.json();
    const session = await sessionRes.json();
    const last = drawn[drawn.length - 1];
    $('projArtist').textContent = last ? last.artist : 'Esperant la primera cançó';
    $('projTitle').textContent = last ? last.title : '';
    $('projCounter').textContent = `${drawn.length} / ${session.songs ?? '—'}`;
  } catch {
    $('projArtist').textContent = 'Partida no trobada';
    $('projTitle').textContent = 'Obre aquesta pantalla des del botó «Projectar» de l’assistent.';
  }
}

function connect() {
  const es = new EventSource(`/api/sessions/${encodeURIComponent(pin)}/events`);
  ['draw.next', 'draw.undo', 'session.snapshot', 'session.updated'].forEach((name) => es.addEventListener(name, refresh));
  // EventSource retries by itself; resync when the laptop wakes up.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}

document.body.addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
});

refresh();
if (pin) connect();
