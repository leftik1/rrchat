/**
 * Resizes and compresses images on the client side before uploading.
 * Solves llama-server vision / OCR crashes caused by giant camera photos (>4000px, 15MB)
 * that produce >4000 vision tokens and exceed batch/context memory slots.
 */
export async function compressImage(file: File, maxDimension = 960, quality = 0.82): Promise<File> {
  const isJpgOrPng = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
  if (!isJpgOrPng) {
    return file;
  }

  // If already under 250KB and within maxDimension, skip compression
  if (file.size < 250 * 1024) {
    try {
      const bitmap = await createImageBitmap(file);
      if (bitmap.width <= maxDimension && bitmap.height <= maxDimension) {
        bitmap.close();
        return file;
      }
      bitmap.close();
    } catch {
      // fallback to canvas below
    }
  }

  return new Promise<File>((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            const cleanName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
            const compressed = new File([blob], cleanName, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(compressed);
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}
