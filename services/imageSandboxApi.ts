import { AspectRatio } from '../types';
import { fileToBase64 } from './veoSandboxApi';

const LABS_API_BASE_URL = 'https://aisandbox-pa.googleapis.com';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let lastLabsRequestAt = 0;
let labsInFlight = 0;
const LABS_MIN_INTERVAL_MS = 900;
const LABS_MAX_CONCURRENT = 2;

async function labsFetch(url: string, init: RequestInit & { retry?: number }, signal?: AbortSignal): Promise<Response> {
  let attempts = 0;
  const maxRetry = Math.max(0, Number(init.retry ?? 3));
  while (true) {
    if (signal?.aborted) throw new Error('Aborted');
    while (labsInFlight >= LABS_MAX_CONCURRENT) {
      if (signal?.aborted) throw new Error('Aborted');
      await sleep(100);
    }
    const now = Date.now();
    const delta = now - lastLabsRequestAt;
    if (delta < LABS_MIN_INTERVAL_MS) {
      await sleep(LABS_MIN_INTERVAL_MS - delta + Math.floor(Math.random() * 200));
    }
    labsInFlight++;
    lastLabsRequestAt = Date.now();
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
      labsInFlight = Math.max(0, labsInFlight - 1);
    }
  }
}

export type ImageProgressCallback = (progress: number, message: string) => void;

/**
 * Generate image using Google Labs Whisk API (GEM_PIX model) with a subject image and instruction.
 * No credits deduction. Requires a valid Bearer token.
 */
