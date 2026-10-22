/**
 * Turning one chosen photo into the two WebP files a cover is made of.
 *
 * The manager picks one file; the browser produces a full-size image for the
 * article and a thumbnail for the grids. Doing it here rather than on the server
 * keeps the upload small (a 4 MB phone photo becomes a few hundred KB), removes
 * the need for an image pipeline in a serverless function, and means the
 * thumbnail is generated from the same pixels the full image is, so the pair can
 * never disagree about the crop.
 *
 * Both files are squared off at a 16:9 crop, because that is the shape every
 * card and hero on the site uses. Cropping once, here, beats letting each
 * layout crop differently.
 */

/** Long edge of the full-size cover. Enough for a retina hero, small enough to stay quick. */
const FULL_WIDTH = 1600;
/** Long edge of the grid thumbnail. Cards are never wider than ~380 CSS px. */
const THUMB_WIDTH = 640;

const FULL_QUALITY = 0.82;
const THUMB_QUALITY = 0.72;

const ASPECT = 16 / 9;

export type CoverPair = {
  full: File;
  thumb: File;
  /** Pixel dimensions of the full image, for the console and tests. */
  width: number;
  height: number;
};

/** Anything the canvas cannot decode is reported as this, not as a crash. */
export class CoverError extends Error {}

/**
 * Decodes the file with `createImageBitmap`, which respects EXIF orientation in
 * every browser that supports it. A fallback through an `<img>` covers the rest;
 * a photo that neither can read is refused rather than uploaded as a broken
 * image.
 */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Fall through to the <img> path.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } catch {
    throw new CoverError('That image could not be read. Try a JPG, PNG or WebP file.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function dimensions(source: ImageBitmap | HTMLImageElement): { width: number; height: number } {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  return { width: source.width, height: source.height };
}

/** The 16:9 crop of the source, centred, sized to `targetWidth`. */
function cropBox(width: number, height: number, targetWidth: number) {
  const outWidth = Math.min(targetWidth, width);
  const outHeight = Math.round(outWidth / ASPECT);

  // The widest 16:9 rectangle that fits inside the source, then scaled.
  let sourceWidth = width;
  let sourceHeight = Math.round(width / ASPECT);
  if (sourceHeight > height) {
    sourceHeight = height;
    sourceWidth = Math.round(height * ASPECT);
  }

  return {
    outWidth,
    outHeight,
    sx: Math.round((width - sourceWidth) / 2),
    sy: Math.round((height - sourceHeight) / 2),
    sourceWidth,
    sourceHeight,
  };
}

async function render(source: ImageBitmap | HTMLImageElement, targetWidth: number, quality: number, name: string): Promise<File> {
  const { width, height } = dimensions(source);
  if (width === 0 || height === 0) throw new CoverError('That image is empty.');

  const box = cropBox(width, height, targetWidth);
  const canvas = document.createElement('canvas');
  canvas.width = box.outWidth;
  canvas.height = box.outHeight;

  const context = canvas.getContext('2d');
  if (!context) throw new CoverError('This browser could not prepare the image. Try another browser.');

  context.imageSmoothingQuality = 'high';
  context.drawImage(
    source,
    box.sx,
    box.sy,
    box.sourceWidth,
    box.sourceHeight,
    0,
    0,
    box.outWidth,
    box.outHeight,
  );

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), 'image/webp', quality);
  });

  if (!blob) throw new CoverError('This browser could not convert the image. Try another browser.');

  return new File([blob], `${name}.webp`, { type: 'image/webp' });
}

/**
 * One picked file -> the cover pair.
 *
 * `onProgress` is reported in two steps rather than continuously: decoding and
 * encoding are opaque to the page, so a smooth bar would be invented. The caller
 * spends the rest of its bar on the two uploads, which it can measure.
 */
export async function compressCover(file: File, onProgress: (percent: number) => void): Promise<CoverPair> {
  if (!file.type.startsWith('image/')) {
    throw new CoverError('Choose a JPG, PNG or WebP image.');
  }

  const source = await decode(file);
  const { width, height } = dimensions(source);
  onProgress(40);

  const stem = file.name.replace(/\.[^.]+$/, '') || 'cover';

  try {
    const [full, thumb] = await Promise.all([
      render(source, FULL_WIDTH, FULL_QUALITY, `${stem}-full`),
      render(source, THUMB_WIDTH, THUMB_QUALITY, `${stem}-thumb`),
    ]);
    onProgress(100);
    return { full, thumb, width, height };
  } finally {
    // An ImageBitmap holds decoded pixels; releasing it matters on a phone.
    if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) source.close();
  }
}

/** A compact "520 KB" for the editor's status line. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
