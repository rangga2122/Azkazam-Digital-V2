
import { getToken } from './storage';
import { AspectRatio } from '../types';

const LABS_API_BASE_URL = 'https://aisandbox-pa.googleapis.com';

const VIDEO_GENERATION_MESSAGES = [
  "Menginisialisasi pipeline generasi VEO 3...",
  "Memproses visi kreatif Anda...",
  "Menyusun aktor digital dan adegan...",
  "Menerapkan algoritma sinematik...",
  "Merender frame kualitas tinggi...",
  "Menyempurnakan elemen visual...",
  "Mengoptimalkan komposisi video...",
  "Menambahkan sentuhan akhir...",
  "Hampir siap... menghasilkan output final...",
  "Menyelesaikan pembuatan video..."
];

// Helper: UUID Generator
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0,
        v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Helper: Sleep
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Crop Image
async function cropImageToAspectRatio(imageBase64: string, aspectRatio: AspectRatio): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error("Gagal menginisialisasi canvas context"));
        return;
      }

      const [targetW, targetH] = aspectRatio === '9:16' ? [9, 16] : [16, 9];
      const targetAspect = targetW / targetH;
      const sourceAspect = img.width / img.height;

      let cropWidth, cropHeight, offsetX = 0, offsetY = 0;

      if (sourceAspect > targetAspect) {
        // Source lebih lebar, crop lebar
        cropHeight = img.height;
        cropWidth = img.height * targetAspect;
        offsetX = (img.width - cropWidth) / 2;
      } else {
        // Source lebih tinggi, crop tinggi
        cropWidth = img.width;
        cropHeight = img.width / targetAspect;
        offsetY = (img.height - cropHeight) / 2;
      }

      canvas.width = cropWidth;
      canvas.height = cropHeight;

      ctx.drawImage(img, offsetX, offsetY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

      // Return base64 string without prefix
      const croppedDataUrl = canvas.toDataURL('image/png');
      const croppedBase64 = croppedDataUrl.split(',')[1];
      resolve(croppedBase64);
    };
    img.onerror = reject;
    // Ensure prefix is present for loading
    img.src = imageBase64.startsWith('data:') ? imageBase64 : 'data:image/png;base64,' + imageBase64;
  });
}

