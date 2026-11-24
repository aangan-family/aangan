/**
 * Shrinks a photo to at most `max` pixels on its long side and re-encodes it as JPEG.
 * Re-drawing on a canvas also drops all EXIF metadata, including GPS location.
 */
export async function preparePhoto(file: File, max = 1600): Promise<Blob> {
  if (!/^image\//.test(file.type)) throw new Error('Please choose a photo (JPG, PNG or HEIC exported as JPG).');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That photo couldn’t be opened. Try a JPG or PNG.')); i.src = url;
    });
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.85));
    if (!blob) throw new Error('That photo couldn’t be processed.');
    if (blob.size > 5 * 1024 * 1024) throw new Error('That photo is too large even after shrinking.');
    return blob;
  } finally { URL.revokeObjectURL(url); }
}
