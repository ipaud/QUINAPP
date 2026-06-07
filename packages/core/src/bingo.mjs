export function hash32(input) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function rand(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function seededShuffle(array, randomFn) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(randomFn() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function songKey(song) {
  return `${normalizeText(song.artist)}::${normalizeText(song.title)}`;
}

export function parseSongsFromText(text) {
  return String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s*[—-]\s*|\s+-\s+/);
      return {
        artist: parts[0] || "(artista)",
        title: parts[1] || "(cancion)",
      };
    });
}

export function dedupeSongs(songs) {
  const seen = new Set();
  const unique = [];
  for (const song of songs) {
    const key = songKey(song);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(song);
    }
  }
  return unique;
}

export function generateCardSongs({ songs, rows = 3, cols = 5, seed = "seed", preventDupes = true }) {
  const need = rows * cols;
  const source = preventDupes ? dedupeSongs(songs) : songs.slice();
  if (source.length < need) {
    throw new Error(`Se necesitan al menos ${need} canciones para generar un carton`);
  }
  const randomFn = rand(hash32(String(seed)));
  return seededShuffle(source, randomFn).slice(0, need);
}

export function countCompletedLines(markedIndexes, rows, cols) {
  let lines = 0;
  for (let r = 0; r < rows; r += 1) {
    let completed = true;
    for (let c = 0; c < cols; c += 1) {
      if (!markedIndexes.has(r * cols + c)) {
        completed = false;
        break;
      }
    }
    if (completed) lines += 1;
  }
  return lines;
}

export function findMarkedIndexes(cardSongs, drawnSongs) {
  const drawnKeys = new Set(drawnSongs.map(songKey));
  const marked = new Set();
  cardSongs.forEach((song, idx) => {
    if (drawnKeys.has(songKey(song))) {
      marked.add(idx);
    }
  });
  return marked;
}
