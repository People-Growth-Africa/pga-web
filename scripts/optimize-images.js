// One-off brand-asset optimizer: run with `node scripts/optimize-images.js`
//
// 1. Resizes the four brand PNGs (source 4000x3000) to 512px tall and
//    quantizes them to palette PNGs (alpha preserved) - right-sized for
//    navbar marks, favicons and social previews.
// 2. Rebuilds the two icon files as centred square marks (see squareIcon):
//    the leaf fills the canvas instead of sitting in a wide empty one, which
//    is what the square frames in the header, the account pages, the tab icon
//    and the email header read. Without this step the mark reads small in
//    every one of them.
// 3. Builds public/images/og-image.jpg (1200x630, brand green background,
//    white logo mark centred) for Open Graph / Twitter card previews.
//
// Originals are NOT backed up here; keep them in brand asset storage.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const imagesDir = path.join(__dirname, '..', 'public', 'images');

const BRAND_FILES = ['logo-black.png', 'logo-white.png', 'icon-black.png', 'icon-white.png'];
const GREEN = { r: 0x0f, g: 0x6e, b: 0x56, alpha: 1 }; // #0F6E56 (index.html theme-color)

/** The two files that are read inside square frames. */
const ICON_FILES = ['icon-black.png', 'icon-white.png'];
const ICON_CANVAS = 512;
/** Keeps the leaf a hair off the edge of its own file. */
const ICON_MARGIN = 8;
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

function kb(bytes) {
  return (bytes / 1024).toFixed(1) + ' kB';
}

async function optimizeBrandPng(file) {
  const filePath = path.join(imagesDir, file);
  const before = fs.statSync(filePath).size;
  const meta = await sharp(filePath).metadata();

  const tmp = filePath + '.tmp';
  await sharp(filePath)
    .resize({ height: 512, fit: 'inside' }) // preserve aspect, never upscale
    .png({ palette: true, compressionLevel: 9, effort: 10 })
    .toFile(tmp);
  fs.renameSync(tmp, filePath);

  const after = fs.statSync(filePath).size;
  console.log(
    `${file}: ${meta.width}x${meta.height} ${kb(before)} -> ${kb(after)} ` +
      `(${Math.round((1 - after / before) * 100)}% smaller)`
  );
}

/**
 * Rebuilds one icon file as a centred square mark.
 *
 * The source artwork is a 683x512 canvas and the leaf occupies only about 40%
 * of its width and 61% of its height, so a square frame had to scale the image
 * up and crop the empty margin in CSS to make the mark read at size. Trimming
 * that margin and centring the leaf on a square canvas puts the framing into
 * the file, so every consumer (header lockup, account pages, tab icon, email
 * header) gets a mark that fills its box, and no derived asset has to be kept
 * in step with these two.
 */
async function squareIcon(file) {
  const filePath = path.join(imagesDir, file);
  const trimmed = await sharp(filePath).ensureAlpha().trim({ threshold: 10 }).toBuffer();
  const inner = ICON_CANVAS - ICON_MARGIN * 2;

  // Two steps on purpose: sharp applies an extend after a resize in the same
  // pipeline, which would pad the original canvas, not the fitted one.
  const fitted = await sharp(trimmed)
    .resize(inner, inner, { fit: 'contain', background: CLEAR })
    .png()
    .toBuffer();

  const tmp = filePath + '.tmp';
  await sharp({ create: { width: ICON_CANVAS, height: ICON_CANVAS, channels: 4, background: CLEAR } })
    .composite([{ input: fitted, gravity: 'center' }])
    .png({ palette: true, compressionLevel: 9, effort: 10 })
    .toFile(tmp);
  fs.renameSync(tmp, filePath);

  console.log(`${file}: squared to ${ICON_CANVAS}x${ICON_CANVAS} (leaf centred)`);
}

async function buildOgImage() {
  const outPath = path.join(imagesDir, 'og-image.jpg');
  // The white logo variant (icon + wordmark) centred on the brand green.
  const mark = await sharp(path.join(imagesDir, 'logo-white.png'))
    .resize({ height: 420, fit: 'inside' })
    .png()
    .toBuffer();
  const markMeta = await sharp(mark).metadata();

  await sharp({
    create: { width: 1200, height: 630, channels: 4, background: GREEN },
  })
    .composite([
      {
        input: mark,
        top: Math.round((630 - markMeta.height) / 2),
        left: Math.round((1200 - markMeta.width) / 2),
      },
    ])
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(outPath);

  console.log(`og-image.jpg: 1200x630 ${kb(fs.statSync(outPath).size)}`);
}

let totalBefore = 0;
let totalAfter = 0;
for (const file of BRAND_FILES) {
  const filePath = path.join(imagesDir, file);
  totalBefore += fs.statSync(filePath).size;
  await optimizeBrandPng(file);
  totalAfter += fs.statSync(filePath).size;
}
console.log(`---\nBrand PNGs total: ${kb(totalBefore)} -> ${kb(totalAfter)}`);

for (const file of ICON_FILES) {
  await squareIcon(file);
}

await buildOgImage();