export async function generateImage(
    instruction: string,
    aspectRatio: AspectRatio,
    subjectImage: File,
    token: string,
    onProgress: ImageProgressCallback,
    signal?: AbortSignal
): Promise<string> {
  if (typeof window !== 'undefined' && (window as any).__devtoolsOpen) {
    throw new Error('Operasi dibatalkan karena mode pengembang terdeteksi.');
  }
  if (!token) throw new Error('Authorization Token is missing. Please configure VEO_BEARER_TOKEN.');
  if (!subjectImage) throw new Error('Subject image is required.');

  const cleanToken = token.replace(/^Bearer\s+/i, '').replace(/\s+/g, '').trim();
  let imageAspectEnum: string = 'IMAGE_ASPECT_RATIO_LANDSCAPE';
  if (aspectRatio === AspectRatio.Portrait) imageAspectEnum = 'IMAGE_ASPECT_RATIO_PORTRAIT';
  else if (aspectRatio === AspectRatio.Square) imageAspectEnum = 'IMAGE_ASPECT_RATIO_SQUARE';

  // 1) Upload user image to obtain mediaGenerationId
  onProgress(10, 'Mengunggah gambar subjek...');
  const rawImageBytes = await fileToBase64(subjectImage);
  const uploadResp = await labsFetch(`${LABS_API_BASE_URL}/v1:uploadUserImage`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      imageInput: {
        rawImageBytes,
        mimeType: subjectImage.type || 'image/png',
        isUserUploaded: true,
        aspectRatio: imageAspectEnum,
      },
      clientContext: {
        sessionId: generateUUID(),
        tool: 'ASSET_MANAGER',
      },
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
  onProgress(25, 'Memulai generasi gambar...');
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

  const runResp = await labsFetch(`${LABS_API_BASE_URL}/v1/whisk:runImageRecipe`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    retry: 3,
    signal,
  });

  if (!runResp.ok) {
    let msg = runResp.statusText;
    try { msg = (await runResp.json())?.error?.message || msg; } catch {}
    throw new Error(`Image generation start failed: ${msg}`);
  }

  onProgress(55, 'Menyusun komposisi dan gaya...');
  const runData = await runResp.json();

  // 3) Try to extract final image URL from response
  // Case A: Some responses return inline base64 image under imagePanels[].generatedImages[].encodedImage
  try {
    const encoded = runData?.imagePanels?.[0]?.generatedImages?.[0]?.encodedImage as string | undefined;
    if (encoded && typeof encoded === 'string' && encoded.length > 100) {
      const cleaned = encoded.replace(/\s+/g, '');
      const dataUrl = cleaned.startsWith('data:') ? cleaned : `data:image/png;base64,${cleaned}`;
      onProgress(100, 'Selesai!');
      return dataUrl;
    }
  } catch {}

  const urlCandidates: (string | undefined)[] = [
    runData?.image?.fifeUrl,
    runData?.result?.imageUrl,
    runData?.recipeResult?.generatedMedia?.[0]?.fifeUrl,
    runData?.generatedMedia?.[0]?.fifeUrl,
    runData?.recipeResult?.generatedMedia?.[0]?.image?.fifeUrl,
    // More possible fields observed across variants
    runData?.operation?.metadata?.generatedMedia?.[0]?.fifeUrl,
    runData?.operation?.metadata?.image?.fifeUrl,
    runData?.result?.generatedMedia?.[0]?.image?.fifeUrl,
    runData?.generatedMedia?.[0]?.image?.fifeUrl,
    runData?.assets?.[0]?.fifeUrl,
    runData?.result?.assets?.[0]?.fifeUrl,
  ];
  const imageUrl = urlCandidates.find((u) => typeof u === 'string' && /^https?:\/\//.test(u || '')) as string | undefined;

  if (imageUrl) {
    onProgress(100, 'Selesai!');
    return imageUrl;
  }

  // Fallback: if operation-based response, attempt naive short polling for a few cycles
  const operation = runData?.operation || runData?.operations?.[0];
  if (!operation) throw new Error('Image generation response did not include a result URL.');

  let attempts = 0;
  while (attempts < 10) {
    attempts++;
    onProgress(Math.min(95, 60 + attempts * 3), 'Memproses...');
    await sleep(3000);
    // There is no documented image status endpoint; without it, we cannot poll reliably.
    // Return an informative error instead of hanging.
  }
  throw new Error('Tidak mendapatkan URL gambar dari API. Silakan cek token atau coba lagi.');
}

/**
 * Generate image WITHOUT subject image using Google Labs Whisk API (IMAGEN_3_5) as per provided curl.
 * This is used exclusively for the "Generate Gambar" feature when user doesn't upload a subject image.
 */
export async function generateImagePromptOnly(
    instruction: string,
    aspectRatio: AspectRatio,
    token: string,
    onProgress: ImageProgressCallback,
    signal?: AbortSignal,
    seedInput?: number
): Promise<string> {
  if (typeof window !== 'undefined' && (window as any).__devtoolsOpen) {
    throw new Error('Operasi dibatalkan karena mode pengembang terdeteksi.');
  }
  if (!token) throw new Error('Authorization Token is missing. Please configure VEO_BEARER_TOKEN.');

  const cleanToken = token.replace(/^Bearer\s+/i, '').replace(/\s+/g, '').trim();
  let imageAspectEnum: string = 'IMAGE_ASPECT_RATIO_LANDSCAPE';
  if (aspectRatio === AspectRatio.Portrait) imageAspectEnum = 'IMAGE_ASPECT_RATIO_PORTRAIT';
  else if (aspectRatio === AspectRatio.Square) imageAspectEnum = 'IMAGE_ASPECT_RATIO_SQUARE';

  onProgress(10, 'Menyiapkan prompt...');
  const seed = seedInput ?? Math.floor(Math.random() * 2147483647);
  const payload = {
    clientContext: {
      workflowId: generateUUID(),
      tool: 'BACKBONE',
      sessionId: `${Date.now()}`,
    },
    imageModelSettings: {
      imageModel: 'IMAGEN_3_5',
      aspectRatio: imageAspectEnum,
    },
    seed,
    prompt: instruction,
    mediaCategory: 'MEDIA_CATEGORY_BOARD',
  };

  const resp = await labsFetch(`${LABS_API_BASE_URL}/v1/whisk:generateImage`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      'Content-Type': 'text/plain;charset=UTF-8',
      Accept: '*/*',
    },
    body: JSON.stringify(payload),
    retry: 3,
    signal,
  });

  if (!resp.ok) {
    let msg = resp.statusText;
    try { msg = (await resp.json())?.error?.message || msg; } catch {}
    throw new Error(`Image generation failed: ${msg}`);
  }

  onProgress(65, 'Memproses...');
  const data = await resp.json();

  // Try common fields first (base64 or direct URL)
  try {
    const encoded = data?.imagePanels?.[0]?.generatedImages?.[0]?.encodedImage as string | undefined;
    if (encoded && typeof encoded === 'string' && encoded.length > 100) {
      const cleaned = encoded.replace(/\s+/g, '');
      const dataUrl = cleaned.startsWith('data:') ? cleaned : `data:image/png;base64,${cleaned}`;
      onProgress(100, 'Selesai!');
      return dataUrl;
    }
  } catch {}

  const urlCandidates: (string | undefined)[] = [
    data?.image?.fifeUrl,
    data?.result?.imageUrl,
    data?.generatedMedia?.[0]?.fifeUrl,
    data?.generatedMedia?.[0]?.image?.fifeUrl,
    data?.assets?.[0]?.fifeUrl,
    data?.result?.assets?.[0]?.fifeUrl,
  ];
  const imageUrl = urlCandidates.find((u) => typeof u === 'string' && /^https?:\/\//.test(u || '')) as string | undefined;
  if (imageUrl) {
    onProgress(100, 'Selesai!');
    return imageUrl;
  }

  // If operation-style response, give informative error rather than hanging
  throw new Error('Tidak mendapatkan URL gambar dari API. Silakan cek token atau coba lagi.');
}

