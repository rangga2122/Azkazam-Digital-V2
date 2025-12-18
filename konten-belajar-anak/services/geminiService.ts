import { GoogleGenAI, Modality, Type } from "@google/genai";
import type { TeacherConfig } from '../types';
import { processAudio } from './audioService';
import { AspectRatio } from '../../types';
import { generateImage, generateImagePromptOnly } from '../../services/imageSandboxApi';

let cachedGeminiKey = '';
let cachedGeminiKeyAt = 0;
const getGeminiApiKey = async (): Promise<string> => {
    try {
        const now = Date.now();
        if (cachedGeminiKey && (now - cachedGeminiKeyAt) < 60000) return cachedGeminiKey;
        const resp = await fetch(`/api/globalSettings?key=GEMINI_API_KEY&t=${Date.now()}`);
        if (resp.ok) {
            const json = await resp.json();
            cachedGeminiKey = (json?.value || '').trim();
            cachedGeminiKeyAt = Date.now();
            if (cachedGeminiKey) return cachedGeminiKey;
        }
    } catch {}
    const local = (localStorage.getItem('GEMINI_API_KEY') || '').trim();
    cachedGeminiKey = local;
    cachedGeminiKeyAt = Date.now();
    return local;
};

const getTextModel = async (): Promise<string> => {
    try {
        const resp = await fetch(`/api/globalSettings?key=GEMINI_TEXT_MODEL&t=${Date.now()}`);
        if (resp.ok) {
            const json = await resp.json();
            const val = (json?.value || '').trim();
            if (val) return val;
        }
    } catch {}
    const local = (localStorage.getItem('GEMINI_TEXT_MODEL') || '').trim();
    return local || 'gemini-2.5-flash';
};

const getAi = async (): Promise<GoogleGenAI> => {
    const key = await getGeminiApiKey();
    return new GoogleGenAI({ apiKey: key });
};

let cachedVeoToken = '';
let cachedVeoAt = 0;
const getVeoToken = async (): Promise<string> => {
    try {
        const now = Date.now();
        if (cachedVeoToken && (now - cachedVeoAt) < 60000) return cachedVeoToken;
        const resp = await fetch(`/api/globalSettings?key=VEO_BEARER_TOKEN&t=${Date.now()}`);
        if (resp.ok) {
            const json = await resp.json();
            const token = (json?.value || '').trim();
            if (token) {
                cachedVeoToken = token;
                cachedVeoAt = Date.now();
                localStorage.setItem('VEO_BEARER_TOKEN', token);
                return token;
            }
        }
    } catch {}
    const local = (localStorage.getItem('VEO_BEARER_TOKEN') || '').trim();
    cachedVeoToken = local;
    cachedVeoAt = Date.now();
    return local;
};

const dataUrlToFile = (dataUrl: string, filename: string): File => {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const bstr = atob(arr[1]);
    const n = bstr.length;
    const u8arr = new Uint8Array(n);
    for (let i = 0; i < n; i++) u8arr[i] = bstr.charCodeAt(i);
    const blob = new Blob([u8arr], { type: mime });
    return new File([blob], filename, { type: mime });
};

const extractImageUrl = (response: any): string => {
    if (response.promptFeedback?.blockReason) {
        throw new Error(`Request was blocked: ${response.promptFeedback.blockReason}`);
    }
    const candidate = response.candidates?.[0];
    if (!candidate?.content?.parts) {
        throw new Error("Invalid response from the model. No content parts found.");
    }
    for (const part of candidate.content.parts) {
        if (part.inlineData) {
            const base64ImageBytes: string = part.inlineData.data;
            const mimeType = part.inlineData.mimeType;
            return `data:${mimeType};base64,${base64ImageBytes}`;
        }
    }
    const textResponse = candidate.content.parts.find((p: any) => p.text)?.text;
    if (textResponse) {
        console.error("Model returned text instead of an image:", textResponse);
        throw new Error(`The model returned a text response but no image.`);
    }
    throw new Error("No image was generated in the response.");
};

