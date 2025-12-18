export const LABS_API_BASE_URL = 'https://aisandbox-pa.googleapis.com';
export const PROJECT_ID = '0d92b53d-9512-40c9-9164-4c256dcbbb16';

export type ImageAspectRatio = 
  | 'IMAGE_ASPECT_RATIO_LANDSCAPE'
  | 'IMAGE_ASPECT_RATIO_PORTRAIT'
  | 'IMAGE_ASPECT_RATIO_SQUARE';

export interface UploadImageParams {
  base64: string;
  mimeType: string;
  aspectRatio: ImageAspectRatio;
  token: string;
}

export interface GenerateImageParams {
  prompt: string;
  aspectRatio: ImageAspectRatio;
  token: string;
  seed?: number;
  mediaIds?: string[]; // Array of media IDs to use as reference
  count?: number; // Number of images to generate
}

export interface GeneratedImageResult {
  url?: string;
  base64?: string;
  mimeType?: string;
}

export const uploadUserImage = async ({ base64, mimeType, aspectRatio, token }: UploadImageParams) => {
  // Remove data URL prefix if present (e.g., "data:image/png;base64,")
  const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, "");

  const response = await fetch(`${LABS_API_BASE_URL}/v1:uploadUserImage`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      imageInput: {
        rawImageBytes: cleanBase64,
        mimeType,
        isUserUploaded: true,
        aspectRatio,
      },
      clientContext: {
        sessionId: crypto.randomUUID(),
        tool: 'ASSET_MANAGER',
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload failed: ${errorText}`);
  }

  const data = await response.json();
  // Return mediaId or mediaGenerationId based on what's available. 
  // Docs say: Respons berisi `mediaGenerationId.mediaGenerationId` atau `mediaId`.
  return data.mediaGenerationId?.mediaGenerationId || data.mediaId;
};

export const generateImage = async ({ prompt, aspectRatio, token, seed, mediaIds = [], count = 1 }: GenerateImageParams): Promise<GeneratedImageResult[]> => {
  const requests = Array.from({ length: count }).map((_, index) => ({
    clientContext: {
      sessionId: String(Date.now()),
    },
    // If seed is provided, increment it for variations. If not, generate random ones.
    seed: seed ? seed + index : Math.floor(Math.random() * 2147483647),
    imageModelName: 'GEM_PIX_2',
    imageAspectRatio: aspectRatio,
    prompt,
    imageInputs: mediaIds.map(id => ({
      name: id,
      imageInputType: 'IMAGE_INPUT_TYPE_REFERENCE',
    })),
  }));

  const response = await fetch(`${LABS_API_BASE_URL}/v1/projects/${PROJECT_ID}/flowMedia:batchGenerateImages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'text/plain;charset=UTF-8',
    },
    body: JSON.stringify({ requests }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Generation failed: ${errorText}`);
  }

  const data = await response.json();
  
  if (!data.media || !Array.isArray(data.media)) {
    throw new Error('No media returned from generation');
  }

  return data.media
    .map((m: any) => {
      const gi = m?.image?.generatedImage;
      const url = gi?.fifeUrl;
      const base64 = gi?.encodedImage;
      const mimeType = gi?.mimeType || 'image/png';
      return { url, base64, mimeType } as GeneratedImageResult;
    })
    .filter((item: GeneratedImageResult) => Boolean(item.url || item.base64));
};
