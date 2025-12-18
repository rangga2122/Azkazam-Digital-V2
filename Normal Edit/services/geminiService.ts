import { GoogleGenAI } from "@google/genai";
import { processAudio } from './audioService';

let cachedGeminiKey = '';
let cachedGeminiKeyAt = 0;
async function getGeminiApiKey(): Promise<string> {
    try {
        const now = Date.now();
        if (cachedGeminiKey && (now - cachedGeminiKeyAt) < 60000) return cachedGeminiKey;
        const resp = await fetch(`/api/globalSettings?key=GEMINI_API_KEY`);
        if (!resp.ok) {
            const fallback = (localStorage.getItem('GEMINI_API_KEY') || '').trim();
            cachedGeminiKey = fallback;
            cachedGeminiKeyAt = Date.now();
            return cachedGeminiKey;
        }
        const json = await resp.json();
        cachedGeminiKey = (json?.value || '').trim();
        cachedGeminiKeyAt = Date.now();
        return cachedGeminiKey;
    } catch {
        const fallback = (localStorage.getItem('GEMINI_API_KEY') || '').trim();
        cachedGeminiKey = fallback;
        cachedGeminiKeyAt = Date.now();
        return cachedGeminiKey;
    }
}

let cachedTextModel = '';
let cachedTtsModel = '';
let cachedModelAt = 0;
async function getGeminiModel(kind: 'text' | 'tts'): Promise<string> {
    try {
        const now = Date.now();
        if ((now - cachedModelAt) < 60000) {
            return kind === 'text' ? (cachedTextModel || 'gemini-2.5-flash') : (cachedTtsModel || 'gemini-2.5-flash-preview-tts');
        }
        const key = kind === 'text' ? 'GEMINI_TEXT_MODEL' : 'GEMINI_TTS_MODEL';
        const resp = await fetch(`/api/globalSettings?key=${key}`);
        if (!resp.ok) {
            cachedModelAt = Date.now();
            return kind === 'text' ? (cachedTextModel || 'gemini-2.5-flash') : (cachedTtsModel || 'gemini-2.5-flash-preview-tts');
        }
        const json = await resp.json();
        const val = (json?.value || '').trim();
        if (kind === 'text') cachedTextModel = val; else cachedTtsModel = val;
        cachedModelAt = Date.now();
        return val || (kind === 'text' ? 'gemini-2.5-flash' : 'gemini-2.5-flash-preview-tts');
    } catch {
        cachedModelAt = Date.now();
        return kind === 'text' ? (cachedTextModel || 'gemini-2.5-flash') : (cachedTtsModel || 'gemini-2.5-flash-preview-tts');
    }
}

// Voice options with detailed descriptions
export const voices = [
    { name: 'Zephyr', description: 'Sari - Cewek, Cerah & Jelas', displayName: 'Sari' }, 
    { name: 'Puck', description: 'Budi - Cowok, Ceria & Semangat', displayName: 'Budi' }, 
    { name: 'Charon', description: 'Andi - Cowok, Informatif & Formal', displayName: 'Andi' }, 
    { name: 'Kore', description: 'Dewi - Cewek, Tegas & Kuat', displayName: 'Dewi' }, 
    { name: 'Fenrir', description: 'Rudi - Cowok, Mudah Bersemangat', displayName: 'Rudi' }, 
    { name: 'Leda', description: 'Sinta - Cewek, Muda & Segar', displayName: 'Sinta' }, 
    { name: 'Orus', description: 'Agus - Cowok, Tegas & Dewasa', displayName: 'Agus' }, 
    { name: 'Aoede', description: 'Maya - Cewek, Ringan & Santai', displayName: 'Maya' }, 
    { name: 'Callirrhoe', description: 'Rina - Cewek, Mudah Bergaul', displayName: 'Rina' }, 
    { name: 'Enceladus', description: 'Dian - Cewek, Berbisik & Lembut', displayName: 'Dian' }, 
    { name: 'Iapetus', description: 'Bayu - Cowok, Jernih & Tegas', displayName: 'Bayu' }, 
    { name: 'Umbriel', description: 'Indah - Cewek, Ramah & Santai', displayName: 'Indah' }, 
    { name: 'Algieba', description: 'Lestari - Cewek, Halus & Lembut', displayName: 'Lestari' }, 
    { name: 'Gacrux', description: 'Hendra - Cowok, Dewasa & Matang', displayName: 'Hendra' }, 
    { name: 'Pulcherrima', description: 'Fitri - Cewek, Terus Terang', displayName: 'Fitri' }, 
    { name: 'Achird', description: 'Joko - Cowok, Ramah & Bersahabat', displayName: 'Joko' }, 
    { name: 'Zubenelgenubi', description: 'Wati - Cewek, Kasual & Santai', displayName: 'Wati' }, 
    { name: 'Vindemiatrix', description: 'Putri - Cewek, Lembut & Tenang', displayName: 'Putri' }, 
    { name: 'Sadachbia', description: 'Eko - Cowok, Hidup & Bersemangat', displayName: 'Eko' }, 
    { name: 'Sulafat', description: 'Ayu - Cewek, Hangat & Menenangkan', displayName: 'Ayu' }
];

