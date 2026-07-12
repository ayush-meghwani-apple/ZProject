/**
 * Turn a picked/pasted image into a compact base64 data URL. Phone photos are
 * often several megabytes; we downscale to a sensible max dimension and re-encode
 * as JPEG so notes stay small enough to live comfortably in IndexedDB.
 */
const MAX_DIM = 1280;
const QUALITY = 0.82;

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image'));
    img.src = src;
  });
}

export async function imageToDataUrl(file: Blob): Promise<string> {
  const original = await readAsDataUrl(file);
  try {
    const img = await loadImage(original);
    const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
    // Small enough already — keep as-is (also handles SVG/animated where canvas
    // re-encoding would lose data).
    if (scale === 1 && original.length < 500_000) return original;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return original;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', QUALITY);
  } catch {
    return original;
  }
}