const getStyleKeywords = (style: string): string => {
    switch (style) {
        case "Roblox 3D":
            return "Roblox game aesthetic. 3D render of a Roblox avatar. Blocky body parts. Blocky square torso. Cylinder arms and legs. Smooth plastic texture. 'Lego-like' c-shape hands or block hands. No fingers. No realistic skin details. Simple face features (toy face). Toy-like appearance. High fidelity game render.";
        case "Minecraft Voxel":
            return "Minecraft style. Authentic voxel art. Entire world and character made of cubes. Square head. Rectangular body. Pixelated textures on blocks. 8-bit 3d style. Blocky terrain. No curves. Pure blocky aesthetic.";
        case "Disney Pixar 3D":
            return "Disney Pixar style 3D animation. High quality render. Cute, big expressive eyes. Soft lighting. Subsurface scattering. Round smooth shapes. 3d cartoon character. Vibrant colors.";
        case "Anime Naruto Style":
            return "Anime art style. Cel shaded. Japanese animation look. Naruto shippuden art style. Sharp outlines. Spiky hair. Vibrant colors. 2d animation style. Dramatic angles.";
        case "Kartun Sopo Jarwo (3D Animation)":
            return "Indonesian 3D cartoon style. Stylized caricature. Funny proportions (big head small body). Vibrant village colors. 3d animation render. Similar to Adit Sopo Jarwo animation.";
        case "Lego Stopmotion":
            return "Lego minifigure. Plastic bricks. Studs on surfaces. Stiff joints. C-shaped hands. Stopmotion animation look. Macro photography depth of field. Toy photography. Everything is made of lego bricks.";
        case "Claymation":
            return "Claymation style. Plasticine texture. Fingerprint details. Stop motion look. Handmade feel. Aardman animation style. Thick limbs. Rounded shapes.";
        case "Superhero Comic":
            return "American comic book style. Bold black outlines. Ben-Day dots. Halftone patterns. Dynamic shading. Superhero comic art. Vibrant colors. Dramatic lighting.";
        default:
            return `${style} style, high quality 3d render`;
    }
};

const getCharacterDetails = (gender: string, age: string, vibe: string): string => {
    const isMale = gender.includes("Laki");
    const isYoung = age.includes("20-an");
    const isSenior = age.includes("50+");

    // Define consistent clothing and physical traits based on persona
    let appearance = "";
    if (isMale) {
        if (vibe.includes("Seru") || isYoung) appearance = "Short spiky black hair, wearing a bright orange hoodie with a blue backpack strap, blue jeans, and cool sneakers";
        else if (isSenior) appearance = "Grey hair, wearing a brown tweed vest over a white shirt, glasses, and beige trousers";
        else appearance = "Neat side-parted black hair, wearing a neat black button-up shirt (guru style) and traditional batik sarong or black slacks";
    } else {
        if (vibe.includes("Seru") || isYoung) appearance = "Long brown hair in a ponytail, wearing a colorful yellow cardigan over a white t-shirt, a pink skirt, and white shoes";
        else if (isSenior) appearance = "Short grey curly hair, wearing a floral pattern dress with a green shawl and reading glasses";
        else appearance = "Shoulder-length black hair, wearing a professional batik blouse (teacher uniform) and black skirt";
    }
    
    return `A ${age.split('(')[0]} ${isMale ? 'male' : 'female'} teacher character, ${appearance}. Friendly expression.`;
};

const getEnvironmentDescription = (style: string): string => {
    // Dynamic backgrounds based on style
    if (style.includes("Anime")) return "A stylized Ninja Village with Japanese architecture and blue sky, 2D anime background style";
    if (style.includes("Minecraft")) return "A blocky landscape with square trees, green grass blocks, and pixelated clouds";
    if (style.includes("Roblox")) return "A 3D obstacle course (obby) colorful park or a blocky playground city";
    if (style.includes("Superhero")) return "A dramatic city rooftop at sunset or a high-tech secret base";
    if (style.includes("Lego")) return "A world entirely built of plastic bricks, lego trees, lego ground";
    // Default educational background
    return `A bright, colorful, 3D stylized classroom or educational background matching the ${style} aesthetic`;
}

