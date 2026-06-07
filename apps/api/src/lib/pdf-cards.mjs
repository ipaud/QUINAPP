import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { toPdfSafeText } from './songs.mjs';
import { buildCardQrQuery } from './qr.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache dels bytes de font (llegits una sola vegada en tota la vida del procés)
let _fontBytesCache = null;

async function getFontBytes() {
  if (_fontBytesCache) return _fontBytesCache;
  const rootNodeModules = path.resolve(__dirname, '../../../../node_modules/@fontsource/space-grotesk/files');
  const [regularBytes, mediumBytes, boldBytes] = await Promise.all([
    readFile(path.join(rootNodeModules, 'space-grotesk-latin-400-normal.woff')),
    readFile(path.join(rootNodeModules, 'space-grotesk-latin-500-normal.woff')),
    readFile(path.join(rootNodeModules, 'space-grotesk-latin-700-normal.woff')),
  ]);
  _fontBytesCache = { regularBytes, mediumBytes, boldBytes };
  return _fontBytesCache;
}

async function loadPdfTypography(pdfDoc) {
  const require = createRequire(import.meta.url);
  const fallback = async () => ({
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    medium: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  });

  try {
    const { regularBytes, mediumBytes, boldBytes } = await getFontBytes();
    const fontkit = require('@pdf-lib/fontkit');
    pdfDoc.registerFontkit(fontkit);
    return {
      regular: await pdfDoc.embedFont(regularBytes, { subset: true }),
      medium: await pdfDoc.embedFont(mediumBytes, { subset: true }),
      bold: await pdfDoc.embedFont(boldBytes, { subset: true }),
    };
  } catch {
    return fallback();
  }
}

