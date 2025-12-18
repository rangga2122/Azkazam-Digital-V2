import { SceneScript, SceneStyle, AspectRatio, SceneCount, VoiceGender, Language } from "../types";
import { generateImageWithSubject, generateImageWithSubjectAndBackground } from "./imageSandboxService";

/**
 * Generates script scenarios in the selected language (no image analysis).
*/
export const analyzeAndScriptScenes = async (
  productDescription: string,
  style: SceneStyle,
  sceneCount: SceneCount,
  voiceGender: VoiceGender,
  language: Language
): Promise<SceneScript[]> => {
  const model = 'deepseek-ai/DeepSeek-V3.1';

  let structurePrompt = "";
  if (sceneCount === 2) {
      structurePrompt = `
      1. The Hook (Intro singkat & padat, produk dipegang tangan).
      2. Call to Action (Kesimpulan cepat & ajakan beli).`;
  } else if (sceneCount === 3) {
      structurePrompt = `
      1. The Hook (Intro singkat menarik).
      2. Manfaat Utama (Poin penting saja, produk di tangan).
      3. Call to Action (Penutup cepat).`;
  } else {
      structurePrompt = `
      1. The Hook (Intro singkat).
      2. Masalah/Solusi (Singkat, produk digunakan tangan).
      3. Estetika/Manfaat (Shot estetik di tangan).
      4. Call to Action (Ajakan bertindak cepat).`;
  }

  let styleContext = `Environment style: ${style}.`;
  if (style === SceneStyle.CUSTOM) {
      styleContext = "Environment style: User provided CUSTOM BACKGROUND (refer to visual prompt).";
  }

  const prompt = `
    Anda adalah sutradara video UGC (User Generated Content) profesional.
    Tugas Anda adalah menulis storyboard ${sceneCount} adegan untuk video review pendek.

    BAHASA UTAMA: ${language}.
    Pastikan semua output Teks (Title dan Narrative) menggunakan Bahasa ${language}.

    KONTEKS GAYA VISUAL: ${styleContext}

    DESKRIPSI PRODUK (WAJIB):
    ${productDescription.trim()}

    KRITERIA VISUAL:
    - Setiap adegan WAJIB menampilkan TANGAN MANUSIA yang memegang, menyentuh, atau menggunakan produk.
    - Produk TIDAK BOLEH melayang atau berdiri sendiri.

    Buat ${sceneCount} adegan berbeda dengan alur:
    ${structurePrompt}

    Output dalam JSON ARRAY berisi objek dengan keys:
    - id: Nomor urut (1-${sceneCount}).
    - title: Judul adegan (Bahasa ${language}).
    - visualPrompt: Prompt visual dalam BAHASA INGGRIS untuk image generator.
      WAJIB DIAWALI dengan: "A realistic POV shot of a human hand holding the product...".
      Deskripsikan posisi jari natural, tekstur kulit realistik.
      ${style === SceneStyle.CUSTOM ? 'Tambahkan bahwa background adalah gambar yang disediakan.' : `Pencahayaan bertema "${style}".`}
      Pastikan produk tampak UTUH (FULL VIEW), tidak terpotong frame.
    - narrativePrompt: Naskah Voiceover dalam Bahasa ${language}, santai, antusias, natural seperti review jujur.
      DURASI MAKS per adegan ±8 detik (1-2 kalimat pendek / 15-20 kata).
      Tulis HANYA teks narasinya, tanpa label tambahan.

    Kembalikan JSON saja tanpa teks lain.
  `;

  try {
    const resp = await fetch('/api/chutesChat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'Kembalikan JSON array berisi objek dengan keys: id (number), title (string), visualPrompt (string), narrativePrompt (string). Jangan sertakan teks lain di luar JSON.' },
          { role: 'user', content: prompt }
        ],
        stream: false,
        max_tokens: 1024,
        temperature: 0.7
      })
    });
    if (!resp.ok) {
      let m = `HTTP ${resp.status}`; try { m = (await resp.json())?.error?.message || m; } catch {}
      throw new Error(m);
    }
    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || '';
    if (!text) throw new Error('No response from LLM');

    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
    const rawScenes = JSON.parse(cleaned) as SceneScript[];

    // Template untuk professional product review video
    const narrativeTemplate = `Professional product review video. Only two human hands are visible, reviewing and showcasing the product in a clean and realistic way. The hands slowly rotate the product, highlight its details, texture, buttons, logo, or main features, and gently demonstrate its quality and material. Background must remain exactly the same as the reference image, clean, minimal, and unchanged. No face, no full body, no person visible, no reflection, only hands in the frame. Camera style: close-up product focus, stable shot, smooth movement, cinematic, soft natural lighting, commercial product style, realistic, 4K quality. Voice over: `;

    // Post-processing to ensure narrative format and clean double tags if model hallucinated them
    return rawScenes.map(scene => {
        // Remove any existing tags the model might have accidentally added
        let cleanNarrative = scene.narrativePrompt.replace(/\[Suara.*?\]:?\s*/gi, '').trim();
        
        // Add the single correct tag programmatically with dynamic language
        const voiceOverText = `[Suara ${voiceGender} Pakai Bahasa ${language}]: ${cleanNarrative}`;
        
        // Combine template with voice over
        const finalNarrative = narrativeTemplate + voiceOverText;

        return {
            ...scene,
            narrativePrompt: finalNarrative
        };
    });

  } catch (error) {
    console.error("Error scripting scenes:", error);
    throw error;
  }
};

