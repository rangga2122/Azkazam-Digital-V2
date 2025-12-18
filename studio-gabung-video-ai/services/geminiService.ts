import { GoogleGenAI, Modality } from "@google/genai";
import { AI_Voice, TTSConfig, NarrationStyle } from "../types";
import { base64ToUint8Array, pcmToWav } from "../utils";

let cachedGeminiKey = '';
let cachedGeminiKeyAt = 0;
const getGeminiApiKey = async (): Promise<string> => {
  try {
    const now = Date.now();
    if (cachedGeminiKey && (now - cachedGeminiKeyAt) < 60000) return cachedGeminiKey;
    const resp = await fetch(`/api/globalSettings?key=GEMINI_API_KEY`);
    if (!resp.ok) {
      const local = (localStorage.getItem('GEMINI_API_KEY') || '').trim();
      cachedGeminiKey = local; cachedGeminiKeyAt = Date.now(); return local;
    }
    const json = await resp.json();
    cachedGeminiKey = (json?.value || '').trim();
    cachedGeminiKeyAt = Date.now();
    return cachedGeminiKey;
  } catch {
    const local = (localStorage.getItem('GEMINI_API_KEY') || '').trim();
    cachedGeminiKey = local; cachedGeminiKeyAt = Date.now(); return local;
  }
};
let cachedTextModel = '';
let cachedTtsModel = '';
let cachedModelAt = 0;
const getModel = async (kind: 'text' | 'tts'): Promise<string> => {
  try {
    const now = Date.now();
    if ((now - cachedModelAt) < 60000) return kind === 'text' ? (cachedTextModel || 'gemini-2.5-flash') : (cachedTtsModel || 'gemini-2.5-flash-preview-tts');
    const key = kind === 'text' ? 'GEMINI_TEXT_MODEL' : 'GEMINI_TTS_MODEL';
    const resp = await fetch(`/api/globalSettings?key=${key}`);
    if (!resp.ok) { cachedModelAt = Date.now(); return kind === 'text' ? (cachedTextModel || 'gemini-2.5-flash') : (cachedTtsModel || 'gemini-2.5-flash-preview-tts'); }
    const json = await resp.json();
    const val = (json?.value || '').trim();
    if (kind === 'text') cachedTextModel = val; else cachedTtsModel = val;
    cachedModelAt = Date.now();
    return val || (kind === 'text' ? 'gemini-2.5-flash' : 'gemini-2.5-flash-preview-tts');
  } catch {
    cachedModelAt = Date.now();
    return kind === 'text' ? (cachedTextModel || 'gemini-2.5-flash') : (cachedTtsModel || 'gemini-2.5-flash-preview-tts');
  }
};

export class GeminiService {
  constructor() {}

  async generateSpeech(config: TTSConfig): Promise<Blob> {
    try {
      const client = new GoogleGenAI({ apiKey: await getGeminiApiKey() || '' });
      const response = await client.models.generateContent({
        model: await getModel('tts'),
        contents: [{ parts: [{ text: config.text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: config.voice },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (!base64Audio) {
        throw new Error("Gagal mendapatkan data audio dari Gemini.");
      }

      const pcmData = base64ToUint8Array(base64Audio);
      // Gemini 2.5 Flash TTS typically returns 24kHz
      const wavBlob = pcmToWav(pcmData, 24000);
      return wavBlob;

    } catch (error) {
      console.error("Error generating speech:", error);
      throw error;
    }
  }

  async generateScriptFromImage(imageFile: File, style: NarrationStyle, language: string = 'Indonesia'): Promise<string> {
    try {
      const base64Image = await this.fileToBase64(imageFile);
      
      const prompt = `Buatkan naskah narasi pendek (maksimal 3-4 kalimat) untuk video berdasarkan gambar ini.
      Gaya Bahasa: ${style}.
      Bahasa: ${language}.
      Langsung tulis narasinya saja tanpa pembuka atau penutup.`;

      const client = new GoogleGenAI({ apiKey: await getGeminiApiKey() || '' });
      const response = await client.models.generateContent({
        model: await getModel('text'),
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: imageFile.type,
                data: base64Image
              }
            },
            { text: prompt }
          ]
        }
      });

      const text = response.text;
      if (!text) throw new Error("Gagal menghasilkan teks dari gambar.");
      return text.trim();

    } catch (error) {
      console.error("Error analyzing image:", error);
      throw error;
    }
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove Data-URL declaration (e.g. data:image/png;base64,)
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  }
}