// Style options for voice intonation
export const styles = [
    "Ucapkan dengan lembut:", 
    "Katakan dengan gembira:", 
    "Bacakan dengan nada sedih:", 
    "Berbisik:", 
    "Bicaralah perlahan:", 
    "Baca seperti penyiar berita:", 
    "Ucapkan dengan suara robot:", 
    "Katakan dengan antusias:", 
    "Baca dengan nada datar:", 
    "Ucapkan dengan nada marah:", 
    "Bicaralah dengan cepat:", 
    "Nyanyikan teks ini:"
];

// Audio processing functions
function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

function pcmToWav(pcmData: ArrayBuffer, sampleRate: number): Blob {
    const numChannels = 1;
    const bitsPerSample = 16;
    const dataSize = pcmData.byteLength;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    const pcm16 = new Int16Array(pcmData);
    for (let i = 0; i < pcm16.length; i++) {
        view.setInt16(44 + i * 2, pcm16[i], true);
    }

    return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string): void {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

// Helper: convert ArrayBuffer to Base64 (browser-safe)
function arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// Mapping instruksi gaya narasi agar singkat dan langsung ke inti
function getNarrativeStyleGuidance(style: string): string {
    const s = (style || '').toLowerCase();
    if (s.includes('menjual')) {
        return 'Nada persuasif, langsung ke manfaat utama dan CTA jelas. Maksimal 3 kalimat, 12–22 kata per kalimat.';
    }
    if (s.includes('profesional')) {
        return 'Nada berwibawa dan ringkas. Fokus kualitas dan manfaat. Maksimal 3 kalimat. CTA halus namun tegas.';
    }
    if (s.includes('formal')) {
        return 'Bahasa rapi dan sopan. Tekankan kualitas, kenyamanan, dan fungsi. Maksimal 3 kalimat. CTA elegan.';
    }
    if (s.includes('gaul')) {
        return 'Nada kekinian, ringan, dan friendly. Gunakan kata populer namun sopan. Maksimal 3 kalimat. CTA energik.';
    }
    if (s.includes('humoris')) {
        return 'Nada hangat dengan sentuhan humor ringan, tetap relevan dan profesional. Maksimal 3 kalimat.';
    }
    if (s.includes('elegan')) {
        return 'Nada elegan dan refined. Tonjolkan detail, rasa percaya diri, dan kenyamanan. Maksimal 3 kalimat.';
    }
    if (s.includes('story')) {
        return 'Kalimat 1 gambarkan suasana singkat; kalimat 2 manfaat inti; kalimat 3 CTA. Maksimal 3 kalimat.';
    }
    return 'Nada santai dan natural, langsung ke manfaat utama. Maksimal 3 kalimat dengan CTA ringan.';
}

// API call with retry mechanism
async function makeApiCall(payload: any): Promise<any> {
    const key = await getGeminiApiKey();
    const model = await getGeminiModel('tts');
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const response = await fetch(apiUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    if (!response.ok) {
        let message = `HTTP ${response.status}`; try { message = (await response.json())?.error?.message || message; } catch {}
        throw new Error(message);
    }
    return await response.json();
}

export const generateSpeech = async (
    text: string,
    voiceName: string,
    style: string,
    onProgress: (message: string) => void,
    temperature: number = 1.0
): Promise<string> => {
    try {
        onProgress("Memulai proses text-to-speech...");
        
        // Validate input
        if (!text.trim()) {
            throw new Error("Silakan masukkan teks terlebih dahulu.");
        }
        
        if (!voiceName) {
            throw new Error("Silakan pilih suara terlebih dahulu.");
        }

        onProgress("Mengirim permintaan ke Gemini TTS...");
        
        // Apply style to text if provided
        let processedText = text.trim();
        if (style) {
            // Check if text already has SSML tags
            const isSsml = processedText.startsWith('<speak>');
            if (isSsml) {
                processedText = processedText.replace(/<\/?speak>/g, '').trim();
            }
            
            // Remove existing style prefixes
            styles.forEach(existingStyle => {
                if (processedText.startsWith(existingStyle)) {
                    processedText = processedText.substring(existingStyle.length).trim();
                }
            });
            
            // Add new style
            processedText = `${style} ${processedText}`.trim();
            
            // Re-add SSML tags if they were present
            if (isSsml) {
                processedText = `<speak>\n  ${processedText}\n</speak>`;
            }
        }
        
        const payload = {
            contents: [{ parts: [{ text: processedText }] }],
            generationConfig: {
                temperature: temperature,
                responseModalities: ["AUDIO"],
                speechConfig: { 
                    voiceConfig: { 
                        prebuiltVoiceConfig: { voiceName: voiceName } 
                    } 
                }
            }
        };
        
        onProgress("Memproses respons audio...");
        
        const result = await makeApiCall(payload);
        const part = result?.candidates?.[0]?.content?.parts?.[0];
        const audioData = part?.inlineData?.data;
        const mimeType = part?.inlineData?.mimeType;

        if (audioData && mimeType && mimeType.startsWith("audio/")) {
            onProgress("Mengkonversi audio ke format WAV...");
            
            const sampleRateMatch = mimeType.match(/rate=(\d+)/);
            const sampleRate = sampleRateMatch ? parseInt(sampleRateMatch[1], 10) : 24000;
            
            const pcmBuffer = base64ToArrayBuffer(audioData);
            const wavBlob = pcmToWav(pcmBuffer, sampleRate);
            const audioUrl = URL.createObjectURL(wavBlob);
            
            onProgress("🎉 Audio berhasil dibuat!");
            
            return audioUrl;
        } else {
            throw new Error("Struktur respons audio tidak valid. Cek kembali format SSML atau teks Anda.");
        }
    } catch (error) {
        console.error("Error generating speech:", error);
        if (error instanceof Error) throw error;
        throw new Error("Gagal membuat audio dari teks");
    }
};

// Vision: Generate Indonesian product narration from image
export const generateNarrationFromImage = async (
    imageFile: File,
    style: string,
    onProgress: (message: string) => void,
    language: string = 'id'
): Promise<string> => {
    try {
        if (!imageFile) throw new Error('Silakan unggah foto produk terlebih dahulu.');
        onProgress('Mengunggah foto produk...');

        const base64Image = arrayBufferToBase64(await imageFile.arrayBuffer());

        // Prompt diarahkan untuk copywriting produk, 2 paragraf yang ter-ground pada gambar
        const guidance = getNarrativeStyleGuidance(style);
        const styleText = style ? `Gaya bahasa: ${style}.` : 'Gaya bahasa: Santai.';
        const langLabelMap: Record<string, string> = { id: 'bahasa indonesia', en: 'bahasa inggris', ms: 'bahasa malaysia', es: 'bahasa spanyol', fr: 'bahasa prancis', ar: 'bahasa arab', hi: 'bahasa hindi', ja: 'bahasa jepang', ko: 'bahasa korea', zh: 'bahasa mandarin' };
        const languageText = langLabelMap[language] || 'bahasa indonesia';
        const prompt = `Anda adalah copywriter brand berpengalaman. Analisis visual dari gambar terlampir dan hasilkan narasi promosi dalam ${languageText}. ${styleText}\n\nInstruksi keras (wajib):\n- ${guidance}\n- Grounding ke gambar: sebutkan atribut yang terlihat (jenis produk, bahan/tekstur, warna/pola, detail/logo, suasana/aktivitas).\n- Tekankan manfaat, kenyamanan, kualitas, dan rasa percaya diri.\n- FORMAT: tepat 2 paragraf, masing-masing 1–2 kalimat. Tanpa bullet/emoji.\n- Paragraf kedua harus berakhir dengan CTA (mis. Dapatkan/Miliki/Coba/Upgrade sekarang).\n- Jangan menyebut kata "gambar" atau "produk ini"; deskripsikan objek secara natural.`;

        const key = await getGeminiApiKey();
        const textModel = await getGeminiModel('text');
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${textModel}:generateContent?key=${key}`;
        const response = await fetch(apiUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { text: prompt },
                            { inlineData: { data: base64Image, mimeType: imageFile.type || 'image/jpeg' } }
                        ]
                    }
                ],
                generationConfig: { temperature: 1.0 }
            })
        });
        if (!response.ok) {
            let msg = `HTTP ${response.status}`; try { msg = (await response.json())?.error?.message || msg; } catch {}
            throw new Error(msg);
        }
        onProgress('Menganalisis gambar dengan Gemini...');
        const data = await response.json();
        const partsArr = data?.candidates?.[0]?.content?.parts || [];
        const text = partsArr.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('\n').trim();
        if (!text) throw new Error('Respons AI tidak berisi narasi.');
        onProgress('🎉 Narasi berhasil dibuat dari gambar!');
        return text.trim();
    } catch (error) {
        console.error('Error generate narration from image:', error);
        if (error instanceof Error) throw error;
        throw new Error('Gagal membuat narasi dari gambar');
    }
};

// Vision: Generate short caption with emojis and 5 hashtags from image
export const generateCaptionFromImage = async (
    imageFile: File,
    onProgress: (message: string) => void
): Promise<{ caption: string; hashtags: string }> => {
    try {
        if (!imageFile) throw new Error('Silakan unggah foto produk terlebih dahulu.');
        onProgress('Mengunggah foto produk...');

        const base64Image = arrayBufferToBase64(await imageFile.arrayBuffer());

        const prompt = `Analisis gambar terlampir dan buat konten posting TikTok dalam bahasa Indonesia.
Instruksi wajib:
- Tulis satu caption pendek (maks 150 karakter), menarik, dan tambahkan 2–3 emotikon yang relevan.
- Jangan sebut kata "gambar" atau "produk ini"; deskripsikan secara natural sesuai visual.
- Beri ajakan komentar, misalnya: Komen 'MAU' untuk detail!
- Sertakan tepat 5 hashtag di baris terpisah; campur kata kunci produk + hashtag tren yang relevan.

Format output tanpa penjelasan:
Caption: [isi caption]
Hashtags: [#tag1 #tag2 #tag3 #tag4 #tag5]`;

        const key = await getGeminiApiKey();
        const textModel = await getGeminiModel('text');
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${textModel}:generateContent?key=${key}`;
        const response = await fetch(apiUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { text: prompt },
                            { inlineData: { data: base64Image, mimeType: imageFile.type || 'image/jpeg' } }
                        ]
                    }
                ],
                generationConfig: { temperature: 0.9 }
            })
        });
        if (!response.ok) {
            let msg = `HTTP ${response.status}`; try { msg = (await response.json())?.error?.message || msg; } catch {}
            throw new Error(msg);
        }
        onProgress('Menganalisis gambar untuk caption...');
        const data = await response.json();
        const partsArr = data?.candidates?.[0]?.content?.parts || [];
        const text = partsArr.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('\n').trim();
        if (!text) throw new Error('Respons AI tidak berisi caption.');
        const captionMatch = text.match(/Caption:\s*(.*)/i);
        const hashtagsMatch = text.match(/Hashtags:\s*(.*)/i);
        const caption = captionMatch ? captionMatch[1].trim() : 'Siap upgrade gaya kamu? ✨ Komen \"MAU\" di bawah!';
        const hashtags = hashtagsMatch ? hashtagsMatch[1].trim() : '#OOTD #RacunTikTok #FYP #GayaKece #Promo';
        onProgress('🎉 Caption & hashtag berhasil dibuat!');
        return { caption, hashtags };
    } catch (error) {
        console.error('Error generate caption from image:', error);
        if (error instanceof Error) throw error;
        throw new Error('Gagal membuat caption dari gambar');
    }
};

// Simulate TTS generation for demo purposes
// In production, this should be replaced with actual TTS service integration
const simulateTTSGeneration = async (
    text: string, 
    voiceName: string, 
    style: string,
    onProgress: (message: string) => void
): Promise<string> => {
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000));
    onProgress("Menganalisis teks...");
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    onProgress("Menyiapkan suara...");
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    onProgress("Menghasilkan audio...");
    
    // Create a simple audio blob for demonstration
    // This would be replaced with actual TTS API response
    const audioContext = new AudioContext();
    const sampleRate = audioContext.sampleRate;
    const duration = Math.max(2, text.length * 0.1); // Estimate duration based on text length
    const frameCount = sampleRate * duration;
    
    const audioBuffer = audioContext.createBuffer(1, frameCount, sampleRate);
    const channelData = audioBuffer.getChannelData(0);
    
    // Generate a simple tone as placeholder
    for (let i = 0; i < frameCount; i++) {
        channelData[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.1;
    }
    
    // Convert to WAV and return as data URL
    const wavData = await processAudio(channelData, sampleRate);
    return `data:audio/wav;base64,${btoa(String.fromCharCode(...new Uint8Array(wavData)))}`;
};