async function drawCardInRectAsync(pdfDoc, page, session, card, rect, options = {}) {
  const font = options.typography?.regular || await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontMedium = options.typography?.medium || font;
  const fontBold = options.typography?.bold || await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const showMeta = options.showMeta !== false;
  const preset = options.preset || 'evento';

  const ink = rgb(0.051, 0.051, 0.051);
  const inkSub = rgb(0.420, 0.420, 0.420);
  const yellow = rgb(1.000, 0.886, 0.204);
  const white = rgb(1.000, 1.000, 1.000);
  const crema = rgb(0.980, 0.976, 0.965);

  const x0 = rect.x;
  const y0 = rect.y;
  const width = rect.w;
  const height = rect.h;

  const drawCentered = (text, boxX, _boxY, boxW, y, size, weight = 'regular', color = ink) => {
    const safe = toPdfSafeText(text);
    const f = weight === 'bold' ? fontBold : weight === 'medium' ? fontMedium : font;
    const tw = f.widthOfTextAtSize(safe, size);
    const tx = boxX + Math.max(4, (boxW - tw) / 2);
    page.drawText(safe, { x: tx, y, size, font: f, color });
  };

  if (preset !== 'ahorro') {
    page.drawRectangle({ x: x0 + 6, y: y0 - 6, width, height, color: ink });
  }
  page.drawRectangle({ x: x0, y: y0, width, height, color: white, borderWidth: 2.8, borderColor: ink });

  if (preset === 'imprenta') {
    const mark = 9;
    const w = 0.8;
    page.drawLine({ start: { x: x0 - mark, y: y0 }, end: { x: x0 - 2, y: y0 }, thickness: w, color: ink });
    page.drawLine({ start: { x: x0, y: y0 - mark }, end: { x: x0, y: y0 - 2 }, thickness: w, color: ink });
    page.drawLine({ start: { x: x0 + width + 2, y: y0 }, end: { x: x0 + width + mark, y: y0 }, thickness: w, color: ink });
    page.drawLine({ start: { x: x0 + width, y: y0 - mark }, end: { x: x0 + width, y: y0 - 2 }, thickness: w, color: ink });
    page.drawLine({ start: { x: x0 - mark, y: y0 + height }, end: { x: x0 - 2, y: y0 + height }, thickness: w, color: ink });
    page.drawLine({ start: { x: x0, y: y0 + height + 2 }, end: { x: x0, y: y0 + height + mark }, thickness: w, color: ink });
    page.drawLine({ start: { x: x0 + width + 2, y: y0 + height }, end: { x: x0 + width + mark, y: y0 + height }, thickness: w, color: ink });
    page.drawLine({ start: { x: x0 + width, y: y0 + height + 2 }, end: { x: x0 + width, y: y0 + height + mark }, thickness: w, color: ink });
  }

  const pad = 10;
  const ix = x0 + pad;
  const iy = y0 + pad;
  const iw = width - pad * 2;
  const ih = height - pad * 2;

  const headerH = Math.max(36, Math.min(48, ih * 0.13));
  const metaH = showMeta ? 20 : 0;
  const footerH = 24;
  const blockGap = 7;

  const headerY = iy + ih - headerH;
  const metaY = showMeta ? headerY - metaH - 4 : headerY;
  const qrColW = 96;
  const leftW = iw - qrColW - 6;
  const qrBlockX = ix + iw - qrColW;
  const qrBlockY = showMeta ? metaY : headerY;
  const qrBlockH = headerH + (showMeta ? (metaH + 4) : 0);

  page.drawRectangle({ x: ix + 3, y: headerY - 3, width: leftW, height: headerH, color: ink });
  page.drawRectangle({ x: ix, y: headerY, width: leftW, height: headerH, color: yellow, borderWidth: 2.4, borderColor: ink });
  drawCentered('QUINAPP', ix, headerY, leftW, headerY + headerH - 20, 19, 'bold', ink);
  drawCentered('CARTO MUSICAL', ix, headerY, leftW, headerY + 7, 8.5, 'medium', inkSub);

  if (showMeta) {
    page.drawRectangle({ x: ix + 2, y: metaY - 2, width: leftW, height: metaH, color: ink });
    page.drawRectangle({ x: ix, y: metaY, width: leftW, height: metaH, color: crema, borderWidth: 2, borderColor: ink });
    drawCentered(`PIN ${session.pin}   |   Seed ${session.seed}   |   Carto #${card.number}`, ix, metaY, leftW, metaY + 6, 8, 'bold', ink);
  }

  page.drawRectangle({ x: qrBlockX + 3, y: qrBlockY - 3, width: qrColW, height: qrBlockH, color: ink });
  page.drawRectangle({ x: qrBlockX, y: qrBlockY, width: qrColW, height: qrBlockH, color: white, borderWidth: 2.2, borderColor: ink });

  if (options.qrUrl) {
    try {
      const dataUrl = await QRCode.toDataURL(options.qrUrl, {
        errorCorrectionLevel: 'L',
        margin: 2,
        color: { dark: '#0d0d0d', light: '#ffffff' },
        width: 320,
      });
      const png = await pdfDoc.embedPng(dataUrl);
      const qrSize = Math.min(78, qrColW - 10);
      const qx = qrBlockX + (qrColW - qrSize) / 2;
      const qy = qrBlockY + (qrBlockH - qrSize) / 2 + 3;
      page.drawRectangle({ x: qx - 2, y: qy - 2, width: qrSize + 4, height: qrSize + 4, borderWidth: 1.5, borderColor: ink, color: white });
      page.drawImage(png, { x: qx, y: qy, width: qrSize, height: qrSize });
      page.drawText(toPdfSafeText('VALIDAR'), { x: qx + 4, y: qy - 9, size: 6.5, font: fontBold, color: inkSub });
    } catch {
      // noop
    }
  } else {
    drawCentered('QR', qrBlockX, qrBlockY, qrColW, qrBlockY + (qrBlockH / 2) - 4, 10, 'bold', inkSub);
  }

  const rows = session.rows;
  const cols = session.cols;
  const gridTop = (showMeta ? metaY : headerY) - blockGap;
  const gridBottom = iy + footerH + blockGap;
  const gridHeight = gridTop - gridBottom;
  const cellW = iw / cols;
  const cellH = gridHeight / rows;

  if (preset !== 'ahorro') {
    page.drawRectangle({ x: ix + 4, y: gridBottom - 4, width: iw, height: gridHeight, color: ink });
  }
  page.drawRectangle({ x: ix, y: gridBottom, width: iw, height: gridHeight, borderWidth: 2.4, borderColor: ink, color: white });

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const idx = r * cols + c;
      const song = card.songs[idx] || { artist: '(artista)', title: '(cancion)' };
      const cx = ix + c * cellW;
      const cy = gridTop - (r + 1) * cellH;

      if (preset !== 'ahorro') {
        page.drawRectangle({ x: cx + 2, y: cy - 2, width: cellW, height: cellH, color: ink });
      }
      page.drawRectangle({ x: cx, y: cy, width: cellW, height: cellH, color: white, borderWidth: preset === 'ahorro' ? 1.2 : 1.8, borderColor: ink });

      const artistSize = Math.max(7.5, Math.min(10.5, cellH * 0.28));
      const titleSize = Math.max(6.5, Math.min(8.5, cellH * 0.22));

      const artist = toPdfSafeText(song.artist, 24);
      const title = toPdfSafeText(song.title, 30);
      const artistW = fontBold.widthOfTextAtSize(artist, artistSize);
      const titleW = font.widthOfTextAtSize(title, titleSize);
      const artistX = cx + Math.max(3, (cellW - artistW) / 2);
      const titleX = cx + Math.max(3, (cellW - titleW) / 2);
      const midY = cy + cellH / 2;

      page.drawText(artist, { x: artistX, y: midY + 2, size: artistSize, font: fontBold, color: ink });
      page.drawText(title, { x: titleX, y: midY - titleSize - 1, size: titleSize, font, color: inkSub });
    }
  }

  page.drawRectangle({ x: ix + 2, y: iy - 2, width: iw, height: footerH, color: ink });
  page.drawRectangle({ x: ix, y: iy, width: iw, height: footerH, color: yellow, borderWidth: 2, borderColor: ink });
  drawCentered('Marca quan sonin. Reclamacions: LINIA i QUINA.', ix, iy, iw, iy + 8, 8.5, 'bold', ink);
}

