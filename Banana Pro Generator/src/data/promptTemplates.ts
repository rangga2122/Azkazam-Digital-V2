export interface PromptTemplate {
  id: string;
  label: string;
  category: string;
  prompt: string;
}

export const promptTemplates: PromptTemplate[] = [
  // UGC & Social Media
  {
    id: 'ugc-lifestyle',
    label: 'Foto Gaya Hidup UGC',
    category: 'UGC & Media Sosial',
    prompt: 'A high-quality, authentic user-generated content style photo of [Product] in a cozy living room setting, shot on iPhone, natural lighting, casual aesthetic, trending on social media, 4k.'
  },
  {
    id: 'ugc-unboxing',
    label: 'Pengalaman Unboxing',
    category: 'UGC & Media Sosial',
    prompt: 'First-person POV shot of unboxing a new [Product], messy desk background, excitement, natural daylight, shot on smartphone, high detail.'
  },
  {
    id: 'ugc-street',
    label: 'UGC Gaya Jalanan',
    category: 'UGC & Media Sosial',
    prompt: 'Candid street photography style shot of [Product] in a busy urban environment, blurry background, natural lighting, authentic vibe, high resolution.'
  },

  // Marketing & Advertising
  {
    id: 'ad-banner',
    label: 'Banner Promosi',
    category: 'Pemasaran & Iklan',
    prompt: 'A professional promotional banner design for [Product], bold typography, vibrant colors, minimalist background, high conversion design, award-winning advertising, 8k resolution.'
  },
  {
    id: 'ad-tv-commercial',
    label: 'Iklan TV Sinematik',
    category: 'Pemasaran & Iklan',
    prompt: 'Cinematic shot from a high-budget TV commercial featuring [Product], dynamic angle, dramatic studio lighting, professional color grading, sharp focus, 8k, slow-motion feel.'
  },
  {
    id: 'ad-product-hero',
    label: 'Foto Produk Unggulan',
    category: 'Pemasaran & Iklan',
    prompt: 'A premium hero shot of [Product] floating in mid-air, surrounded by relevant ingredients or elements, clean solid color background, soft studio lighting, advertising photography.'
  },

  // Professional Photography
  {
    id: 'photo-studio',
    label: 'Foto Studio',
    category: 'Fotografi Profesional',
    prompt: 'Professional studio photography of [Product], infinity curve background, three-point lighting setup, soft shadows, 85mm lens, incredibly detailed, commercial photography.'
  },
  {
    id: 'photo-portrait',
    label: 'Potret Sinematik',
    category: 'Fotografi Profesional',
    prompt: 'A cinematic portrait of a model holding [Product], bokeh background, golden hour lighting, rembrandt lighting, shot on Sony A7R IV, 85mm f/1.4 lens.'
  },
  {
    id: 'photo-macro',
    label: 'Detail Makro',
    category: 'Fotografi Profesional',
    prompt: 'Extreme macro close-up of [Product] texture, shallow depth of field, intricate details visible, professional lighting, sharp focus.'
  },

  // E-Commerce
  {
    id: 'ecom-white-bg',
    label: 'Latar Putih E-Com',
    category: 'E-Commerce',
    prompt: 'Clean e-commerce product photography of [Product] on a pure white background, front view, even lighting, no shadows, high resolution, ready for amazon.'
  },
  {
    id: 'ecom-context',
    label: 'Penggunaan Kontekstual',
    category: 'E-Commerce',
    prompt: 'A photo showing [Product] being used in its intended environment, clear demonstration of features, bright lighting, high commercial quality.'
  }
];
