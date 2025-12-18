import { AspectRatio } from '../types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let lastProxyRequestAt = 0;
let proxyInFlight = 0;
const PROXY_MIN_INTERVAL_MS = 900;
const PROXY_MAX_CONCURRENT = 2;

async function proxyFetch(url: string, init: RequestInit & { retry?: number }, signal?: AbortSignal): Promise<Response> {
  let attempts = 0;
  const maxRetry = Math.max(0, Number(init.retry ?? 3));
  while (true) {
    if (signal?.aborted) throw new Error('Aborted');
    while (proxyInFlight >= PROXY_MAX_CONCURRENT) {
      if (signal?.aborted) throw new Error('Aborted');
      await sleep(100);
    }
    const now = Date.now();
    const delta = now - lastProxyRequestAt;
    if (delta < PROXY_MIN_INTERVAL_MS) {
      await sleep(PROXY_MIN_INTERVAL_MS - delta + Math.floor(Math.random() * 200));
    }
    proxyInFlight++;
    lastProxyRequestAt = Date.now();
    try {
      const resp = await fetch(url, init);
      if (resp.status === 429 || resp.status >= 500) {
        if (attempts < maxRetry) {
          attempts++;
          const delay = Math.min(7000, 1200 * Math.pow(2, attempts)) + Math.floor(Math.random() * 300);
          await sleep(delay);
          continue;
        }
      }
      return resp;
    } catch (e) {
      if (attempts < maxRetry) {
        attempts++;
        const delay = Math.min(6000, 900 * Math.pow(2, attempts)) + Math.floor(Math.random() * 250);
        await sleep(delay);
        continue;
      }
      throw e;
    } finally {
      proxyInFlight = Math.max(0, proxyInFlight - 1);
    }
  }
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export type ImageProgressCallback = (progress: number, message: string) => void;

/**
 * Convert File to base64 string (without data URL prefix)
 */
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix if present
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * Convert AspectRatio string to API enum format
 */
function getAspectRatioEnum(aspectRatio: AspectRatio): string {
  switch (aspectRatio) {
    case '9:16':
    case '3:4':
      return 'IMAGE_ASPECT_RATIO_PORTRAIT';
    case '1:1':
      return 'IMAGE_ASPECT_RATIO_SQUARE';
    case '16:9':
    case '4:3':
      return 'IMAGE_ASPECT_RATIO_LANDSCAPE';
    default:
      return 'IMAGE_ASPECT_RATIO_PORTRAIT';
  }
}

/**
 * Generate image using Google Labs Whisk API (GEM_PIX model) with a subject image and instruction.
 * Same system as Studio Iklan AI and AI Photoshoot.
 */
export async function generateImageWithSubject(
  instruction: string,
  aspectRatio: AspectRatio,
  subjectImageBase64: string,
  subjectMimeType: string,
  onProgress?: ImageProgressCallback,
  signal?: AbortSignal
): Promise<string> {
  if (!subjectImageBase64) throw new Error('Subject image is required.');

  const imageAspectEnum = getAspectRatioEnum(aspectRatio);

  // 1) Upload user image to obtain mediaGenerationId
  onProgress?.(10, 'Mengunggah gambar produk...');
  const uploadResp = await proxyFetch(`/api/aisandboxProxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: '/v1:uploadUserImage',
      body: {
        imageInput: {
          rawImageBytes: subjectImageBase64,
          mimeType: subjectMimeType || 'image/png',
          isUserUploaded: true,
          aspectRatio: imageAspectEnum,
        },
        clientContext: {
          sessionId: generateUUID(),
          tool: 'ASSET_MANAGER',
        },
      }
    }),
    retry: 4,
    signal,
  });

  if (!uploadResp.ok) {
    let msg = uploadResp.statusText;
    try { msg = (await uploadResp.json())?.error?.message || msg; } catch {}
    throw new Error(`Image upload failed: ${msg}`);
  }
  const uploadData = await uploadResp.json();
  const mediaGenerationId = uploadData.mediaGenerationId?.mediaGenerationId || uploadData.mediaId;
  if (!mediaGenerationId) throw new Error('Failed to obtain mediaGenerationId from upload response.');

  // 2) Run Image Recipe (GEM_PIX)
  onProgress?.(25, 'Memulai generasi gambar...');
  const seed = Math.floor(Math.random() * 2147483647);
  const payload = {
    clientContext: {
      workflowId: generateUUID(),
      tool: 'BACKBONE',
      sessionId: `${Date.now()}`,
    },
    seed,
    imageModelSettings: {
      imageModel: 'GEM_PIX',
      aspectRatio: imageAspectEnum,
    },
    userInstruction: instruction,
    recipeMediaInputs: [
      {
        caption: 'Subject Image',
        mediaInput: {
          mediaCategory: 'MEDIA_CATEGORY_SUBJECT',
          mediaGenerationId,
        },
      },
    ],
  };

  const runResp = await proxyFetch(`/api/aisandboxProxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: '/v1/whisk:runImageRecipe', body: payload }),
    retry: 3,
    signal,
  });

  if (!runResp.ok) {
    let msg = runResp.statusText;
    try { msg = (await runResp.json())?.error?.message || msg; } catch {}
    throw new Error(`Image generation start failed: ${msg}`);
  }

  onProgress?.(55, 'Menyusun komposisi dan gaya...');
  const runData = await runResp.json();

  // 3) Try to extract final image from response
  // Case A: Some responses return inline base64 image under imagePanels[].generatedImages[].encodedImage
  try {
    const encoded = runData?.imagePanels?.[0]?.generatedImages?.[0]?.encodedImage as string | undefined;
    if (encoded && typeof encoded === 'string' && encoded.length > 100) {
      const cleaned = encoded.replace(/\s+/g, '');
      onProgress?.(100, 'Selesai!');
      return cleaned; // Return raw base64 without data URL prefix
    }
  } catch {}

  const urlCandidates: (string | undefined)[] = [
    runData?.image?.fifeUrl,
    runData?.result?.imageUrl,
    runData?.recipeResult?.generatedMedia?.[0]?.fifeUrl,
    runData?.generatedMedia?.[0]?.fifeUrl,
    runData?.recipeResult?.generatedMedia?.[0]?.image?.fifeUrl,
    runData?.operation?.metadata?.generatedMedia?.[0]?.fifeUrl,
    runData?.operation?.metadata?.image?.fifeUrl,
    runData?.result?.generatedMedia?.[0]?.image?.fifeUrl,
    runData?.generatedMedia?.[0]?.image?.fifeUrl,
    runData?.assets?.[0]?.fifeUrl,
    runData?.result?.assets?.[0]?.fifeUrl,
  ];
  const imageUrl = urlCandidates.find((u) => typeof u === 'string' && /^https?:\/\//.test(u || '')) as string | undefined;

  if (imageUrl) {
    // Convert URL to base64
    onProgress?.(80, 'Mengunduh hasil...');
    const base64 = await urlToBase64(imageUrl);
    onProgress?.(100, 'Selesai!');
    return base64;
  }

  // Fallback: if operation-based response, attempt naive short polling for a few cycles
  const operation = runData?.operation || runData?.operations?.[0];
  if (!operation) throw new Error('Image generation response did not include a result URL.');

  let attempts = 0;
  while (attempts < 10) {
    attempts++;
    onProgress?.(Math.min(95, 60 + attempts * 3), 'Memproses...');
    await sleep(3000);
  }
  throw new Error('Tidak mendapatkan URL gambar dari API. Silakan cek token atau coba lagi.');
}

