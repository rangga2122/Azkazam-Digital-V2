import { Type } from "@google/genai";
import { Storyboard, Scene } from "../types";

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
let cachedModelAt = 0;
const getTextModel = async (): Promise<string> => {
  try {
    const now = Date.now();
    if ((now - cachedModelAt) < 60000 && cachedTextModel) return cachedTextModel;
    const resp = await fetch(`/api/globalSettings?key=GEMINI_TEXT_MODEL`);
    if (!resp.ok) { cachedModelAt = Date.now(); return cachedTextModel || 'gemini-2.5-flash'; }
    const json = await resp.json();
    cachedTextModel = (json?.value || '').trim();
    cachedModelAt = Date.now();
    return cachedTextModel || 'gemini-2.5-flash';
  } catch {
    cachedModelAt = Date.now();
    return cachedTextModel || 'gemini-2.5-flash';
  }
};
const postGemini = async (model: string, body: any): Promise<any> => {
  const key = await getGeminiApiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!resp.ok) {
    let m = `HTTP ${resp.status}`; try { m = (await resp.json())?.error?.message || m; } catch {}
    throw new Error(m);
  }
  return await resp.json();
};

// Helper to convert file to base64
export const fileToGenerativePart = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const describeCharacter = async (imageFile: File): Promise<string> => {
  try {
    const base64Data = await fileToGenerativePart(imageFile);
    const textModel = await getTextModel();
    const data = await postGemini(textModel, {
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: imageFile.type, data: base64Data } },
            { text: "Describe this character visually in strict detail suitable for an image generation prompt. Focus on physical traits, face, hair style and color, clothing style and colors, and any distinctive features. Keep it under 50 words. Do not describe the background or pose, just the character." }
          ]
        }
      ],
      generationConfig: { temperature: 0.5 }
    });
    const partsArr = data?.candidates?.[0]?.content?.parts || [];
    const text = partsArr.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('\n').trim();
    if (!text) throw new Error('Tidak ada respons dari AI');
    return text;
  } catch (error) {
    console.error("Error describing character:", error);
    throw new Error("Gagal menganalisis gambar karakter.");
  }
};

export const generateStoryboardText = async (theme: string, characterDescription?: string, language: string = 'Indonesia'): Promise<Storyboard> => {
  const sceneSchema = {
    type: Type.OBJECT,
    properties: {
      scene_number: { type: Type.INTEGER },
      visual_description: { type: Type.STRING, description: "Detailed visual description of the scene IN ENGLISH for a video generator. Include specific cinematic lighting, camera angle, and environment." },
      narration: { type: Type.STRING, description: "A short, one-sentence narration IN SELECTED LANGUAGE that describes the character's physical action." },
      dialogue_text: { type: Type.STRING, description: "Dialogue spoken by characters IN SELECTED LANGUAGE. Must be realistic length for 8 seconds. Format: 'NAMA_KARAKTER: Teks dialog...'. Should be an empty string for the first two scenes." },
      duration: { type: Type.STRING, description: "Fixed at '8 detik'" }
    },
    required: ["scene_number", "visual_description", "narration", "dialogue_text", "duration"]
  };

  const storyboardSchema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, description: "A catchy, cinematic title for the film IN SELECTED LANGUAGE." },
      logline: { type: Type.STRING, description: "A one-sentence compelling summary of the film plot IN SELECTED LANGUAGE." },
      scenes: {
        type: Type.ARRAY,
        items: sceneSchema,
        description: "Exactly 10 scenes."
      }
    },
    required: ["title", "logline", "scenes"]
  };

  let prompt = `Create a detailed cinematic storyboard for a 1-minute teaser film, designed for video generation.
Constraints:
- The story is told through a combination of action narration and dialogue.
- EXACTLY 10 scenes.
- EACH scene is 8 seconds long.
- The first two scenes are introductory, establishing the setting and character. They MUST NOT have any 'dialogue_text' (provide an empty string). They must still have narration.
- Dialogue MUST begin from scene 3. EVERY scene from scene 3 to 10 MUST have both a narration describing an action and a subsequent dialogue part.
- Theme (Premise): "${theme}".\n`;

  if (characterDescription) {
    prompt += `IMPORTANT: The main character MUST appear in most scenes and visually match this description exactly: ${characterDescription}.\n`;
  }

  const langMap: Record<string, string> = { Indonesia: 'Indonesian', Inggris: 'English', Malaysia: 'Malay', Spanyol: 'Spanish', Prancis: 'French', Arab: 'Arabic', Hindi: 'Hindi', Jepang: 'Japanese', Korea: 'Korean', Mandarin: 'Mandarin Chinese' };
  const languageOut = langMap[language] || language;
  prompt += `Language: ${languageOut}.
For each scene, provide:
  1. 'visual_description': Vivid, ready for text-to-video generation (Keep in English for best results). Describe setting, mood, and camera work.
  2. 'narration': A brief voiceover line IN ${languageOut} that describes the character's physical action.
  3. 'dialogue_text': The specific lines IN ${languageOut} that the character speaks. This dialogue must be a realistic length for an 8-second video clip. For scenes 1 and 2, this MUST be an empty string.`;

  try {
    const textModel = await getTextModel();
    const data = await postGemini(textModel, {
      contents: [ { role: 'user', parts: [ { text: prompt } ] } ],
      generationConfig: { responseMimeType: 'application/json', responseSchema: storyboardSchema, temperature: 0.8 }
    });
    const partsArr = data?.candidates?.[0]?.content?.parts || [];
    const text = partsArr.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('\n').trim();
    if (!text) throw new Error('Tidak ada respons dari AI');
    const storyboardData = JSON.parse(text) as Omit<Storyboard, 'scenes'> & { scenes: Omit<Scene, 'prompt' | 'image_generation_status'>[] };

    const scenesWithExtras: Scene[] = storyboardData.scenes.map(s => ({
      ...s,
      prompt: s.dialogue_text 
        ? `${s.visual_description}. ${s.narration} sambil lipsync dalam bahasa ${languageOut.toLowerCase()}: "${s.dialogue_text}"`
        : `${s.visual_description}. ${s.narration}`,
      image_generation_status: 'pending',
    }));

    return { ...storyboardData, scenes: scenesWithExtras };

  } catch (error) {
    console.error("Error generating storyboard text:", error);
    throw new Error("Gagal menghasilkan papan cerita.");
  }
};

export const generateSceneImage = async (prompt: string, aspectRatio: '16:9' | '9:16'): Promise<string> => {
  try {
    const finalPrompt = `Generate a cinematic image with a ${aspectRatio} aspect ratio. ${prompt}`;
    const data = await postGemini('gemini-2.5-flash-image', {
      contents: [ { parts: [ { text: finalPrompt } ] } ],
      generationConfig: { responseModalities: ['IMAGE'] }
    });
    const partsArr = data?.candidates?.[0]?.content?.parts || [];
    for (const part of partsArr) {
      if (part.inlineData && part.inlineData.data) {
        return part.inlineData.data;
      }
    }
    throw new Error("Tidak ada gambar yang dihasilkan.");
  } catch (error) {
    console.error("Error generating image:", error);
    throw new Error("Gagal menghasilkan gambar adegan.");
  }
}