export const getActionDescription = (index: number, title: string, style: string): string => {
    // Allow more dynamic actions for specific styles in middle scenes
    const isAnime = style.includes("Anime");
    const isSuperhero = style.includes("Superhero");
    const isRoblox = style.includes("Roblox") || style.includes("Minecraft");
    
    if (index === 0) {
        // Intro: Friendly greeting
        if (isAnime) return "standing in a cool pose and waving hello with a ninja headband visible";
        if (isSuperhero) return "landing heroically and waving hello";
        return "waving hello to the camera with a big welcoming smile";
    }
    
    if (index === 4) {
        // Outro: Thumbs up (clean, no text)
        if (isAnime) return "giving a thumbs up with a confident ninja grin";
        if (isSuperhero) return "saluting proudly to the camera";
        return "giving a double thumbs up with a big friendly smile to the camera";
    }
    
    // Middle scenes (1, 2, 3): Dynamic Actions & Prop Interaction
    if (index === 2) {
        if (isAnime) return "performing a hand sign (jutsu) that summons a visual representation of the topic";
        if (isSuperhero) return "holding a glowing energy ball that contains an image of the topic";
        if (isRoblox) return "jumping in the air while pointing at a floating blocky icon of the topic";
        return `pointing a finger up at a floating 3D icon representing '${title}'`;
    }
    
    if (index === 3) {
        if (isAnime) return "meditating or concentrating to reveal a scroll with information";
        if (isSuperhero) return "looking at a high-tech holographic wrist display showing details";
        if (isRoblox) return "standing confidently with hands on hips next to a large built structure related to the topic";
        return `standing next to a whiteboard or hologram explaining details about '${title}'`;
    }
    
    // Scene 1 (Explanation start)
    if (isAnime) return "leaning forward with an intense, focused expression explaining the mission";
    if (isSuperhero) return "crossing arms confidently while hovering slightly";
    return `gesturing with open hands to start explaining '${title}'`;
};

export const generateKeyPoints = async (title: string): Promise<string> => {
    try {
        const prompt = `Buat 3–4 poin edukasi sederhana untuk siswa SD tentang: "${title}".
Gunakan Bahasa Indonesia yang mudah dipahami anak.
Format keluaran: kembalikan JSON ARRAY berisi 3–4 STRING pendek, masing-masing satu kalimat. Jangan sertakan teks lain di luar JSON.`;

        const resp = await fetch('/api/chutesChat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'deepseek-ai/DeepSeek-V3.1',
                messages: [
                    { role: 'system', content: 'Kembalikan JSON array berisi 3–4 string. Jangan sertakan teks lain di luar JSON.' },
                    { role: 'user', content: prompt }
                ],
                stream: false,
                max_tokens: 256,
                temperature: 0.7
            })
        });
        if (!resp.ok) {
            let m = `HTTP ${resp.status}`; try { m = (await resp.json())?.error?.message || m; } catch {}
            throw new Error(m);
        }
        const data = await resp.json();
        const text = (data?.choices?.[0]?.message?.content || '').trim();
        if (!text) throw new Error('Respons AI kosong');
        const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
        const arr = JSON.parse(cleaned);
        if (!Array.isArray(arr) || arr.length === 0) {
            throw new Error('Format respons tidak valid; harap JSON array 3–4 string.');
        }
        const numbered = arr.slice(0, 4).map((p: any, i: number) => `${i + 1}. ${String(p || '').trim()}`).join('\n');
        return numbered;
    } catch (error) {
        console.error("Error generating key points:", error);
        throw new Error("Failed to generate key points.");
    }
};

export const generateLearningScript = async (title: string, points: string, teacher: TeacherConfig): Promise<string[]> => {
    try {
        const prompt = `Buat naskah edukasi anak (gaya Reels/TikTok) dalam Bahasa Indonesia.

TOPIK: "${title}"
POIN PENTING MATERI (WAJIB):
${points}

PERSONA GURU: ${teacher.gender}, ${teacher.age}, vibe ${teacher.vibe}.

ATURAN KERAS:
1) Gunakan Bahasa Tutur, natural, mengalir, bukan bahasa buku.
2) SCENE 1 harus langsung HOOK (pertanyaan/fakta mengejutkan), tanpa sapaan.
3) SCENE 2-4 jelaskan poin-poin dengan alur nyambung, simpel, ramah.
4) SCENE 5 ringkas inti pelajaran satu kalimat, lalu ajakan follow/like tanpa sebut tombol.
5) Setiap scene 15–20 kata, kira-kira 8 detik.

Format keluaran: kembalikan JSON ARRAY berisi tepat 5 STRING, masing-masing adalah naskah untuk scene 1..5. Jangan sertakan teks lain di luar JSON.`;

        const resp = await fetch('/api/chutesChat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'deepseek-ai/DeepSeek-V3.1',
                messages: [
                    { role: 'system', content: 'Kembalikan JSON array berisi tepat 5 string (scene 1..5). Jangan sertakan teks lain di luar JSON.' },
                    { role: 'user', content: prompt }
                ],
                stream: false,
                max_tokens: 512,
                temperature: 0.7
            })
        });
        if (!resp.ok) {
            let m = `HTTP ${resp.status}`; try { m = (await resp.json())?.error?.message || m; } catch {}
            throw new Error(m);
        }
        const data = await resp.json();
        const text = (data?.choices?.[0]?.message?.content || '').trim();
        if (!text) throw new Error('Respons AI kosong');
        const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
        const scripts = JSON.parse(cleaned);

        if (!Array.isArray(scripts) || scripts.length < 5) {
            throw new Error('Format respons tidak valid; harap JSON array 5 string.');
        }
        return scripts.slice(0, 5);
    } catch (error) {
        console.error("Error generating script:", error);
        if (error instanceof Error) throw error;
        throw new Error("An unknown error occurred while generating the script.");
    }
};