export const generateVideo = async (
  prompt: string, 
  aspectRatio: AspectRatio,
  imageBase64: string | null, // Raw base64 string or null
  onProgress: (progress: number, message: string) => void
): Promise<string> => {
  
  const token = getToken();
  if (!token) {
    throw new Error("Token otentikasi tidak ditemukan. Harap atur token di pengaturan.");
  }

  try {
    const hasImage = !!imageBase64 && imageBase64.length > 0;
    
    // Enum mapping
    const imageAspectRatioEnum = aspectRatio === '9:16' ? "IMAGE_ASPECT_RATIO_PORTRAIT" : "IMAGE_ASPECT_RATIO_LANDSCAPE";
    const videoAspectRatioEnum = aspectRatio === '9:16' ? "VIDEO_ASPECT_RATIO_PORTRAIT" : "VIDEO_ASPECT_RATIO_LANDSCAPE";

    // Model selection logic
    let videoModelKey;
    if (hasImage) {
        // Image-to-Video models
        videoModelKey = aspectRatio === '9:16' ?
            "veo_3_1_i2v_s_fast_portrait_ultra" :
            "veo_3_1_i2v_s_fast_ultra";
    } else {
        // Text-to-Video models
        videoModelKey = aspectRatio === '9:16' ?
            "veo_3_1_t2v_fast_portrait_ultra" :
            "veo_3_1_t2v_fast_ultra";
    }

    let mediaId = null;

    // --- STEP 1: IMAGE UPLOAD (If Image-to-Video) ---
    if (hasImage && imageBase64) {
      onProgress(5, 'Memotong gambar sesuai rasio...');
      const croppedImageBase64 = await cropImageToAspectRatio(imageBase64, aspectRatio);

      onProgress(10, 'Mengunggah gambar referensi...');
      
      const uploadResponse = await fetch(`${LABS_API_BASE_URL}/v1:uploadUserImage`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageInput: {
            rawImageBytes: croppedImageBase64,
            mimeType: "image/png",
            isUserUploaded: true,
            aspectRatio: imageAspectRatioEnum
          },
          clientContext: {
            sessionId: generateUUID(),
            tool: "ASSET_MANAGER"
          }
        })
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error("Upload Error:", errorText);
        throw new Error(`Gagal mengunggah gambar (${uploadResponse.status}). Cek token Anda.`);
      }

      const uploadData = await uploadResponse.json();
      mediaId = uploadData.mediaGenerationId?.mediaGenerationId || uploadData.mediaId;

      if (!mediaId) {
        throw new Error('Gagal mendapatkan ID media dari respon upload.');
      }
    } else {
      onProgress(10, 'Menyiapkan Text-to-Video...');
    }

    // --- STEP 2: START GENERATION ---
    onProgress(20, 'Memulai pembuatan video...');
    const seed = Math.floor(Math.random() * 2147483647);
    const sceneId = generateUUID();

    // Payload construction
    const requestPayload: any = {
      aspectRatio: videoAspectRatioEnum,
      textInput: { prompt },
      videoModelKey: videoModelKey,
      seed: seed
    };

    if (hasImage) {
      requestPayload.metadata = { sceneId: sceneId };
      if (mediaId) {
        requestPayload.startImage = { mediaId: mediaId };
      }
    }

    const videoPayload: any = {
      clientContext: {
        tool: "PINHOLE"
      },
      requests: [requestPayload]
    };

    if (hasImage) {
      videoPayload.clientContext.userPaygateTier = "PAYGATE_TIER_TWO";
    }

    // Endpoint selection
    const endpoint = hasImage ? 
      '/v1/video:batchAsyncGenerateVideoStartImage' : 
      '/v1/video:batchAsyncGenerateVideoText';

    const startVideoResponse = await fetch(`${LABS_API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(videoPayload)
    });

    if (!startVideoResponse.ok) {
      const errorText = await startVideoResponse.text();
      console.error("Start Generation Error:", errorText);
      
      if (startVideoResponse.status === 429) {
        throw new Error("Terlalu banyak permintaan (Throttled). Harap tunggu beberapa saat.");
      }
      throw new Error(`Gagal memulai generasi (${startVideoResponse.status}). Cek token atau kuota.`);
    }

    const startData = await startVideoResponse.json();
    let operationToPoll = startData.operations?.[0];

    if (!operationToPoll) {
      throw new Error('Tidak menerima operasi valid untuk polling.');
    }

    // --- STEP 3: POLLING STATUS ---
    const MAX_POLLS = 120; // Max 20 menit (interval 10 detik)
    let messageIndex = 0;

    for (let i = 0; i < MAX_POLLS; i++) {
      // Wait 10 seconds
      await sleep(10000);

      // Update progress UI simulation
      const currentProgress = 25 + (i / MAX_POLLS) * 65; 
      onProgress(Math.min(95, Math.round(currentProgress)), VIDEO_GENERATION_MESSAGES[messageIndex]);
      messageIndex = (messageIndex + 1) % VIDEO_GENERATION_MESSAGES.length;

      const pollResponse = await fetch(
        `${LABS_API_BASE_URL}/v1/video:batchCheckAsyncVideoGenerationStatus`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            operations: [operationToPoll]
          })
      });

      if (!pollResponse.ok) continue;

      const pollData = await pollResponse.json();
      operationToPoll = pollData.operations?.[0];

      if (!operationToPoll) continue;

      if (operationToPoll.status === 'MEDIA_GENERATION_STATUS_SUCCESSFUL') {
        const videoUrl = operationToPoll.operation?.metadata?.video?.fifeUrl;
        if (!videoUrl) {
          throw new Error('Generasi berhasil, tetapi URL video tidak ditemukan.');
        }
        return videoUrl;
      } else if (operationToPoll.status === 'MEDIA_GENERATION_STATUS_FAILED') {
        const failureReason = operationToPoll.operation?.error?.message || 'Alasan tidak diketahui';
        throw new Error(`Generasi video gagal: ${failureReason}`);
      }
      // Status lain: MEDIA_GENERATION_STATUS_PENDING, ACTIVE, dll -> lanjut loop
    }

    throw new Error('Waktu generasi habis (Timeout) setelah 20 menit.');

  } catch (error: any) {
    throw error;
  }
};