export async function buildCardsPdf(session, cards, options = {}) {
  const pdfDoc = await PDFDocument.create();
  const typography = await loadPdfTypography(pdfDoc);
  const format = options.format === 'a5' ? 'a5' : 'a4-2up';
  const preset = options.preset || 'evento';
  const showMeta = options.showMeta !== false;
  const highContrast = Boolean(options.highContrast);
  const baseUrl = options.baseUrl || 'http://127.0.0.1:3000';

  if (format === 'a5') {
    const page = pdfDoc.addPage([595, 420]);
    const qrUrl = buildCardQrQuery(baseUrl, session, cards[0]);
    await drawCardInRectAsync(
      pdfDoc,
      page,
      session,
      cards[0],
      { x: 14, y: 12, w: page.getWidth() - 28, h: page.getHeight() - 24 },
      { showMeta, highContrast, qrUrl, typography, preset }
    );
  } else {
    const pageW = 595;
    const pageH = 842;
    const margin = 16;
    const gap = 12;
    for (let i = 0; i < cards.length; i += 2) {
      const page = pdfDoc.addPage([pageW, pageH]);
      const slotH = (pageH - margin * 2 - gap) / 2;
      const qrUrlTop = buildCardQrQuery(baseUrl, session, cards[i]);
      await drawCardInRectAsync(
        pdfDoc,
        page,
        session,
        cards[i],
        { x: margin, y: margin + slotH + gap, w: pageW - margin * 2, h: slotH },
        { showMeta, highContrast, qrUrl: qrUrlTop, typography, preset }
      );
      if (cards[i + 1]) {
        const qrUrlBottom = buildCardQrQuery(baseUrl, session, cards[i + 1]);
        await drawCardInRectAsync(
          pdfDoc,
          page,
          session,
          cards[i + 1],
          { x: margin, y: margin, w: pageW - margin * 2, h: slotH },
          { showMeta, highContrast, qrUrl: qrUrlBottom, typography, preset }
        );
      }
    }
  }

  return pdfDoc.save();
}
