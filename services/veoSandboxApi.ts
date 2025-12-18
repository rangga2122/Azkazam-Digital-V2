import { AspectRatio, Resolution } from '../types';

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
const LABS_MIN_INTERVAL_MS = 1000;
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
                    const delay = Math.min(8000, 1500 * Math.pow(2, attempts)) + Math.floor(Math.random() * 300);
                    await sleep(delay);
                    continue;
                }
            }
            return resp;
        } catch (e) {
            if (attempts < maxRetry) {
                attempts++;
                const delay = Math.min(6000, 1000 * Math.pow(2, attempts)) + Math.floor(Math.random() * 250);
                await sleep(delay);
                continue;
            }
            throw e;
        } finally {
            labsInFlight = Math.max(0, labsInFlight - 1);
        }
    }
}

export async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') {
                resolve(reader.result.split(',')[1]);
            } else {
                reject(new Error('Failed to convert file to base64'));
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function cropImageToAspectRatio(imageBase64: string, aspectRatio: AspectRatio): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Canvas context not available'));
                return;
            }
            const targetW = aspectRatio === AspectRatio.Portrait ? 9 : 16;
            const targetH = aspectRatio === AspectRatio.Portrait ? 16 : 9;
            const targetAspect = targetW / targetH;
            const sourceAspect = img.width / img.height;
            let cropWidth: number;
            let cropHeight: number;
            let offsetX = 0;
            let offsetY = 0;
            if (sourceAspect > targetAspect) {
                cropHeight = img.height;
                cropWidth = img.height * targetAspect;
                offsetX = (img.width - cropWidth) / 2;
            } else {
                cropWidth = img.width;
                cropHeight = img.width / targetAspect;
                offsetY = (img.height - cropHeight) / 2;
            }
            canvas.width = cropWidth;
            canvas.height = cropHeight;
            ctx.drawImage(img, offsetX, offsetY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
            const dataUrl = canvas.toDataURL('image/png');
            resolve(dataUrl.split(',')[1]);
        };
        img.onerror = reject;
        img.src = imageBase64.startsWith('data:') ? imageBase64 : 'data:image/png;base64,' + imageBase64;
    });
}

type ProgressCallback = (progress: number, message: string) => void;

let cachedToken = '';
let cachedTokenAt = 0;
async function getSupabaseToken(): Promise<string> {
    try {
        const now = Date.now();
        if (cachedToken && (now - cachedTokenAt) < 60000) {
            return cachedToken;
        }
        const resp = await fetch(`/api/globalSettings?key=VEO_BEARER_TOKEN`);
        if (!resp.ok) return '';
        const json = await resp.json();
        cachedToken = (json?.value || '').trim();
        cachedTokenAt = Date.now();
        return cachedToken;
    } catch {
        return '';
    }
}

let cachedVideoMode = '';
let cachedVideoModeAt = 0;
async function getVideoModeOverride(): Promise<'normal' | 'relaxed' | ''> {
    try {
        const now = Date.now();
        if (cachedVideoMode && (now - cachedVideoModeAt) < 60000) return (cachedVideoMode as 'normal' | 'relaxed');
        // Prefer VEO_VIDEO_MODE
        const r1 = await fetch(`/api/globalSettings?key=VEO_VIDEO_MODE`);
        if (r1.ok) {
            const j = await r1.json();
            const val = (j?.value || '').trim().toLowerCase();
            if (val === 'normal' || val === 'relaxed') {
                cachedVideoMode = val;
                cachedVideoModeAt = Date.now();
                return (val as 'normal' | 'relaxed');
            }
        }
        // Backward compatibility: some deployments stored in VEO_VIDEO_MODEL as 'normal'/'relaxed'
        const r2 = await fetch(`/api/globalSettings?key=VEO_VIDEO_MODEL`);
        if (r2.ok) {
            const j2 = await r2.json();
            const val2 = (j2?.value || '').trim().toLowerCase();
            if (val2 === 'normal' || val2 === 'relaxed') {
                cachedVideoMode = val2;
                cachedVideoModeAt = Date.now();
                return (val2 as 'normal' | 'relaxed');
            }
        }
        return '';
    } catch {
        return '';
    }
}

