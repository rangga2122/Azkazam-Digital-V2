import { AspectRatio, Resolution } from '../types';

const LABS_API_BASE_URL = 'https://aisandbox-pa.googleapis.com';

// Helper to generate UUIDs for session context
function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

// Helper for delay
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper to convert file to base64
export async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') {
                // Remove data URL prefix if present
                resolve(reader.result.split(',')[1]);
            } else {
                reject(new Error('Failed to convert file to base64'));
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export type ProgressCallback = (progress: number, message: string) => void;

export async function generateVeoVideo(
    prompt: string,
    aspectRatio: AspectRatio,
    resolution: Resolution,
    imageFile: File | null | undefined,
    token: string,
    onProgress: ProgressCallback
): Promise<string> {

    const hasImage = !!imageFile;
    const isPortrait = aspectRatio === AspectRatio.Portrait;
    const isUltra = resolution === Resolution.FHD;

    // Map to API enums
    const imageAspectEnum = isPortrait ? "IMAGE_ASPECT_RATIO_PORTRAIT" : "IMAGE_ASPECT_RATIO_LANDSCAPE";
    const videoAspectEnum = isPortrait ? "VIDEO_ASPECT_RATIO_PORTRAIT" : "VIDEO_ASPECT_RATIO_LANDSCAPE";

    // Select model key based on input type, aspect ratio, and resolution (ultra for 1080p)
    let videoModelKey: string;
    if (hasImage) {
        // Image-to-Video models
        if (isPortrait) {
             videoModelKey = isUltra ? "veo_3_1_i2v_s_fast_portrait_ultra" : "veo_3_1_i2v_s_fast_portrait";
        } else {
             videoModelKey = isUltra ? "veo_3_1_i2v_s_fast_ultra" : "veo_3_1_i2v_s_fast";
        }
    } else {
        // Text-to-Video models
        if (isPortrait) {
            videoModelKey = isUltra ? "veo_3_1_t2v_fast_portrait_ultra" : "veo_3_1_t2v_fast_portrait";
        } else {
            videoModelKey = isUltra ? "veo_3_1_t2v_fast_ultra" : "veo_3_1_t2v_fast";
        }
    }

    let mediaId: string | null = null;

    // --- STEP 1: Image Upload (if applicable) ---
    if (hasImage && imageFile) {
        onProgress(10, 'Uploading reference image...');
        const imageBase64 = await fileToBase64(imageFile);

        const uploadResponse = await fetch(`/api/aisandboxProxy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: '/v1:uploadUserImage',
                body: {
                    imageInput: {
                        rawImageBytes: imageBase64,
                        mimeType: imageFile.type || "image/png",
                        isUserUploaded: true,
                        aspectRatio: imageAspectEnum
                    },
                    clientContext: {
                        sessionId: generateUUID(),
                        tool: "ASSET_MANAGER"
                    }
                }
            })
        });

        if (!uploadResponse.ok) {
            throw new Error(`Image upload failed: ${uploadResponse.statusText}`);
        }

        const uploadData = await uploadResponse.json();
        mediaId = uploadData.mediaGenerationId?.mediaGenerationId || uploadData.mediaId;

        if (!mediaId) {
            throw new Error('Failed to get mediaId from image upload.');
        }
    }

    // --- STEP 2: Start Generation ---
    onProgress(20, 'Initializing cinematic generation...');
    const seed = Math.floor(Math.random() * 2147483647);

    const requestPayload: any = {
        aspectRatio: videoAspectEnum,
        textInput: { prompt },
        videoModelKey: videoModelKey,
        seed: seed
    };

    if (hasImage && mediaId) {
        requestPayload.metadata = { sceneId: generateUUID() };
        requestPayload.startImage = { mediaId: mediaId };
    }

    const videoPayload = {
        clientContext: {
            tool: "PINHOLE",
            ...(hasImage ? { userPaygateTier: "PAYGATE_TIER_TWO" } : {})
        },
        requests: [requestPayload]
    };

    const endpoint = hasImage
        ? '/v1/video:batchAsyncGenerateVideoStartImage'
        : '/v1/video:batchAsyncGenerateVideoText';

    const startResponse = await fetch(`/api/aisandboxProxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: endpoint, body: videoPayload })
    });

    if (!startResponse.ok) {
        let errorMsg = startResponse.statusText;
        try {
            const errJson = await startResponse.json();
             errorMsg = errJson.error?.message || JSON.stringify(errJson);
        } catch (e) { /* ignore */ }
        throw new Error(`Generation start failed (${startResponse.status}): ${errorMsg}`);
    }

    const startData = await startResponse.json();
    let operation = startData.operations?.[0];
    if (!operation) {
        throw new Error('No valid operation returned from start request.');
    }

    // --- STEP 3: Polling ---
    const POLL_MESSAGES = [
        "Assembling digital actors...",
        "Applying cinematic lighting...",
        "Rendering frames...",
        "Compositing final scene...",
        "Polishing pixels..."
    ];

    let pollCount = 0;
    const MAX_POLLS = 180; // ~30 minutes max

    while (pollCount < MAX_POLLS) {
        await sleep(10000); // 10s interval
        pollCount++;

        const msgIndex = pollCount % POLL_MESSAGES.length;
        // Fake progress that slows down as it gets closer to 95%
        const progress = Math.min(95, 20 + (pollCount / 60) * 75);
        onProgress(progress, POLL_MESSAGES[msgIndex]);

        const pollResponse = await fetch(`/api/aisandboxProxy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '/v1/video:batchCheckAsyncVideoGenerationStatus', body: { operations: [operation] } })
        });

        if (!pollResponse.ok) continue;

        const pollData = await pollResponse.json();
        const currentOp = pollData.operations?.[0];

        if (!currentOp) continue;
        operation = currentOp;

        if (operation.status === 'MEDIA_GENERATION_STATUS_SUCCESSFUL') {
            onProgress(100, 'Finalizing...');
            const videoUrl = operation.operation?.metadata?.video?.fifeUrl;
            if (!videoUrl) throw new Error('Generation successful but no video URL found.');
            return videoUrl;
        } else if (operation.status === 'MEDIA_GENERATION_STATUS_FAILED') {
            throw new Error(operation.operation?.error?.message || 'Video generation failed.');
        }
    }

    throw new Error('Generation timed out.');
}