/**
 * Generate image with subject and background using Google Labs Whisk API (R2I model).
 * Same system as AI Photoshoot with background.
 */
export async function generateImageWithSubjectAndBackground(
  instruction: string,
  aspectRatio: AspectRatio,
  subjectImageBase64: string,
  subjectMimeType: string,
  backgroundImageBase64: string,
  backgroundMimeType: string,
  onProgress?: ImageProgressCallback,
  signal?: AbortSignal
): Promise<string> {
  if (!subjectImageBase64) throw new Error('Subject image is required.');
  if (!backgroundImageBase64) throw new Error('Background image is required.');

  const imageAspectEnum = getAspectRatioEnum(aspectRatio);

  // Upload subject image
  onProgress?.(8, 'Mengunggah gambar produk...');
  const subjectUpload = await proxyFetch(`/api/aisandboxProxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: '/v1:uploadUserImage',
      body: {
        imageInput: {
          rawImageBytes: subjectImageBase64,
          mimeType: subjectMimeType || 'image/png',
          isUserUploaded: true,
          aspectRatio: imageAspectEnum,
        },
        clientContext: { sessionId: generateUUID(), tool: 'ASSET_MANAGER' },
      }
    }),
    retry: 4,
    signal,
  });
  if (!subjectUpload.ok) {
    let msg = subjectUpload.statusText; try { msg = (await subjectUpload.json())?.error?.message || msg; } catch {}
    throw new Error(`Image upload failed (subject): ${msg}`);
  }
  const subjectData = await subjectUpload.json();
  const subjectId = subjectData.mediaGenerationId?.mediaGenerationId || subjectData.mediaId;
  if (!subjectId) throw new Error('Failed to obtain mediaGenerationId for subject image.');

  // Upload background image
  onProgress?.(16, 'Mengunggah gambar background...');
  const bgUpload = await proxyFetch(`/api/aisandboxProxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: '/v1:uploadUserImage',
      body: {
        imageInput: {
          rawImageBytes: backgroundImageBase64,
          mimeType: backgroundMimeType || 'image/png',
          isUserUploaded: true,
          aspectRatio: imageAspectEnum,
        },
        clientContext: { sessionId: generateUUID(), tool: 'ASSET_MANAGER' },
      }
    }),
    retry: 4,
    signal,
  });
  if (!bgUpload.ok) {
    let msg = bgUpload.statusText; try { msg = (await bgUpload.json())?.error?.message || msg; } catch {}
    throw new Error(`Image upload failed (background): ${msg}`);
  }
  const bgData = await bgUpload.json();
  const bgId = bgData.mediaGenerationId?.mediaGenerationId || bgData.mediaId;
  if (!bgId) throw new Error('Failed to obtain mediaGenerationId for background image.');

  // Run Image Recipe with two inputs
  onProgress?.(30, 'Memulai generasi gambar...');
  const seed = Math.floor(Math.random() * 2147483647);
  const payload = {
    clientContext: { workflowId: generateUUID(), tool: 'BACKBONE', sessionId: `${Date.now()}` },
    seed,
    imageModelSettings: { imageModel: 'R2I', aspectRatio: imageAspectEnum },
    userInstruction: instruction,
    recipeMediaInputs: [
      { caption: 'Subject Image (Product)', mediaInput: { mediaCategory: 'MEDIA_CATEGORY_SUBJECT', mediaGenerationId: subjectId } },
      { caption: 'Background', mediaInput: { mediaCategory: 'MEDIA_CATEGORY_SUBJECT', mediaGenerationId: bgId } },
    ],
  };

  const runResp = await proxyFetch(`/api/aisandboxProxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: '/v1/whisk:runImageRecipe', body: payload }),
    retry: 3,
    signal,
  });
  if (!runResp.ok) {
    let msg = runResp.statusText; try { msg = (await runResp.json())?.error?.message || msg; } catch {}
    throw new Error(`Image generation start failed: ${msg}`);
  }
  onProgress?.(60, 'Menyusun komposisi dan gaya...');
  const runData = await runResp.json();

  try {
    const encoded = runData?.imagePanels?.[0]?.generatedImages?.[0]?.encodedImage as string | undefined;
    if (encoded && typeof encoded === 'string' && encoded.length > 100) {
      const cleaned = encoded.replace(/\s+/g, '');
      onProgress?.(100, 'Selesai!');
      return cleaned;
    }
  } catch {}

  const urlCandidates: (string | undefined)[] = [
    runData?.image?.fifeUrl,
    runData?.result?.imageUrl,
    runData?.recipeResult?.generatedMedia?.[0]?.fifeUrl,
    runData?.generatedMedia?.[0]?.fifeUrl,
    runData?.recipeResult?.generatedMedia?.[0]?.image?.fifeUrl,
    runData?.operation?.metadata?.generatedMedia?.[0]?.fifeUrl,
    runData?.operation?.metadata?.image?.fifeUrl,
    runData?.result?.generatedMedia?.[0]?.image?.fifeUrl,
    runData?.generatedMedia?.[0]?.image?.fifeUrl,
    runData?.assets?.[0]?.fifeUrl,
    runData?.result?.assets?.[0]?.fifeUrl,
  ];
  const imageUrl = urlCandidates.find((u) => typeof u === 'string' && /^https?:\/\//.test(u || '')) as string | undefined;
  if (imageUrl) {
    onProgress?.(80, 'Mengunduh hasil...');
    const base64 = await urlToBase64(imageUrl);
    onProgress?.(100, 'Selesai!');
    return base64;
  }

  const operation = runData?.operation || runData?.operations?.[0];
  if (!operation) throw new Error('Image generation response did not include a result URL.');
  let attempts = 0;
  while (attempts < 10) { attempts++; onProgress?.(Math.min(95, 65 + attempts * 3), 'Memproses...'); await sleep(3000); }
  throw new Error('Tidak mendapatkan URL gambar dari API. Silakan cek token atau coba lagi.');
}

/**
 * Helper: Convert URL to base64 string
 */
async function urlToBase64(url: string): Promise<string> {
  try {
    // Try fetch through proxy first
    const downloadBase = import.meta.env?.DEV ? '/download' : '/api/download';
    const proxied = `${downloadBase}?url=${encodeURIComponent(url)}&filename=${encodeURIComponent('image.png')}`;
    const resp = await fetch(proxied);
    if (!resp.ok) throw new Error('Proxy fetch failed');
    const blob = await resp.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    // Fallback: try direct fetch
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('Direct fetch failed');
      const blob = await resp.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.includes(',') ? result.split(',')[1] : result;
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      throw new Error('Failed to convert URL to base64');
    }
  }
}
