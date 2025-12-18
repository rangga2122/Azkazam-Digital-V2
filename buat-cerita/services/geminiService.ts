import { ContentConcept, FullContent, ContentTone, TargetAudience, AspectRatio } from "../types";
import { generateImagePromptOnly } from '../../services/imageSandboxApi';
import { AspectRatio as RootAspectRatio } from '../../types';

// Helper to get VEO Token (copied from existing implementation)
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

// 1. Generate Concepts (Fact-based) - Using Chutes AI
export const generateContentConcepts = async (topic: string, audience: TargetAudience, language: string = 'Indonesian (Bahasa Indonesia)'): Promise<ContentConcept[]> => {
  let audienceContext = "";
  if (audience === 'KIDS') {
    audienceContext = "Target Audience: Kids under 10 years old. Language should be simple, fun, educational, and engaging. Avoid complex words. Focus on wonder and simple curiosity.";
  } else {
    audienceContext = "Target Audience: Adults/General Audience. Language can be sophisticated, witty, or deep. Focus on surprising facts, history, or science.";
  }

  const prompt = `
    You are a creative director for "Claymation Facts".
    The user has provided the topic: "${topic}".
    ${audienceContext}
    
    Generate 3 distinct content concepts.
    
    The "hook" should be a catchy opening statement (max 8 seconds spoken).
    The "summary" should be a brief paragraph explaining what facts will be covered.
    Language: ${language}.

    Format output as a JSON ARRAY of objects with keys: "tone" (enum: Informative, Mind Blowing, Fun & Quirky, Historical), "title", "hook", "summary".
    Do not include markdown formatting like \`\`\`json. Return only the JSON array.
  `;

  try {
    const resp = await fetch('/api/chutesChat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'deepseek-ai/DeepSeek-V3.1',
            messages: [
                { role: 'system', content: 'Return only a JSON array. No markdown.' },
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
    const text = (data?.choices?.[0]?.message?.content || '').trim();
    if (!text) throw new Error('Respons AI kosong');
    
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
    return JSON.parse(cleaned) as ContentConcept[];
  } catch (error) {
    console.error("Error generating concepts:", error);
    throw error;
  }
};

// 2. Generate Full Script & Storyboard Data (Fact-based) - Using Chutes AI
export const generateFullContentData = async (concept: ContentConcept, audience: TargetAudience, language: string = 'Indonesian (Bahasa Indonesia)'): Promise<FullContent> => {
  let designInstruction = "";
  if (audience === 'KIDS') {
    designInstruction = "Design the 'consistentSubject' to be CUTE, ROUNDED, COLORFUL, and FRIENDLY. Focus on shapes and colors. Do NOT specify material (like clay, lego, paper) in the subject description.";
  } else {
    designInstruction = "Design the 'consistentSubject' to be DETAILED, ATMOSPHERIC, and MATURE. Focus on lighting and composition. Do NOT specify material (like clay, lego, paper) in the subject description.";
  }

  const prompt = `
    Create a full video package for this concept:
    Title: ${concept.title}
    Tone: ${concept.tone}
    Summary: ${concept.summary}

    1. ${designInstruction} This description will be used in every image prompt to ensure character consistency.
    2. Break down the video into exactly 6 scenes.
    3. For EACH scene, write the specific 'narration' line (${language}) suitable for ${audience === 'KIDS' ? 'kids' : 'adults'}. ${audience === 'KIDS' ? '**CRITICAL: Provide 2-3 short, simple sentences per scene. Keep it fun and engaging, but ensure it fits within 8 seconds (approx 20-25 words).**' : '**CRITICAL: Provide 2-3 concise sentences per scene. Ensure the narration is engaging but still fits within the 8-second video limit (approx 20-25 words).**'}
    4. 'imagePrompt' (English): Describe the scene action. **CRITICAL CAMERA INSTRUCTION: Use predominantly WIDE ANGLE, ISOMETRIC VIEW, and TILT-SHIFT style to create a 'miniature world' look. Avoid close-ups. Show the character within a larger environment. Keywords to use: 'Wide angle', 'Isometric view', 'Tilt-shift', 'Miniature scale', 'Diorama view'.**
    5. 'motionPrompt' describes camera movement.
    6. **VOICEOVER ONLY (English emphasis): Produce NARRATION ONLY. No lip sync, no direct dialogue lines, no speaking characters. The text provided under 'narration' is voiceover narration only.**

    Format output as a JSON OBJECT with keys:
    - wordCount (number)
    - estimatedDuration (string)
    - consistentSubject (string)
    - socialPack (object with youtubeTitle, instagramCaption, hashtags (array of strings))
    - scenes (array of exactly 6 objects with id, timeStart, timeEnd, description, imagePrompt, motionPrompt, narration)

    Do not include markdown formatting. Return only the JSON object.
  `;

  try {
    const resp = await fetch('/api/chutesChat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'deepseek-ai/DeepSeek-V3.1',
            messages: [
                { role: 'system', content: 'Return only a JSON object. No markdown.' },
                { role: 'user', content: prompt }
            ],
            stream: false,
            max_tokens: 2048,
            temperature: 0.7
        })
    });

    if (!resp.ok) {
        let m = `HTTP ${resp.status}`; try { m = (await resp.json())?.error?.message || m; } catch {}
        throw new Error(m);
    }
    const data = await resp.json();
    const text = (data?.choices?.[0]?.message?.content || '').trim();
    if (!text) throw new Error("No data returned");
    
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
    return JSON.parse(cleaned) as FullContent;
  } catch (error) {
    console.error("Error generating content:", error);
    throw error;
  }
};

// 3. Generate Scene Image with Aspect Ratio - Using ImageSandboxApi
export const generateSceneImage = async (prompt: string, styleModifier: string, aspectRatio: AspectRatio, seed?: number): Promise<string> => {
  const fullPrompt = `
    ${styleModifier}. 
    Subject: ${prompt}. 
    Quality: Best quality, 8k, detailed textures, perfect lighting. 
    Constraint: Do not add text.
  `.trim();

  try {
    const token = await getVeoToken();
    
    // Map local AspectRatio to RootAspectRatio
    let targetRatio = RootAspectRatio.Landscape;
    if (aspectRatio === '9:16') targetRatio = RootAspectRatio.Portrait;
    else if (aspectRatio === '1:1') targetRatio = RootAspectRatio.Square;
    // Fallback for 4:3 or 3:4 to closest supported or default
    else if (aspectRatio === '3:4') targetRatio = RootAspectRatio.Portrait;
    else if (aspectRatio === '4:3') targetRatio = RootAspectRatio.Landscape;

    const url = await generateImagePromptOnly(
        fullPrompt,
        targetRatio,
        token,
        (progress, message) => {
            // Optional: You could dispatch an event or use a callback to update UI if needed
            // console.log(`Image gen progress: ${progress}% - ${message}`);
        },
        undefined,
        seed
    );
    return url;
  } catch (error) {
    console.error("Error generating image:", error);
    throw error;
  }
};