export async function generateVeoVideo(
    prompt: string,
    aspectRatio: AspectRatio,
    resolution: Resolution,
    imageFile: File | null | undefined,
    token: string,
    onProgress: ProgressCallback,
    signal?: AbortSignal
): Promise<string> {
    const VIDEO_MESSAGES = [
        'Menginisialisasi pipeline generasi VEO 3...',
        'Memproses visi kreatif Anda...',
        'Menyusun aktor digital dan adegan...',
        'Menerapkan algoritma sinematik...',
        'Merender frame kualitas tinggi...',
        'Menyempurnakan elemen visual...',
        'Mengoptimalkan komposisi video...',
        'Menambahkan sentuhan akhir...',
        'Hampir siap... menghasilkan output final...',
        'Menyelesaikan pembuatan video...'
    ];

    const hasImage = !!imageFile;
    const isPortrait = aspectRatio === AspectRatio.Portrait;
    const isUltra = resolution === Resolution.FHD;

    const imageAspectEnum = isPortrait ? 'IMAGE_ASPECT_RATIO_PORTRAIT' : 'IMAGE_ASPECT_RATIO_LANDSCAPE';
    const videoAspectEnum = isPortrait ? 'VIDEO_ASPECT_RATIO_PORTRAIT' : 'VIDEO_ASPECT_RATIO_LANDSCAPE';

    let videoModelKey: string;
    if (hasImage) {
        if (isPortrait) {
            videoModelKey = isUltra ? 'veo_3_1_i2v_s_fast_portrait_ultra' : 'veo_3_1_i2v_s_fast_portrait';
        } else {
            videoModelKey = isUltra ? 'veo_3_1_i2v_s_fast_ultra' : 'veo_3_1_i2v_s_fast';
        }
    } else {
        if (isPortrait) {
            videoModelKey = isUltra ? 'veo_3_1_t2v_fast_portrait_ultra' : 'veo_3_1_t2v_fast_portrait';
        } else {
            videoModelKey = isUltra ? 'veo_3_1_t2v_fast_ultra' : 'veo_3_1_t2v_fast';
        }
    }

    const overrideMode = await getVideoModeOverride();
    if (overrideMode === 'relaxed') {
        if (!videoModelKey.endsWith('_relaxed')) videoModelKey = `${videoModelKey}_relaxed`;
    }

    let mediaId: string | null = null;
    let bearer = token && token.trim().length > 0 ? token.trim() : await getSupabaseToken();
    if (!bearer) throw new Error('Token otentikasi tidak ditemukan.');

    if (hasImage && imageFile) {
        onProgress(5, 'Memotong gambar sesuai rasio...');
        const base64 = await fileToBase64(imageFile);
        const cropped = await cropImageToAspectRatio(base64, aspectRatio);
        onProgress(10, 'Mengunggah gambar referensi...');
        if (signal?.aborted) throw new Error('Aborted');
        const uploadResponse = await labsFetch(`${LABS_API_BASE_URL}/v1:uploadUserImage`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${bearer}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                imageInput: {
                    rawImageBytes: cropped,
                    mimeType: 'image/png',
                    isUserUploaded: true,
                    aspectRatio: imageAspectEnum
                },
                clientContext: {
                    sessionId: generateUUID(),
                    tool: 'ASSET_MANAGER'
                }
            }),
            retry: 4,
            signal
        });
        if (!uploadResponse.ok) {
            const errText = await uploadResponse.text().catch(() => '');
            throw new Error(`Gagal mengunggah gambar (${uploadResponse.status}). ${errText}`);
        }
        const uploadData = await uploadResponse.json();
        mediaId = uploadData.mediaGenerationId?.mediaGenerationId || uploadData.mediaId;
        if (!mediaId) throw new Error('Gagal mendapatkan ID media dari respon upload.');
    } else {
        onProgress(10, 'Menyiapkan Text-to-Video...');
    }

    onProgress(20, 'Memulai pembuatan video...');
    const seed = Math.floor(Math.random() * 2147483647);
    const sceneId = generateUUID();

    const requestPayload: any = {
        aspectRatio: videoAspectEnum,
        textInput: { prompt },
        videoModelKey: videoModelKey,
        seed: seed
    };
    if (hasImage) {
        requestPayload.metadata = { sceneId: sceneId };
        if (mediaId) requestPayload.startImage = { mediaId: mediaId };
    }

    const videoPayload: any = {
        clientContext: { tool: 'PINHOLE' },
        requests: [requestPayload]
    };
    if (hasImage) videoPayload.clientContext.userPaygateTier = 'PAYGATE_TIER_TWO';

    const endpoint = hasImage ? '/v1/video:batchAsyncGenerateVideoStartImage' : '/v1/video:batchAsyncGenerateVideoText';
    if (signal?.aborted) throw new Error('Aborted');
    const startResponse = await labsFetch(`${LABS_API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${bearer}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(videoPayload),
        retry: 4,
        signal
    });
    if (!startResponse.ok) {
        const errorText = await startResponse.text().catch(() => '');
        if (startResponse.status === 429) throw new Error('Terlalu banyak permintaan (Throttled).');
        throw new Error(`Gagal memulai generasi (${startResponse.status}). ${errorText}`);
    }
    const startData = await startResponse.json();
    let operation = startData.operations?.[0];
    if (!operation) throw new Error('Tidak menerima operasi valid untuk polling.');

    let poll = 0;
    const MAX_POLLS = 120;
    while (poll < MAX_POLLS) {
        if (signal?.aborted) throw new Error('Aborted');
        await sleep(10000);
        poll++;
        const idx = poll % VIDEO_MESSAGES.length;
        const prog = Math.min(95, Math.round(25 + (poll / MAX_POLLS) * 65));
        onProgress(prog, VIDEO_MESSAGES[idx]);
        const pollResponse = await labsFetch(`${LABS_API_BASE_URL}/v1/video:batchCheckAsyncVideoGenerationStatus`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${bearer}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ operations: [operation] }),
            retry: 1,
            signal
        });
        if (!pollResponse.ok) continue;
        const pollData = await pollResponse.json();
        const currentOp = pollData.operations?.[0];
        if (!currentOp) continue;
        operation = currentOp;
        if (operation.status === 'MEDIA_GENERATION_STATUS_SUCCESSFUL') {
            onProgress(100, 'Menyelesaikan pembuatan video...');
            const videoUrl = operation.operation?.metadata?.video?.fifeUrl;
            if (!videoUrl) throw new Error('Generasi berhasil, tetapi URL video tidak ditemukan.');
            return videoUrl;
        }
        if (operation.status === 'MEDIA_GENERATION_STATUS_FAILED') {
            const msg = operation.operation?.error?.message || 'Generasi video gagal';
            throw new Error(msg);
        }
    }
    throw new Error('Waktu generasi habis (Timeout).');
}