/**
 * Generate image using two inputs: product/subject image and a reference model image.
 * This mirrors the observed curl payload where both inputs are passed as MEDIA_CATEGORY_SUBJECT.
 */
export async function generateImageWithReference(
    instruction: string,
    aspectRatio: AspectRatio,
    subjectImage: File,
    referenceImage: File,
    token: string,
    onProgress: ImageProgressCallback,
    signal?: AbortSignal
): Promise<string> {
  if (typeof window !== 'undefined' && (window as any).__devtoolsOpen) {
    throw new Error('Operasi dibatalkan karena mode pengembang terdeteksi.');
  }
  if (!token) throw new Error('Authorization Token is missing. Please configure VEO_BEARER_TOKEN.');
  if (!subjectImage) throw new Error('Subject image is required.');
  if (!referenceImage) throw new Error('Reference model image is required.');

  const cleanToken = token.replace(/^Bearer\s+/i, '').replace(/\s+/g, '').trim();
  let imageAspectEnum: string = 'IMAGE_ASPECT_RATIO_LANDSCAPE';
  if (aspectRatio === AspectRatio.Portrait) imageAspectEnum = 'IMAGE_ASPECT_RATIO_PORTRAIT';
  else if (aspectRatio === AspectRatio.Square) imageAspectEnum = 'IMAGE_ASPECT_RATIO_SQUARE';

  // Upload subject image
  onProgress(8, 'Mengunggah gambar produk...');
  const subjectBytes = await fileToBase64(subjectImage);
  const subjectUpload = await labsFetch(`${LABS_API_BASE_URL}/v1:uploadUserImage`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cleanToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageInput: {
        rawImageBytes: subjectBytes,
        mimeType: subjectImage.type || 'image/png',
        isUserUploaded: true,
        aspectRatio: imageAspectEnum,
      },
      clientContext: { sessionId: generateUUID(), tool: 'ASSET_MANAGER' },
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

  // Upload reference model image
  onProgress(16, 'Mengunggah gambar model...');
  const refBytes = await fileToBase64(referenceImage);
  const refUpload = await labsFetch(`${LABS_API_BASE_URL}/v1:uploadUserImage`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cleanToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageInput: {
        rawImageBytes: refBytes,
        mimeType: referenceImage.type || 'image/png',
        isUserUploaded: true,
        aspectRatio: imageAspectEnum,
      },
      clientContext: { sessionId: generateUUID(), tool: 'ASSET_MANAGER' },
    }),
    retry: 4,
    signal,
  });
  if (!refUpload.ok) {
    let msg = refUpload.statusText; try { msg = (await refUpload.json())?.error?.message || msg; } catch {}
    throw new Error(`Image upload failed (model): ${msg}`);
  }
  const refData = await refUpload.json();
  const refId = refData.mediaGenerationId?.mediaGenerationId || refData.mediaId;
  if (!refId) throw new Error('Failed to obtain mediaGenerationId for reference image.');

  // Run Image Recipe with two inputs
  onProgress(30, 'Memulai generasi gambar...');
  const seed = Math.floor(Math.random() * 2147483647);
  const payload = {
    clientContext: { workflowId: generateUUID(), tool: 'BACKBONE', sessionId: `${Date.now()}` },
    seed,
    // Many responses for dual-image inputs return imageModel "R2I"; align for better compatibility
    imageModelSettings: { imageModel: 'R2I', aspectRatio: imageAspectEnum },
    userInstruction: instruction,
    recipeMediaInputs: [
      { caption: 'Subject Image (Product)', mediaInput: { mediaCategory: 'MEDIA_CATEGORY_SUBJECT', mediaGenerationId: subjectId } },
      { caption: 'Reference Model', mediaInput: { mediaCategory: 'MEDIA_CATEGORY_SUBJECT', mediaGenerationId: refId } },
    ],
  };

  const runResp = await labsFetch(`${LABS_API_BASE_URL}/v1/whisk:runImageRecipe`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cleanToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    retry: 3,
    signal,
  });
  if (!runResp.ok) {
    let msg = runResp.statusText; try { msg = (await runResp.json())?.error?.message || msg; } catch {}
    throw new Error(`Image generation start failed: ${msg}`);
  }

  onProgress(60, 'Menyusun komposisi dan gaya...');
  const runData = await runResp.json();

  try {
    const encoded = runData?.imagePanels?.[0]?.generatedImages?.[0]?.encodedImage as string | undefined;
    if (encoded && typeof encoded === 'string' && encoded.length > 100) {
      const cleaned = encoded.replace(/\s+/g, '');
      const dataUrl = cleaned.startsWith('data:') ? cleaned : `data:image/png;base64,${cleaned}`;
      onProgress(100, 'Selesai!');
      return dataUrl;
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
  if (imageUrl) { onProgress(100, 'Selesai!'); return imageUrl; }

  const operation = runData?.operation || runData?.operations?.[0];
  if (!operation) throw new Error('Image generation response did not include a result URL.');
  let attempts = 0;
  while (attempts < 10) { attempts++; onProgress(Math.min(95, 65 + attempts * 3), 'Memproses...'); await sleep(3000); }
  throw new Error('Tidak mendapatkan URL gambar dari API. Silakan cek token atau coba lagi.');
}

export async function generateImageWithBackground(
  instruction: string,
  aspectRatio: AspectRatio,
  subjectImage: File,
  backgroundImage: File,
  token: string,
  onProgress: ImageProgressCallback,
  signal?: AbortSignal
): Promise<string> {
  if (typeof window !== 'undefined' && (window as any).__devtoolsOpen) {
    throw new Error('Operasi dibatalkan karena mode pengembang terdeteksi.');
  }
  if (!token) throw new Error('Authorization Token is missing. Please configure VEO_BEARER_TOKEN.');
  if (!subjectImage) throw new Error('Subject image is required.');
  if (!backgroundImage) throw new Error('Background image is required.');

  const cleanToken = token.replace(/^Bearer\s+/i, '').replace(/\s+/g, '').trim();
  let imageAspectEnum: string = 'IMAGE_ASPECT_RATIO_LANDSCAPE';
  if (aspectRatio === AspectRatio.Portrait) imageAspectEnum = 'IMAGE_ASPECT_RATIO_PORTRAIT';
  else if (aspectRatio === AspectRatio.Square) imageAspectEnum = 'IMAGE_ASPECT_RATIO_SQUARE';

  onProgress(8, 'Mengunggah gambar produk...');
  const subjectBytes = await fileToBase64(subjectImage);
  const subjectUpload = await labsFetch(`${LABS_API_BASE_URL}/v1:uploadUserImage`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cleanToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageInput: {
        rawImageBytes: subjectBytes,
        mimeType: subjectImage.type || 'image/png',
        isUserUploaded: true,
        aspectRatio: imageAspectEnum,
      },
      clientContext: { sessionId: generateUUID(), tool: 'ASSET_MANAGER' },
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

  onProgress(16, 'Mengunggah gambar background...');
  const bgBytes = await fileToBase64(backgroundImage);
  const bgUpload = await fetch(`${LABS_API_BASE_URL}/v1:uploadUserImage`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cleanToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageInput: {
        rawImageBytes: bgBytes,
        mimeType: backgroundImage.type || 'image/png',
        isUserUploaded: true,
        aspectRatio: imageAspectEnum,
      },
      clientContext: { sessionId: generateUUID(), tool: 'ASSET_MANAGER' },
    }),
    signal,
  });
  if (!bgUpload.ok) {
    let msg = bgUpload.statusText; try { msg = (await bgUpload.json())?.error?.message || msg; } catch {}
    throw new Error(`Image upload failed (background): ${msg}`);
  }
  const bgData = await bgUpload.json();
  const bgId = bgData.mediaGenerationId?.mediaGenerationId || bgData.mediaId;
  if (!bgId) throw new Error('Failed to obtain mediaGenerationId for background image.');

  onProgress(30, 'Memulai generasi gambar...');
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

  const runResp = await fetch(`${LABS_API_BASE_URL}/v1/whisk:runImageRecipe`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cleanToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  if (!runResp.ok) {
    let msg = runResp.statusText; try { msg = (await runResp.json())?.error?.message || msg; } catch {}
    throw new Error(`Image generation start failed: ${msg}`);
  }
  onProgress(60, 'Menyusun komposisi dan gaya...');
  const runData = await runResp.json();

  try {
    const encoded = runData?.imagePanels?.[0]?.generatedImages?.[0]?.encodedImage as string | undefined;
    if (encoded && typeof encoded === 'string' && encoded.length > 100) {
      const cleaned = encoded.replace(/\s+/g, '');
      const dataUrl = cleaned.startsWith('data:') ? cleaned : `data:image/png;base64,${cleaned}`;
      onProgress(100, 'Selesai!');
      return dataUrl;
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
  if (imageUrl) { onProgress(100, 'Selesai!'); return imageUrl; }

  const operation = runData?.operation || runData?.operations?.[0];
  if (!operation) throw new Error('Image generation response did not include a result URL.');
  let attempts = 0;
  while (attempts < 10) { attempts++; onProgress(Math.min(95, 65 + attempts * 3), 'Memproses...'); await sleep(3000); }
  throw new Error('Tidak mendapatkan URL gambar dari API. Silakan cek token atau coba lagi.');
}

export async function generateImageWithBackgroundAndReference(
  instruction: string,
  aspectRatio: AspectRatio,
  subjectImage: File,
  referenceImage: File,
  backgroundImage: File,
  token: string,
  onProgress: ImageProgressCallback,
  signal?: AbortSignal
): Promise<string> {
  if (typeof window !== 'undefined' && (window as any).__devtoolsOpen) {
    throw new Error('Operasi dibatalkan karena mode pengembang terdeteksi.');
  }
  if (!token) throw new Error('Authorization Token is missing. Please configure VEO_BEARER_TOKEN.');
  if (!subjectImage) throw new Error('Subject image is required.');
  if (!referenceImage) throw new Error('Reference model image is required.');
  if (!backgroundImage) throw new Error('Background image is required.');

  const cleanToken = token.replace(/^Bearer\s+/i, '').replace(/\s+/g, '').trim();
  let imageAspectEnum: string = 'IMAGE_ASPECT_RATIO_LANDSCAPE';
  if (aspectRatio === AspectRatio.Portrait) imageAspectEnum = 'IMAGE_ASPECT_RATIO_PORTRAIT';
  else if (aspectRatio === AspectRatio.Square) imageAspectEnum = 'IMAGE_ASPECT_RATIO_SQUARE';

  onProgress(8, 'Mengunggah gambar produk...');
  const subjectBytes = await fileToBase64(subjectImage);
  const subjectUpload = await fetch(`${LABS_API_BASE_URL}/v1:uploadUserImage`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cleanToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageInput: {
        rawImageBytes: subjectBytes,
        mimeType: subjectImage.type || 'image/png',
        isUserUploaded: true,
        aspectRatio: imageAspectEnum,
      },
      clientContext: { sessionId: generateUUID(), tool: 'ASSET_MANAGER' },
    }),
    signal,
  });
  if (!subjectUpload.ok) {
    let msg = subjectUpload.statusText; try { msg = (await subjectUpload.json())?.error?.message || msg; } catch {}
    throw new Error(`Image upload failed (subject): ${msg}`);
  }
  const subjectData = await subjectUpload.json();
  const subjectId = subjectData.mediaGenerationId?.mediaGenerationId || subjectData.mediaId;
  if (!subjectId) throw new Error('Failed to obtain mediaGenerationId for subject image.');

  onProgress(16, 'Mengunggah gambar model...');
  const refBytes = await fileToBase64(referenceImage);
  const refUpload = await labsFetch(`${LABS_API_BASE_URL}/v1:uploadUserImage`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cleanToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageInput: {
        rawImageBytes: refBytes,
        mimeType: referenceImage.type || 'image/png',
        isUserUploaded: true,
        aspectRatio: imageAspectEnum,
      },
      clientContext: { sessionId: generateUUID(), tool: 'ASSET_MANAGER' },
    }),
    retry: 4,
    signal,
  });
  if (!refUpload.ok) {
    let msg = refUpload.statusText; try { msg = (await refUpload.json())?.error?.message || msg; } catch {}
    throw new Error(`Image upload failed (model): ${msg}`);
  }
  const refData = await refUpload.json();
  const refId = refData.mediaGenerationId?.mediaGenerationId || refData.mediaId;
  if (!refId) throw new Error('Failed to obtain mediaGenerationId for reference image.');

  onProgress(24, 'Mengunggah gambar background...');
  const bgBytes = await fileToBase64(backgroundImage);
  const bgUpload = await labsFetch(`${LABS_API_BASE_URL}/v1:uploadUserImage`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cleanToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageInput: {
        rawImageBytes: bgBytes,
        mimeType: backgroundImage.type || 'image/png',
        isUserUploaded: true,
        aspectRatio: imageAspectEnum,
      },
      clientContext: { sessionId: generateUUID(), tool: 'ASSET_MANAGER' },
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

  onProgress(35, 'Memulai generasi gambar...');
  const seed = Math.floor(Math.random() * 2147483647);
  const payload = {
    clientContext: { workflowId: generateUUID(), tool: 'BACKBONE', sessionId: `${Date.now()}` },
    seed,
    imageModelSettings: { imageModel: 'R2I', aspectRatio: imageAspectEnum },
    userInstruction: instruction,
    recipeMediaInputs: [
      { caption: 'Subject Image (Product)', mediaInput: { mediaCategory: 'MEDIA_CATEGORY_SUBJECT', mediaGenerationId: subjectId } },
      { caption: 'Reference Model', mediaInput: { mediaCategory: 'MEDIA_CATEGORY_SUBJECT', mediaGenerationId: refId } },
      { caption: 'Background', mediaInput: { mediaCategory: 'MEDIA_CATEGORY_SUBJECT', mediaGenerationId: bgId } },
    ],
  };

  const runResp = await labsFetch(`${LABS_API_BASE_URL}/v1/whisk:runImageRecipe`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cleanToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    retry: 3,
    signal,
  });
  if (!runResp.ok) {
    let msg = runResp.statusText; try { msg = (await runResp.json())?.error?.message || msg; } catch {}
    throw new Error(`Image generation start failed: ${msg}`);
  }
  onProgress(65, 'Menyusun komposisi dan gaya...');
  const runData = await runResp.json();

  try {
    const encoded = runData?.imagePanels?.[0]?.generatedImages?.[0]?.encodedImage as string | undefined;
    if (encoded && typeof encoded === 'string' && encoded.length > 100) {
      const cleaned = encoded.replace(/\s+/g, '');
      const dataUrl = cleaned.startsWith('data:') ? cleaned : `data:image/png;base64,${cleaned}`;
      onProgress(100, 'Selesai!');
      return dataUrl;
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
  if (imageUrl) { onProgress(100, 'Selesai!'); return imageUrl; }

  const operation = runData?.operation || runData?.operations?.[0];
  if (!operation) throw new Error('Image generation response did not include a result URL.');
  let attempts = 0;
  while (attempts < 10) { attempts++; onProgress(Math.min(95, 70 + attempts * 3), 'Memproses...'); await sleep(3000); }
  throw new Error('Tidak mendapatkan URL gambar dari API. Silakan cek token atau coba lagi.');
}