export const generateSceneImages = async (title: string, scripts: string[], teacher: TeacherConfig): Promise<string[]> => {
    try {
        if (!scripts || scripts.length < 5) {
            throw new Error("generateSceneImages requires an array of 5 scripts.");
        }

        const styleKeywords = getStyleKeywords(teacher.visualStyle);
        const envDesc = getEnvironmentDescription(teacher.visualStyle);
        
        let characterPrompt = "";
        let photoInstruction = "";

        if (!teacher.teacherPhoto) {
             // Text-only definition (Rigid for consistency)
             const baseDesc = getCharacterDetails(teacher.gender, teacher.age, teacher.vibe);
             characterPrompt = `Subject: ${baseDesc}. The character MUST have the body proportions of a ${teacher.visualStyle} character (e.g. if Roblox, use blocky limbs).`;
        } else {
             // Photo-based definition
             characterPrompt = `Subject: A ${teacher.visualStyle} character version of the person in the input image.`;
             photoInstruction = `IMPORTANT: You are converting a human photo into a ${teacher.visualStyle} character. 
             - If style is Roblox/Minecraft/Lego: DO NOT generate a realistic human face. Convert the face to a toy/cartoon texture matching the style. Keep hair color and clothes color from the photo, but change the ANATOMY to match ${teacher.visualStyle} (blocky, plastic, etc).
             - If style is Disney/Anime: Stylize the facial features to match the art style.`;
        }

        const constraintDesc = `IMPORTANT: DO NOT GENERATE TEXT. The image should be visual only. No speech bubbles, no watermarks, no labels. If unavoidable, maximum 1-3 words only.`;
        
        // For styles like Roblox/Minecraft, explicitly forbid realistic features
        // Also forbidding text/watermarks strongly
        let negativeConstraints = "NEGATIVE PROMPT: text, words, letters, watermarks, speech bubbles, writing, labels, signature, logo. ";
        
        if (teacher.visualStyle.includes("Roblox") || teacher.visualStyle.includes("Minecraft") || teacher.visualStyle.includes("Lego")) {
             negativeConstraints += "Realistic human, human skin texture, realistic fingers, detailed nose, detailed ears, photorealistic, human anatomy.";
        }

        const prompts = scripts.map((script, index) => {
             const actionDesc = getActionDescription(index, title, teacher.visualStyle);

             return `Generate a portrait (9:16) image.
             VISUAL STYLE: ${teacher.visualStyle.toUpperCase()}
             Style Keywords: ${styleKeywords}
             
             CHARACTER: ${characterPrompt}
             
             ACTION: The character is ${actionDesc}.
             CONTEXT: Scene script is "${script}".
             
             VISUAL_AIDS: The image MUST contain a 3D prop, hologram, or background element that specifically represents the key topic mentioned in the script: "${script}". 
             (e.g., if talking about planets, show a floating planet; if math, show numbers; if animals, show the animal).
             
             ENVIRONMENT: ${envDesc}.
             
             ${photoInstruction}
             ${constraintDesc}
             ${negativeConstraints}
             
             Ensure the character's appearance is CONSISTENT across all images. The character MUST look like a ${teacher.visualStyle} toy/character.`;
        });

        const token = await getVeoToken();
        const imageGenerationPromises = prompts.map(async (instruction, idx) => {
            if (teacher.teacherPhoto) {
                const file = dataUrlToFile(teacher.teacherPhoto, `teacher_${idx + 1}.jpg`);
                const url = await generateImage(
                    instruction,
                    AspectRatio.Portrait,
                    file,
                    token,
                    () => {}
                );
                return url;
            } else {
                const url = await generateImagePromptOnly(instruction, AspectRatio.Portrait, token, () => {});
                return url;
            }
        });

        return await Promise.all(imageGenerationPromises);
    } catch (error) {
        console.error("Error generating scene images:", error);
        if (error instanceof Error) throw error;
        throw new Error("An unknown error occurred while generating scene images.");
    }
};

