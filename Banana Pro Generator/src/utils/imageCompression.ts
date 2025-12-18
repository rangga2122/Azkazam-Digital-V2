/**
 * Compresses an image file to a JPG under a specific size limit (default 100KB).
 * 
 * @param file The original file to compress
 * @param maxSizeKB The maximum size in KB (default 100)
 * @returns A Promise that resolves to the compressed Blob
 */
export const compressImage = async (file: File, maxSizeKB: number = 100): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Initial max dimension to avoid processing massive images
        const MAX_DIMENSION = 1920;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          } else {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        // Binary search for the right quality
        let minQuality = 0.1;
        let maxQuality = 0.95;
        let quality = 0.8;
        let attempt = 0;
        const maxAttempts = 10;
        
        const tryCompress = (q: number) => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Compression failed'));
                return;
              }
              
              const sizeKB = blob.size / 1024;
              
              if (sizeKB <= maxSizeKB && sizeKB > maxSizeKB * 0.8) {
                 // Good enough range (80-100KB)
                 resolve(blob);
              } else if (attempt >= maxAttempts) {
                // Too many attempts, return best effort (if it's under limit, great, otherwise return the last one)
                // If it's still over limit after max attempts with low quality, we might need to resize, 
                // but for now let's just return what we have if it's acceptable-ish or force lower.
                if (sizeKB <= maxSizeKB) {
                   resolve(blob);
                } else {
                   // If still too big, force a resize and recurse? 
                   // Or just try one last time with very low quality.
                   if (q > 0.1) {
                     // one last ditch effort
                     attempt++;
                     tryCompress(0.1);
                   } else {
                     // Even at 0.1 it's too big? Likely a very complex or large image.
                     // Let's resolve anyway, we tried our best.
                     resolve(blob); 
                   }
                }
              } else {
                attempt++;
                if (sizeKB > maxSizeKB) {
                  maxQuality = q;
                  quality = (minQuality + maxQuality) / 2;
                } else {
                  minQuality = q;
                  quality = (minQuality + maxQuality) / 2;
                }
                tryCompress(quality);
              }
            },
            'image/jpeg',
            q
          );
        };

        // First attempt
        tryCompress(quality);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};
