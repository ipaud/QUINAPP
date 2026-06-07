export function normalizeSongKey(song) {
  const normalize = (value) => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  return `${normalize(song.artist)}::${normalize(song.title)}`;
}

export function toPdfSafeText(value, maxLen = null) {
  let out = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\u0020-\u00FF]/g, '?');
  if (typeof maxLen === 'number') out = out.slice(0, maxLen);
  return out;
}