export const regenerateSceneImage = async (
    title: string,
    script: string,
    teacher: TeacherConfig,
    index: number
): Promise<string> => {
     try {
        const styleKeywords = getStyleKeywords(teacher.visualStyle);
        const envDesc = getEnvironmentDescription(teacher.visualStyle);

        let characterPrompt = "";
        let photoInstruction = "";

        if (!teacher.teacherPhoto) {
             const baseDesc = getCharacterDetails(teacher.gender, teacher.age, teacher.vibe);
             characterPrompt = `Subject: ${baseDesc}. The character MUST have the body proportions of a ${teacher.visualStyle} character.`;
        } else {
             characterPrompt = `Subject: A ${teacher.visualStyle} character version of the person in the input image.`;
             photoInstruction = `IMPORTANT: You are converting a human photo into a ${teacher.visualStyle} character. Keep hair/clothes color, but change anatomy to ${teacher.visualStyle}. Do NOT generate a realistic human face.`;
        }

        const constraintDesc = `IMPORTANT: DO NOT GENERATE TEXT. The image should be visual only. No speech bubbles, no watermarks. Max 1-3 words if absolutely necessary.`;
        
        let negativeConstraints = "NEGATIVE PROMPT: text, words, letters, watermarks, speech bubbles, writing, labels, signature, logo. ";

        if (teacher.visualStyle.includes("Roblox") || teacher.visualStyle.includes("Minecraft") || teacher.visualStyle.includes("Lego")) {
            negativeConstraints += "Realistic human, human skin texture, realistic fingers, detailed nose, detailed ears, photorealistic, human anatomy.";
        }

        const actionDesc = getActionDescription(index, title, teacher.visualStyle);

        const prompt = `Generate a portrait (9:16) image.
             VISUAL STYLE: ${teacher.visualStyle.toUpperCase()}
             Style Keywords: ${styleKeywords}
             
             CHARACTER: ${characterPrompt}
             
             ACTION: The character is ${actionDesc}.
             CONTEXT: "${script}".
             
             VISUAL_AIDS: The image MUST contain a 3D prop, hologram, or background element that specifically represents the key topic mentioned in the script: "${script}". 
             (e.g., if talking about planets, show a floating planet; if math, show numbers; if animals, show the animal).

             ENVIRONMENT: ${envDesc}.
             
             ${photoInstruction}
             ${constraintDesc}
             ${negativeConstraints}
             
             The character MUST look like a ${teacher.visualStyle} toy/character.`;

        const token = await getVeoToken();
        if (teacher.teacherPhoto) {
            const file = dataUrlToFile(teacher.teacherPhoto, `teacher_${index + 1}.jpg`);
            const url = await generateImage(
                prompt,
                AspectRatio.Portrait,
                file,
                token,
                () => {}
            );
            return url;
        } else {
            const url = await generateImagePromptOnly(prompt, AspectRatio.Portrait, token, () => {});
            return url;
        }
    } catch (error) {
        console.error("Error regenerating image:", error);
        if (error instanceof Error) throw error;
        throw new Error("An unknown error occurred while regenerating image.");
    }
};

export const generateEducationalCaption = async (title: string, points: string): Promise<{ caption: string, hashtags: string }> => {
    try {
        const prompt = `Create a TikTok/Reels caption for an educational video about "${title}".
        Key points: ${points}.
        Language: Indonesian.
        1. Caption: Fun, uses emojis, invites interaction (e.g., "Siapa yang baru tahu? ☝️"). Max 200 chars.
        2. Hashtags: 5 relevant hashtags + #BelajarSeru #BelajarSD.
        
        Format:
        Caption: [Text]
        Hashtags: [Text]`;

        const ai = await getAi();
        const model = await getTextModel();
        const response = await ai.models.generateContent({
            model,
            contents: prompt,
        });

        const text = response.text;
        const captionMatch = text.match(/Caption: (.*)/);
        const hashtagsMatch = text.match(/Hashtags: (.*)/);

        const caption = captionMatch ? captionMatch[1].trim() : `Belajar ${title} yuk! ✨`;
        const hashtags = hashtagsMatch ? hashtagsMatch[1].trim() : "#fyp #belajar #sekolahdasar";

        return { caption, hashtags };
    } catch (error) {
        console.error("Error generating caption:", error);
        return {
            caption: `Yuk belajar ${title} hari ini! 📚`,
            hashtags: "#fyp #edukasi #sekolahdasar"
        };
    }
};

export { processAudio } from './audioService';
