export async function readResumeImage(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('请选择 JPG、PNG 或 WebP 图片。');
  if (file.size > 8 * 1024 * 1024) throw new Error('请选择小于 8 MB 的图片。');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 1000 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法处理这张图片，请尝试另一张。');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/png');
    if (data.length > 4 * 1024 * 1024) throw new Error('处理后的图片较大，请选择尺寸更小的图片。');
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}
