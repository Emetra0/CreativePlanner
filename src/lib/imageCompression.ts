function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image'));
    image.src = dataUrl;
  });
}

function dataUrlByteSize(dataUrl: string) {
  const base64 = dataUrl.split(',')[1] || '';
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(base64.length * 0.75) - padding);
}

export async function compressImageFile(
  file: File,
  options?: {
    maxDimension?: number;
    jpegQuality?: number;
  },
) {
  const maxDimension = options?.maxDimension ?? 1600;
  const jpegQuality = options?.jpegQuality ?? 0.8;

  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') {
    const original = await readFileAsDataUrl(file);
    return { dataUrl: original, type: file.type || 'application/octet-stream', size: file.size };
  }

  const original = await readFileAsDataUrl(file);
  const image = await loadImage(original);
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const targetWidth = Math.max(1, Math.round(image.naturalWidth * scale));
  const targetHeight = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d');

  if (!context) {
    return { dataUrl: original, type: file.type || 'application/octet-stream', size: file.size };
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.clearRect(0, 0, targetWidth, targetHeight);
  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const outputType = file.type === 'image/png' || file.type === 'image/bmp' ? 'image/png' : 'image/jpeg';
  const compressed = canvas.toDataURL(outputType, jpegQuality);

  if (dataUrlByteSize(compressed) >= file.size && scale === 1) {
    return { dataUrl: original, type: file.type || 'application/octet-stream', size: file.size };
  }

  return {
    dataUrl: compressed,
    type: outputType,
    size: dataUrlByteSize(compressed),
  };
}