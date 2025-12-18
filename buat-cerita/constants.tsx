import { VisualStyle } from './types';
export const LANGUAGES = [
  { id: 'id', name: 'Bahasa Indonesia' },
  { id: 'en', name: 'English' },
  { id: 'ms', name: 'Bahasa Melayu' },
  { id: 'ja', name: 'Japanese (日本語)' },
  { id: 'ko', name: 'Korean (한국어)' },
  { id: 'zh', name: 'Mandarin (中文)' },
  { id: 'ar', name: 'Arabic (العربية)' },
  { id: 'es', name: 'Spanish (Español)' },
];

export const VISUAL_STYLES: VisualStyle[] = [
  // --- ADULT / GENERAL STYLES (Realistic, Dramatic) ---
  {
    id: 'photo-real',
    name: 'Realistic Photo (DSLR)',
    description: 'Fotografi nyata, natural lighting, tekstur realistis.',
    icon: 'Camera',
    promptModifier: 'photorealistic real-world DSLR photo, natural lighting, high dynamic range, realistic materials and skin/fur texture, accurate colors, depth of field, cinematic bokeh, zero stylization',
    audiences: ['ADULT']
  },
  {
    id: 'hyper-real',
    name: 'Hyper Realistic Macro',
    description: 'Fotografi makro lempung ultra-realistis, detail pori & sidik jari.',
    icon: 'Eye',
    promptModifier: 'hyper-realistic claymation, 8k resolution, detailed photography, visible fingerprints and clay texture, volumetric lighting, ray tracing, depth of field',
    audiences: ['ADULT']
  },
  {
    id: 'cinematic-clay',
    name: 'Cinematic Drama',
    description: 'Pencahayaan dramatis, efek film.',
    icon: 'Film',
    promptModifier: 'cinematic claymation style, stop motion movie frame, high detail texture, dramatic chiaroscuro lighting, moody atmosphere, wide angle, isometric view, tilt-shift effect',
    audiences: ['ADULT']
  },
  {
    id: 'dark-fantasy',
    name: 'Dark Fantasy',
    description: 'Nuansa gelap, magis, misterius.',
    icon: 'Ghost',
    promptModifier: 'dark fantasy claymation, gothic atmosphere, eerie lighting, tim burton style, detailed miniature, mist and fog, desaturated tones',
    audiences: ['ADULT']
  },
  {
    id: 'studio-portrait',
    name: 'Studio Portrait',
    description: 'Pencahayaan studio bersih, fokus tajam.',
    icon: 'Camera',
    promptModifier: 'professional studio photography of clay figures, three-point lighting, clean background, sharp focus, 85mm lens style, commercial look',
    audiences: ['ADULT']
  },

  // --- KIDS STYLES (Cute, Colorful, Soft) ---
  {
    id: 'soft-3d',
    name: 'Soft 3D Cute',
    description: 'Lucu, warna pastel, bentuk membulat.',
    icon: 'Sparkles',
    promptModifier: 'soft 3d render clay style, cute vinyl toy aesthetic, pastel vibrant colors, soft studio lighting, smooth textures, rounded shapes, adorable character design, isometric view, miniature world',
    audiences: ['KIDS']
  },
  {
    id: 'playful-dough',
    name: 'Playful Dough',
    description: 'Seperti playdough buatan tangan anak-anak, warna cerah.',
    icon: 'Smile',
    promptModifier: 'playdough style, handmade feel, bright primary colors, simple shapes, messy but cute, kindergarten art style, high saturation, wide angle, diorama view',
    audiences: ['KIDS']
  },
  {
    id: 'lego',
    name: 'Lego World',
    description: 'Dunia balok plastik yang seru.',
    icon: 'Box',
    promptModifier: 'lego photography, bright colors, plastic texture, fun atmosphere, toy photography, isometric view, wide angle, miniature city',
    audiences: ['KIDS']
  },
  {
    id: 'paper',
    name: 'Paper Story',
    description: 'Dunia kertas potong berlapis.',
    icon: 'Scissors',
    promptModifier: 'paper cut diorama, layered paper art, depth box, storybook illustration style, whimsical lighting, isometric view, wide angle',
    audiences: ['KIDS']
  },
  {
    id: 'ghibli',
    name: 'Whimsical Diorama',
    description: 'Diorama alam yang menenangkan.',
    icon: 'Smile',
    promptModifier: 'ghibli style clay diorama, lush nature, hand painted texture feel, miniature world, peaceful atmosphere, cute, isometric view, wide angle',
    audiences: ['KIDS', 'ADULT']
  }
];

export const NARRATORS = [
  { 
    id: 'docu', 
    name: 'Dokumenter (Berat)', 
    desc: 'Wibawa NatGeo.', 
    voiceName: 'Fenrir',
    intonationTag: '[Narasi Suara Pria Intonasi Berat Dokumenter]' 
  },
  { 
    id: 'news', 
    name: 'Berita (Cepat)', 
    desc: 'Informatif, padat.', 
    voiceName: 'Puck',
    intonationTag: '[Narasi Suara Pria Intonasi Cepat Lugas]' 
  },
  { 
    id: 'teacher', 
    name: 'Edukasi (Ramah)', 
    desc: 'Jelas, lembut.', 
    voiceName: 'Kore',
    intonationTag: '[Narasi Suara Wanita Intonasi Edukatif Ramah]' 
  },
  { 
    id: 'mystery', 
    name: 'Misteri (Serius)', 
    desc: 'Pelan, mencekam.', 
    voiceName: 'Kore',
    intonationTag: '[Narasi Suara Wanita Intonasi Misterius]' 
  },
  { 
    id: 'casual', 
    name: 'Santai (Trivia)', 
    desc: 'Seperti teman.', 
    voiceName: 'Puck',
    intonationTag: '[Narasi Suara Pria Intonasi Santai Gaul]' 
  }, 
  { 
    id: 'kids_story', 
    name: 'Pendongeng (Anak)', 
    desc: 'Ceria, ekspresif.', 
    voiceName: 'Kore',
    intonationTag: '[Narasi Suara Wanita Ceria Antusias Seperti Mendongeng Untuk Anak TK]' 
  }, 
];
