/**
 * 人物头像处理：把用户选的照片居中裁成正方形、缩到 256px、压成 JPEG data URL。
 * 只存本机 IndexedDB（avatars 表）与自己的备份导出，不进任何交换文件。
 */
export async function fileToAvatarDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  try {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas unavailable');
    const scale = Math.max(size / bmp.width, size / bmp.height);
    const w = bmp.width * scale;
    const h = bmp.height * scale;
    ctx.drawImage(bmp, (size - w) / 2, (size - h) / 2, w, h);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    bmp.close();
  }
}