/**
 * Generates a photorealistic image based on the script and original product image.
 * Uses the same image generation system as Studio Iklan AI and AI Photoshoot (Google Labs Whisk API).
 * Optionally accepts a custom background image to composite.
 */
export const generateSceneImage = async (
  originalImageBase64: string,
  originalMimeType: string,
  visualPrompt: string,
  style: SceneStyle,
  aspectRatio: AspectRatio,
  customBackgroundBase64?: string,
  customBackgroundMimeType?: string
): Promise<string> => {
  // Build the full instruction prompt - same style as Studio Iklan AI and AI Photoshoot
  // Template tambahan untuk professional product review video
  const templatePrompt = `Professional product review video. Only two human hands are visible, reviewing and showcasing the product in a clean and realistic way. The hands slowly rotate the product, highlight its details, texture, buttons, logo, or main features, and gently demonstrate its quality and material. Background must remain exactly the same as the reference image, clean, minimal, and unchanged. No face, no full body, no person visible, no reflection, only hands in the frame. Camera style: close-up product focus, stable shot, smooth movement, cinematic, soft natural lighting, commercial product style, realistic, 4K quality.`;
  
  let fullPrompt = `
    ultra-realistic 8k product photograph with human hand interaction.
    
    ${templatePrompt}
    
    STRICT VISUAL REQUIREMENTS:
    1. HANDS: A POV (Point of View) or close-up shot where HUMAN HANDS are visible HOLDING or INTERACTING with the product from the input image.
    2. GRAVITY: The product must NOT be floating. It must be supported by fingers/hands.
    3. COMPOSITION: **FULL SHOT**. The product must be FULLY VISIBLE and NOT CROPPED at the edges. Ensure the entire object is within the frame.
    4. REALISM: Render realistic skin textures and natural hand posing.
    5. LIGHTING: Professional lighting, sharp focus, high quality.
    
    Visual Context: ${visualPrompt}
  `;

  // Logic for Custom Background vs Preset Style
  if (style === SceneStyle.CUSTOM && customBackgroundBase64 && customBackgroundMimeType) {
    fullPrompt += `
    BACKGROUND INSTRUCTION:
    Composite the product held by a hand into the provided background environment.
    - Match the lighting, color tone, and perspective of the generated hand/product to the background image.
    - The background should look exactly or very similar to the provided reference image.
    - Create realistic shadows and natural integration.
    `;

    // Use the function with background
    try {
      const result = await generateImageWithSubjectAndBackground(
        fullPrompt,
        aspectRatio,
        originalImageBase64,
        originalMimeType,
        customBackgroundBase64,
        customBackgroundMimeType
      );
      return result;
    } catch (error) {
      console.error("Error generating scene image with background:", error);
      throw error;
    }
  } else {
    fullPrompt += `
    Environment Style: ${style}.
    Lighting: Cinematic, high quality, 4k.
    Create a professional product photography scene.
    `;

    // Use the function without background
    try {
      const result = await generateImageWithSubject(
        fullPrompt,
        aspectRatio,
        originalImageBase64,
        originalMimeType
      );
      return result;
    } catch (error) {
      console.error("Error generating scene image:", error);
      throw error;
    }
  }
};
