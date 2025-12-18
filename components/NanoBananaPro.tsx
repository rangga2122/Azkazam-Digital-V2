 import React, { useEffect, useState } from 'react';
import { Image as ImageIcon, Loader2, X, Plus, Wand2, Sparkles, Tv, ArrowLeft, Check, Upload, ShoppingBag } from 'lucide-react';
import {
  generateImage,
  uploadUserImage,
  ImageAspectRatio,
  GeneratedImageResult,
} from '../Banana Pro Generator/src/services/imageSandboxApi';
import { compressImage } from '../Banana Pro Generator/src/utils/imageCompression';
import { promptTemplates } from '../Banana Pro Generator/src/data/promptTemplates';
import { GenerationStatus, AspectRatio } from '../types';

interface UploadedImage {
  id: string;
  file: File;
  preview: string;
  mediaId: string | null;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
  base64?: string;
  mimeType?: string;
}

const UGC_VIBES = [
  { id: 'energetic', label: 'Energetic & Fun', prompt: 'energetic, vibrant, fun atmosphere, dynamic mood' },
  { id: 'luxury', label: 'Luxury & Premium', prompt: 'luxurious, premium, expensive feel, sophisticated mood' },
  { id: 'calm', label: 'Calm & Zen', prompt: 'calm, peaceful, zen, relaxing atmosphere' },
  { id: 'professional', label: 'Professional', prompt: 'professional, corporate, trustworthy, clean mood' },
  { id: 'romantic', label: 'Romantic', prompt: 'romantic, dreamy, soft, emotional mood' },
  { id: 'edgy', label: 'Edgy & Bold', prompt: 'edgy, bold, high contrast, intense mood' },
  { id: 'fresh', label: 'Fresh & Organic', prompt: 'fresh, organic, natural, healthy atmosphere' }
];

const UGC_LIGHTING = [
  { id: 'natural', label: 'Natural Daylight', prompt: 'natural daylight, soft sun rays, bright and airy lighting' },
  { id: 'studio', label: 'Studio Softbox', prompt: 'professional studio softbox lighting, even illumination, clean shadows' },
  { id: 'dramatic', label: 'Dramatic Moody', prompt: 'dramatic lighting, high contrast, rim light, moody shadows' },
  { id: 'golden', label: 'Golden Hour', prompt: 'golden hour lighting, warm sun flare, magical sunset glow' },
  { id: 'neon', label: 'Neon Cyberpunk', prompt: 'neon colored lighting, cyberpunk vibes, blue and pink rim lights' },
  { id: 'cinematic', label: 'Cinematic Warm', prompt: 'cinematic warm lighting, tungsten tones, film look' }
];

type UgcCategory = 'product' | 'property' | 'vehicle';

const UGC_STYLES_PRODUCT = [
  // Original 6
  {
    id: 'premium-tv-commercial',
    label: 'Iklan TV Premium',
    icon: '📺',
    prompt: 'A stunning high-budget TV commercial shot of [PRODUCT], floating dramatically in the center with cinematic studio lighting, volumetric light rays, lens flare effects, ultra-premium product photography, 8K resolution, slow-motion feel, award-winning advertising campaign style, professional color grading.',
  },
  {
    id: 'lifestyle-usage',
    label: 'Gaya Hidup',
    icon: '🏠',
    prompt: 'A warm lifestyle advertisement photo of [PRODUCT] being naturally used in a beautiful modern home setting by an Indonesian person, soft natural sunlight through windows, cozy atmosphere, authentic UGC feel but professionally shot, happy ambient mood, commercial photography, 4K quality.',
  },
  {
    id: 'before-after',
    label: 'Sebelum & Sesudah',
    icon: '✨',
    prompt: 'A dramatic before and after transformation advertisement featuring [PRODUCT], split screen effect showing amazing results, glowing highlight on the after side, professional product photography, infomercial style, convincing visual impact, high quality commercial.',
  },
  {
    id: 'testimonial-scene',
    label: 'Testimoni Happy',
    icon: '😊',
    prompt: 'A heartwarming testimonial scene from a TV advertisement showing a happy and satisfied Indonesian person genuinely enjoying [PRODUCT], authentic smile, emotional connection, warm studio lighting, professional commercial photography, trust-building advertisement, 4K resolution.',
  },
  {
    id: 'action-infomercial',
    label: 'Aksi Dinamis',
    icon: '💥',
    prompt: 'An exciting action shot from an infomercial featuring [PRODUCT] with dynamic splashes, particles, or motion effects around it, high speed photography freeze frame, energetic and vibrant colors, eye-catching advertisement, professional product photography, 8K ultra detailed.',
  },
  {
    id: 'hero-cta-shot',
    label: 'Hero CTA',
    icon: '🌟',
    prompt: 'An ultra-premium hero shot of [PRODUCT] perfect for call-to-action, centered composition with luxurious gradient background, subtle golden glow, professional studio lighting setup, magazine cover quality, award-winning product photography, ready for billboard advertisement, 8K resolution.',
  },
  // New 6 Styles
  {
    id: 'minimalist-studio',
    label: 'Minimalis Studio',
    icon: '⚪',
    prompt: 'A clean and modern minimalist studio shot of [PRODUCT], placed on a geometric podium, solid pastel color background, soft shadows, high-end aesthetic, vogue magazine style, elegant and simple composition, 8K resolution.',
  },
  {
    id: 'neon-cyberpunk',
    label: 'Neon Cyberpunk',
    icon: '🌃',
    prompt: 'A futuristic cyberpunk style advertisement of [PRODUCT], surrounded by glowing neon lights, wet street reflection, night city background, blue and pink color palette, edgy and cool vibe, high tech feel, 8K resolution.',
  },
  {
    id: 'nature-organic',
    label: 'Alam Organik',
    icon: '🌿',
    prompt: 'A fresh and organic advertisement shot of [PRODUCT] placed in a lush nature setting, surrounded by green leaves, moss, or wood textures, dappled sunlight filtering through trees, eco-friendly vibe, natural beauty, 4K resolution.',
  },
  {
    id: 'luxury-gold',
    label: 'Kemewahan Emas',
    icon: '👑',
    prompt: 'An ultra-luxurious advertisement shot of [PRODUCT] with golden accents, black silk background, dramatic spotlight, reflections, expensive perfume commercial style, elegance and sophistication, 8K resolution.',
  },
  {
    id: 'vintage-retro',
    label: 'Vintage Retro',
    icon: '🎞️',
    prompt: 'A nostalgic vintage 90s style TV commercial shot of [PRODUCT] with Indonesian model, slight film grain, retro color grading, flash photography aesthetic, cool indie vibe, authentic and trendy, 4K resolution.',
  },
  {
    id: 'underwater-splash',
    label: 'Bawah Air',
    icon: '💧',
    prompt: 'A refreshing underwater shot of [PRODUCT], submerged in crystal clear water, bubbles rising, light rays piercing through surface, fresh and hydrating feel, dynamic liquid simulation, high speed photography, 8K resolution.',
  }
];

const UGC_STYLES_PROPERTY = [
  {
    id: 'modern-facade',
    label: 'Fasad Modern',
    icon: '🏢',
    prompt: 'A stunning architectural shot of [PRODUCT] as a modern property facade, golden hour lighting, lush landscaping, high-end real estate photography, 8K resolution, wide angle.',
  },
  {
    id: 'interior-luxury',
    label: 'Interior Mewah',
    icon: '🛋️',
    prompt: 'A luxurious interior design shot of [PRODUCT], spacious living room, modern furniture, warm ambient lighting, architectural digest style, high ceiling, elegant atmosphere, 8K.',
  },
  {
    id: 'poolside-relax',
    label: 'Tepi Kolam',
    icon: '🏊',
    prompt: 'A relaxing poolside view of [PRODUCT], crystal clear water, tropical plants, lounge chairs, sunny day, vacation vibe, luxury resort feel, professional architectural photography.',
  },
  {
    id: 'night-ambience',
    label: 'Suasana Malam',
    icon: '🌙',
    prompt: 'A dramatic night shot of [PRODUCT], architectural lighting, cozy warm glow from windows, twilight sky, sophisticated atmosphere, premium real estate listing style.',
  },
  {
    id: 'aerial-drone',
    label: 'Aerial Drone',
    icon: '🚁',
    prompt: 'A breathtaking aerial drone shot of [PRODUCT], bird\'s eye view, showing surrounding landscape, perfect composition, bright daylight, high-end property showcase.',
  },
  {
    id: 'garden-patio',
    label: 'Taman & Teras',
    icon: '🌻',
    prompt: 'A beautiful garden patio shot of [PRODUCT], blooming flowers, green grass, outdoor seating area, morning sunlight, fresh and inviting atmosphere, lifestyle real estate photography.',
  },
  {
    id: 'kitchen-gourmet',
    label: 'Dapur Gourmet',
    icon: '🍳',
    prompt: 'A modern gourmet kitchen shot of [PRODUCT], marble countertops, high-end appliances, warm ambient lighting, cooking preparation scene, culinary lifestyle, 8K resolution.',
  },
  {
    id: 'bedroom-sanctuary',
    label: 'Kamar Tidur',
    icon: '🛏️',
    prompt: 'A cozy bedroom sanctuary shot of [PRODUCT], soft textured bedding, warm bedside lamps, peaceful atmosphere, interior design magazine style, relaxation vibe, 8K.',
  },
  {
    id: 'bathroom-spa',
    label: 'Kamar Mandi Spa',
    icon: '🛁',
    prompt: 'A luxurious spa-like bathroom shot of [PRODUCT], stone textures, aromatic candles, steam, soft diffused lighting, wellness and relaxation theme, premium interior photography.',
  },
  {
    id: 'home-office',
    label: 'Ruang Kerja',
    icon: '💻',
    prompt: 'A productive home office setup shot of [PRODUCT], modern desk, ergonomic chair, soft natural light from window, organized and clean, professional workspace vibe.',
  },
  {
    id: 'minimalist-corner',
    label: 'Sudut Minimalis',
    icon: '📐',
    prompt: 'A carefully curated minimalist corner shot of [PRODUCT], aesthetic decor, neutral color palette, sharp shadows, artistic composition, trendy interior design style.',
  }
];

const UGC_STYLES_VEHICLE = [
  {
    id: 'showroom-studio',
    label: 'Showroom Studio',
    icon: '🏎️',
    prompt: 'A sleek studio shot of [PRODUCT], glossy floor reflections, professional softbox lighting, highlighting curves and details, automotive advertising style, 8K resolution.',
  },
  {
    id: 'rolling-shot',
    label: 'Rolling Action',
    icon: '🛣️',
    prompt: 'A dynamic rolling shot of [PRODUCT] driving on a scenic coastal road, motion blur background, sunset lighting, cinematic angle, high speed action, car commercial style.',
  },
  {
    id: 'offroad-adventure',
    label: 'Offroad Adventure',
    icon: '🏔️',
    prompt: 'A rugged offroad shot of [PRODUCT] on a dirt trail, splashing mud, mountain background, dramatic lighting, tough and durable vibe, adventure photography.',
  },
  {
    id: 'urban-night',
    label: 'Malam Perkotaan',
    icon: '🌃',
    prompt: 'A stylish night shot of [PRODUCT] in a city street, neon city lights reflections, wet asphalt, cyberpunk vibe, cool and edgy automotive photography.',
  },
  {
    id: 'detail-macro',
    label: 'Detail Macro',
    icon: '🔍',
    prompt: 'A close-up macro shot of [PRODUCT] details (headlights or emblem), depth of field, bokeh background, premium quality, automotive art photography.',
  },
  {
    id: 'sunset-scenic',
    label: 'Sunset Scenic',
    icon: '🌅',
    prompt: 'A majestic shot of [PRODUCT] parked at a scenic lookout point during sunset, warm golden light, beautiful landscape background, travel and lifestyle vibe.',
  },
  {
    id: 'racing-track',
    label: 'Sirkuit Balap',
    icon: '🏁',
    prompt: 'A high-octane racing track shot of [PRODUCT], motion blur, asphalt texture, stadium lights, aggressive angle, competitive racing atmosphere, automotive sports photography.',
  },
  {
    id: 'snowy-drift',
    label: 'Musim Dingin',
    icon: '❄️',
    prompt: 'A dramatic winter shot of [PRODUCT] on a snowy road, snowflakes falling, icy textures, cold blue lighting, winter tires, extreme weather durability test style.',
  },
  {
    id: 'desert-rally',
    label: 'Gurun Pasir',
    icon: '🏜️',
    prompt: 'An epic desert rally shot of [PRODUCT], sand dunes, dust clouds, hot sun lighting, mirage effect, expedition and exploration vibe, national geographic style.',
  },
  {
    id: 'rainy-mood',
    label: 'Hujan Dramatis',
    icon: '🌧️',
    prompt: 'A moody rainy day shot of [PRODUCT], rain droplets on surface, wet road reflections, overcast sky, cinematic melancholy atmosphere, emotional car photography.',
  },
  {
    id: 'vintage-classic',
    label: 'Klasik Retro',
    icon: '🎞️',
    prompt: 'A vintage classic car style shot of [PRODUCT], retro film grain, sepia tones, old town background, nostalgic atmosphere, 60s or 70s vibe, timeless elegance.',
  }
];

function NanoBananaPro({ onResultsChange, onModalOpenChange, onCreateVideo, inlineVideoMap }: { onResultsChange: (urls: string[]) => void, onModalOpenChange?: (open: boolean) => void, onCreateVideo?: (url: string, prompt?: string) => void, inlineVideoMap?: Record<string, { state: { status: GenerationStatus; progress: number; message: string; videoUrl?: string; error?: string }, aspect?: AspectRatio }> }) {
   const [token, setToken] = useState('');
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>('IMAGE_ASPECT_RATIO_LANDSCAPE');
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImageResult[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoPromptInputs, setVideoPromptInputs] = useState<Record<string, string>>({});
  const [viewMode, setViewMode] = useState<'standard' | 'ugc'>('standard');
  const [ugcImages, setUgcImages] = useState<UploadedImage[]>([]);
  const [ugcCategory, setUgcCategory] = useState<UgcCategory>('product');
  const [ugcVibe, setUgcVibe] = useState(UGC_VIBES[0].id);
  const [ugcLighting, setUgcLighting] = useState(UGC_LIGHTING[0].id);
  const [ugcSelectedStyles, setUgcSelectedStyles] = useState<string[]>(UGC_STYLES_PRODUCT.slice(0, 6).map(s => s.id));
  const [ugcAspectRatio, setUgcAspectRatio] = useState<ImageAspectRatio>('IMAGE_ASPECT_RATIO_LANDSCAPE');
  
  const currentUgcStyles = ugcCategory === 'property' 
    ? UGC_STYLES_PROPERTY 
    : ugcCategory === 'vehicle' 
      ? UGC_STYLES_VEHICLE 
      : UGC_STYLES_PRODUCT;

  // Reset selected styles when category changes
  useEffect(() => {
    setUgcSelectedStyles(currentUgcStyles.slice(0, 6).map(s => s.id));
  }, [ugcCategory]);

  const getCentralizedToken = async (): Promise<string> => {
     try {
       const resp = await fetch(`/api/globalSettings?key=VEO_BEARER_TOKEN&t=${Date.now()}`);
       if (resp.ok) {
         const json = await resp.json();
         const val = (json?.value || '').trim();
         if (val) return val;
       }
     } catch { }
     return '';
  };

  useEffect(() => {
    (async () => {
      const centralized = await getCentralizedToken();
      setToken(centralized);
    })();
  }, []);

  useEffect(() => {
    if (onModalOpenChange) onModalOpenChange(!!selectedImage);
  }, [selectedImage, onModalOpenChange]);

  const convertBlobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    const newImages: UploadedImage[] = files.map(file => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
      mediaId: null,
      status: 'pending',
    }));
    setUploadedImages(prev => [...prev, ...newImages]);

    files.forEach(async (file, index) => {
      const imgId = newImages[index].id;
      try {
        const compressedBlob = await compressImage(file, 100);
        const base64 = await convertBlobToBase64(compressedBlob);
        setUploadedImages(prev => prev.map(img =>
          img.id === imgId ? { ...img, base64, mimeType: 'image/jpeg' } : img
        ));
      } catch (err) {
        setUploadedImages(prev => prev.map(img =>
          img.id === imgId ? { ...img, status: 'error', error: 'Compression failed' } : img
        ));
      }
    });

    e.target.value = '';
  };

  const removeImage = (id: string) => {
    setUploadedImages(prev => prev.filter(img => img.id !== id));
  };

  const base64ToBlob = (base64: string, mimeType: string = 'image/png'): Blob => {
    const byteChars = atob(base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteNumbers[i] = byteChars.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  };

  const forceDownload = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
    } catch (err) {
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.target = '_blank';
      link.click();
    }
  };

  const downloadGenerated = async (img: GeneratedImageResult, filename: string) => {
    if (img.base64) {
      const blob = base64ToBlob(img.base64, img.mimeType || 'image/png');
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
      return;
    }
    if (img.url) {
      await forceDownload(img.url, filename);
    }
  };

  const handleGenerate = async () => {
    if (!token) {
      setError('Bearer Token Google Labs terpusat tidak tersedia.');
      return;
    }
    if (!prompt) {
      setError('Silakan isi prompt.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGeneratedImages([]);

    try {
      let currentImages = [...uploadedImages];
      const pendingImages = currentImages.filter(img => !img.mediaId && img.status !== 'error');

      if (pendingImages.length > 0) {
        setUploadedImages(prev => prev.map(img =>
          pendingImages.some(p => p.id === img.id) ? { ...img, status: 'uploading' } : img
        ));

        const uploadResults = await Promise.all(pendingImages.map(async (img) => {
          try {
            if (!img.base64) {
              const compressedBlob = await compressImage(img.file, 100);
              const base64 = await convertBlobToBase64(compressedBlob);
              img.base64 = base64;
              img.mimeType = 'image/jpeg';
            }
            const mediaId = await uploadUserImage({
              base64: img.base64!,
              mimeType: img.mimeType || 'image/jpeg',
              aspectRatio,
              token,
            });
            return { id: img.id, mediaId, status: 'done' as const };
          } catch (e: any) {
            return { id: img.id, error: e.message, status: 'error' as const };
          }
        }));

        currentImages = currentImages.map(img => {
          const res = uploadResults.find(r => r.id === img.id);
          if (res) {
            return res.status === 'done'
              ? { ...img, status: 'done', mediaId: res.mediaId }
              : { ...img, status: 'error', error: res.error };
          }
          return img;
        });
        setUploadedImages(currentImages);
        if (uploadResults.some(r => r.status === 'error')) {
          throw new Error('Gagal mengunggah sebagian gambar referensi. Periksa error lalu coba lagi.');
        }
      }

      const mediaIds = currentImages
        .filter(img => img.status === 'done' && img.mediaId)
        .map(img => img.mediaId as string);

      const images = await generateImage({
        prompt,
        aspectRatio,
        token,
        mediaIds,
        count: 4,
      });
      setGeneratedImages(images);
      const urls = images.map((img) => img.base64
        ? `data:${img.mimeType || 'image/png'};base64,${img.base64}`
        : (img.url as string)
      ).filter(Boolean) as string[];
      onResultsChange(urls);
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan tak diketahui');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUGCFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    const newImages: UploadedImage[] = files.map(file => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
      mediaId: null,
      status: 'pending',
    }));
    setUgcImages(prev => [...prev, ...newImages]);

    files.forEach(async (file, index) => {
      const imgId = newImages[index].id;
      try {
        const compressedBlob = await compressImage(file, 100);
        const base64 = await convertBlobToBase64(compressedBlob);
        setUgcImages(prev => prev.map(img =>
          img.id === imgId ? { ...img, base64, mimeType: 'image/jpeg' } : img
        ));
      } catch (err) {
        setUgcImages(prev => prev.map(img =>
          img.id === imgId ? { ...img, status: 'error', error: 'Compression failed' } : img
        ));
      }
    });
    
    e.target.value = '';
  };

  const removeUgcImage = (id: string) => {
    setUgcImages(prev => prev.filter(img => img.id !== id));
  };

  const handleUGCGenerate = async () => {
    if (!token) {
      setError('Bearer Token Google Labs terpusat tidak tersedia.');
      return;
    }
    if (ugcImages.length === 0) {
      setError('Silakan upload minimal satu foto produk.');
      return;
    }
    if (ugcSelectedStyles.length === 0) {
      setError('Pilih minimal satu gaya.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGeneratedImages([]);

    try {
        let currentImages = [...ugcImages];
        const pendingImages = currentImages.filter(img => !img.mediaId && img.status !== 'error');

        if (pendingImages.length > 0) {
             setUgcImages(prev => prev.map(img =>
               pendingImages.some(p => p.id === img.id) ? { ...img, status: 'uploading' } : img
             ));

             const uploadResults = await Promise.all(pendingImages.map(async (img) => {
               try {
                 if (!img.base64) {
                   const compressedBlob = await compressImage(img.file, 100);
                   const base64 = await convertBlobToBase64(compressedBlob);
                   img.base64 = base64;
                   img.mimeType = 'image/jpeg';
                 }
                 const mediaId = await uploadUserImage({
                   base64: img.base64!,
                   mimeType: img.mimeType || 'image/jpeg',
                   aspectRatio: ugcAspectRatio,
                   token,
                 });
                 return { id: img.id, mediaId, status: 'done' as const };
               } catch (e: any) {
                 return { id: img.id, error: e.message, status: 'error' as const };
               }
             }));

             currentImages = currentImages.map(img => {
               const res = uploadResults.find(r => r.id === img.id);
               if (res) {
                 return res.status === 'done'
                   ? { ...img, status: 'done', mediaId: res.mediaId }
                   : { ...img, status: 'error', error: res.error };
               }
               return img;
             });
             setUgcImages(currentImages);
             
             if (uploadResults.some(r => r.status === 'error')) {
                throw new Error('Gagal mengunggah sebagian gambar produk.');
             }
        }

        const mediaIds = currentImages
          .filter(img => img.status === 'done' && img.mediaId)
          .map(img => img.mediaId as string);

        if (mediaIds.length === 0) throw new Error('Tidak ada gambar valid untuk digenerate.');

        const vibePrompt = UGC_VIBES.find(v => v.id === ugcVibe)?.prompt || '';
        const lightingPrompt = UGC_LIGHTING.find(l => l.id === ugcLighting)?.prompt || '';
        
        const promises = ugcSelectedStyles.map(async (styleId) => {
            const style = currentUgcStyles.find(s => s.id === styleId);
            // Replace [PRODUCT] and append vibe/lighting
            let prompt = style?.prompt || '';
            prompt = prompt.replace('[PRODUCT]', 'the product shown in the reference images');
            prompt += `, ${vibePrompt}, ${lightingPrompt}`;
            
            try {
                const imgs = await generateImage({
                    prompt,
                    aspectRatio: ugcAspectRatio,
                    token,
                    mediaIds: mediaIds,
                    count: 1
                });
                return imgs[0];
            } catch (e) {
                console.error(`Failed to generate style ${styleId}`, e);
                return null;
            }
        });

        const generated = await Promise.all(promises);
        const validResults = generated.filter(Boolean) as GeneratedImageResult[];
        
        if (validResults.length === 0) {
            throw new Error('Gagal membuat gambar. Silakan coba lagi.');
        }

        setGeneratedImages(validResults);
        const urls = validResults.map((img) => img.base64
        ? `data:${img.mimeType || 'image/png'};base64,${img.base64}`
        : (img.url as string)
      ).filter(Boolean) as string[];
      onResultsChange(urls);

    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan tak diketahui');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadAllImages = async () => {
    for (let i = 0; i < generatedImages.length; i++) {
      const img = generatedImages[i];
      await downloadGenerated(img, `ugc-generated-${i + 1}.png`);
      await new Promise(r => setTimeout(r, 500));
    }
  };

  const handleDownloadAllVideos = () => {
    const downloadBase = import.meta.env?.DEV ? '/download' : '/api/download';
    let videoCount = 0;
    
    generatedImages.forEach((img, idx) => {
      const imgSrc = img.base64 ? `data:${img.mimeType || 'image/png'};base64,${img.base64}` : (img.url as string);
      const inline = inlineVideoMap ? inlineVideoMap[imgSrc] : undefined;
      
      if (inline?.state.status === GenerationStatus.Completed && inline?.state.videoUrl) {
        const filename = `ugc-video-${idx + 1}.mp4`;
        const proxied = `${downloadBase}?url=${encodeURIComponent(inline.state.videoUrl)}&filename=${encodeURIComponent(filename)}`;
        
        setTimeout(() => {
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = proxied;
          a.download = filename;
          a.target = '_self';
          document.body.appendChild(a);
          a.click();
          setTimeout(() => { if (a.parentNode) a.parentNode.removeChild(a); }, 100);
        }, videoCount * 500);
        videoCount++;
      }
    });
    
    if (videoCount === 0) {
      alert('Belum ada video selesai untuk diunduh.');
    }
  };

  const handleMergeAll = () => {
    const readyUrls: string[] = [];
    const downloadBase = import.meta.env?.DEV ? '/download' : '/api/download';

    generatedImages.forEach((img) => {
      const imgSrc = img.base64 ? `data:${img.mimeType || 'image/png'};base64,${img.base64}` : (img.url as string);
      const inline = inlineVideoMap ? inlineVideoMap[imgSrc] : undefined;
      if (inline?.state.status === GenerationStatus.Completed && inline?.state.videoUrl) {
        readyUrls.push(inline.state.videoUrl);
      }
    });

    if (readyUrls.length === 0) {
      alert('Belum ada video selesai untuk digabungkan.');
      return;
    }

    try {
      const urls = readyUrls.map((u, i) => `${downloadBase}?url=${encodeURIComponent(u)}&filename=${encodeURIComponent(`ugc-${String(i + 1).padStart(2, '0')}.mp4`)}`);
      try { sessionStorage.setItem('EDITOR_NARASI_URLS', JSON.stringify(urls)); } catch {}
      window.dispatchEvent(new CustomEvent('navigate-editor-narasi', { detail: { urls } }));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="min-h-[400px] bg-gray-900 text-gray-100 p-4 md:p-6 rounded-3xl">
      <div className="max-w-7xl mx-auto">
        {viewMode === 'standard' ? (
          <>
        <header className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <span className="text-yellow-400 text-2xl">🍌</span>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 to-orange-500">Banana Pro Generator</h1>
          </div>
          <button onClick={() => setViewMode('ugc')} className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 rounded-lg text-xs font-bold flex items-center gap-2 hover:shadow-lg hover:shadow-purple-500/25 transition-all text-white">
            <ShoppingBag className="w-4 h-4" /> UGC Generator
          </button>
        </header>

        

        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Aspect Ratio</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Landscape', value: 'IMAGE_ASPECT_RATIO_LANDSCAPE', icon: '▭' },
                  { label: 'Portrait', value: 'IMAGE_ASPECT_RATIO_PORTRAIT', icon: '▯' },
                  { label: 'Square', value: 'IMAGE_ASPECT_RATIO_SQUARE', icon: '□' },
                ].map((ratio) => (
                  <button
                    key={ratio.value}
                    onClick={() => setAspectRatio(ratio.value as ImageAspectRatio)}
                    className={`p-3 rounded-lg border text-sm font-medium transition-all flex flex-col items-center gap-1 ${aspectRatio === (ratio.value as ImageAspectRatio)
                        ? 'bg-yellow-500/10 border-yellow-500 text-yellow-500'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                      }`}
                  >
                    <span className="text-xl leading-none">{ratio.icon}</span>
                    {ratio.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-400">Prompt</label>
                <div className="relative">
                  <select
                    onChange={(e) => {
                      const template = promptTemplates.find(t => t.id === e.target.value);
                      if (template) setPrompt(template.prompt);
                      e.target.value = '';
                    }}
                    className="appearance-none bg-gray-800 text-yellow-500 text-xs font-medium border border-gray-700 rounded-lg py-1 px-3 pr-8 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 cursor-pointer"
                  >
                    <option value="">Template Cepat...</option>
                    {[...new Set(promptTemplates.map(t => t.category))].map(category => (
                      <optgroup key={category} label={category}>
                        {promptTemplates.filter(t => t.category === category).map(t => (
                          <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <Sparkles className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-yellow-500 pointer-events-none" />
                </div>
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Deskripsikan gambar atau pilih template di atas..."
                className="w-full h-32 bg-gray-800 border border-gray-700 rounded-xl p-4 text-sm focus:ring-2 focus:ring-yellow-500 outline-none resize-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Reference Images</label>
              <div className="flex flex-wrap gap-3">
                {uploadedImages.map((img) => (
                  <div key={img.id} className="relative w-20 h-20 group">
                    <img src={img.preview} alt="Ref" className={`w-full h-full object-cover rounded-lg border ${img.status === 'error' ? 'border-red-500' : 'border-gray-600'}`} />
                    <button onClick={() => removeImage(img.id)} className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="w-3 h-3 text-white" />
                    </button>
                    {img.status === 'uploading' && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
                        <Loader2 className="w-5 h-5 text-white animate-spin" />
                      </div>
                    )}
                    {img.status === 'error' && (
                      <div className="absolute inset-0 bg-red-500/50 flex items-center justify-center rounded-lg">
                        <span className="text-xs font-bold text-white">!</span>
                      </div>
                    )}
                  </div>
                ))}

                <label className="w-20 h-20 flex flex-col items-center justify-center border-2 border-dashed border-gray-700 rounded-lg cursor-pointer hover:border-yellow-500 hover:text-yellow-500 text-gray-500 transition-all">
                  <Plus className="w-6 h-6 mb-1" />
                  <span className="text-[10px]">Add</span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleFileUpload} />
                </label>
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all ${isGenerating ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-400 hover:to-orange-500 text-white shadow-lg hover:shadow-orange-500/25'}`}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Wand2 className="w-6 h-6" />
                  Generate
                </>
              )}
            </button>

            {error && (
              <div className="p-4 bg-red-900/20 border border-red-500/50 rounded-xl text-red-200 text-sm">{error}</div>
            )}
          </div>

          <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-4 md:p-6 min-h-[300px]">
            {generatedImages.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {generatedImages.map((img, idx) => {
                  const imgSrc = img.base64 ? `data:${img.mimeType || 'image/png'};base64,${img.base64}` : (img.url as string);
                  const promptVal = videoPromptInputs[imgSrc] || '';
                  const inline = inlineVideoMap ? inlineVideoMap[imgSrc] : undefined;
                  const st = inline?.state.status;
                  const videoUrl = inline?.state.videoUrl;
                  const isVideoReady = st === GenerationStatus.Completed && !!videoUrl;
                  const isLoading = st === GenerationStatus.Uploading || st === GenerationStatus.Pending || st === GenerationStatus.Processing;
                  const aspectCls = inline?.aspect === AspectRatio.Portrait
                    ? 'aspect-[9/16]'
                    : inline?.aspect === AspectRatio.Square
                      ? 'aspect-square'
                      : 'aspect-video';

                  return (
                    <div key={idx} className="relative w-full bg-gray-900 rounded-xl overflow-hidden shadow-lg">
                      <div className={`relative ${inline?.aspect ? aspectCls : ''} bg-black transition-all duration-500`}>
                        {isVideoReady && (
                          <div className="absolute inset-0 animate-fadeIn">
                            <video src={videoUrl as string} controls autoPlay loop playsInline className="w-full h-full object-contain" />
                            <div className="absolute top-2 right-2 z-10">
                              <a href={(import.meta.env?.DEV ? '/download' : '/api/download') + `?url=${encodeURIComponent(videoUrl as string)}&filename=${encodeURIComponent('veo3-video.mp4')}`} className="bg-black/50 hover:bg-yellow-500/90 backdrop-blur-md text-white p-2 rounded-lg shadow-lg border border-white/10 transition-all" title="Download Video">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
                              </a>
                            </div>
                          </div>
                        )}

                        {isLoading && (
                          <div className="absolute inset-0 flex items-center justify-center p-4 animate-fadeIn">
                            <div className="space-y-3 w-full max-w-xs text-center">
                              <div className="relative w-14 h-14 mx-auto">
                                <div className="absolute inset-0 rounded-full border-8 border-white/20"></div>
                                <div className="absolute inset-0 rounded-full border-t-8 border-yellow-500 animate-spin"></div>
                              </div>
                              <p className="text-xs font-medium text-white/90">{inline?.state.message || 'Membuat video...'}</p>
                              <div className="h-2 w-full bg-white/20 rounded-full overflow-hidden">
                                <div className="h-full bg-yellow-500 rounded-full transition-all duration-700" style={{ width: `${Math.max(5, inline?.state.progress || 0)}%` }}></div>
                              </div>
                            </div>
                          </div>
                        )}

                        {(!inline || st === GenerationStatus.Idle || st === undefined) && (
                          <div className="group cursor-pointer" onClick={() => setSelectedImage(imgSrc)}>
                            <img src={imgSrc} alt={`Generated Result ${idx + 1}`} className="w-full h-auto object-contain hover:scale-105 transition-transform duration-500" />
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); downloadGenerated(img, `banana-pro-generated-${idx + 1}.png`); }}
                                className="bg-gray-900/80 text-white p-2 rounded-lg hover:bg-black"
                                title="Download"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
                              </button>
                            </div>
                          </div>
                        )}

                        {st === GenerationStatus.Failed && (
                          <div className="absolute inset-0 flex items-center justify-center p-4 bg-red-900/40 animate-fadeIn">
                            <div className="text-center space-y-2">
                              <p className="text-xs text-red-200 font-semibold">{inline?.state.error || 'Gagal membuat video.'}</p>
                              <button type="button" onClick={() => onCreateVideo?.(imgSrc, promptVal.trim() || undefined)} className="px-3 py-1.5 text-xs rounded-lg bg-red-600 text-white hover:bg-red-700">Coba Lagi</button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="p-3 border-t border-gray-700 space-y-2">
                        <input
                          type="text"
                          value={promptVal}
                          onChange={(e) => setVideoPromptInputs(prev => ({ ...prev, [imgSrc]: e.target.value }))}
                          className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-sm text-gray-100 placeholder:text-gray-500"
                          placeholder="Tulis prompt video"
                        />
                        <button
                          type="button"
                          disabled={isLoading}
                          onClick={() => onCreateVideo?.(imgSrc, promptVal.trim() || undefined)}
                          className={`inline-flex items-center justify-center w-full px-3 py-2 rounded-xl font-bold text-sm transition-colors shadow-sm ${isLoading ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-yellow-500 text-black hover:bg-yellow-400'}`}
                        >
                          {isLoading ? 'Memproses...' : 'Buat Video'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 min-h-[250px]">
                <ImageIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>Hasil akan muncul di sini</p>
              </div>
            )}
          </div>
        </div>
        </>
        ) : (
            <div className="space-y-6 animate-fadeIn">
                <header className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-2">
                    <button onClick={() => setViewMode('standard')} className="p-2 rounded-full hover:bg-gray-800 transition-colors">
                        <ArrowLeft className="w-6 h-6 text-gray-400" />
                    </button>
                    <Tv className="text-purple-400 w-8 h-8" />
                    <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-500">UGC Generator</h1>
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
                    <div className="space-y-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-400 mb-2">Reference Images</label>
                          <div className="flex flex-wrap gap-3">
                            {ugcImages.map((img) => (
                              <div key={img.id} className="relative w-20 h-20 group">
                                <img src={img.preview} alt="Ref" className={`w-full h-full object-cover rounded-lg border ${img.status === 'error' ? 'border-red-500' : 'border-gray-600'}`} />
                                <button onClick={() => removeUgcImage(img.id)} className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                  <X className="w-3 h-3 text-white" />
                                </button>
                                {img.status === 'uploading' && (
                                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
                                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                                  </div>
                                )}
                                {img.status === 'error' && (
                                  <div className="absolute inset-0 bg-red-500/50 flex items-center justify-center rounded-lg">
                                    <span className="text-xs font-bold text-white">!</span>
                                  </div>
                                )}
                              </div>
                            ))}

                            <label className="w-20 h-20 flex flex-col items-center justify-center border-2 border-dashed border-gray-700 rounded-lg cursor-pointer hover:border-purple-500 hover:text-purple-500 text-gray-500 transition-all">
                              <Plus className="w-6 h-6 mb-1" />
                              <span className="text-[10px]">Add</span>
                              <input type="file" accept="image/*" multiple className="hidden" onChange={handleUGCFileUpload} />
                            </label>
                          </div>
                          {ugcImages.length === 0 && <p className="text-xs text-gray-500 mt-2">Upload foto produk (bisa lebih dari satu untuk hasil terbaik).</p>}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-400 mb-2">Kategori UGC</label>
                          <div className="flex bg-gray-800 rounded-lg p-1 gap-1">
                            <button
                              onClick={() => setUgcCategory('product')}
                              className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${ugcCategory === 'product' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                            >
                              Produk
                            </button>
                            <button
                              onClick={() => setUgcCategory('property')}
                              className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${ugcCategory === 'property' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                            >
                              Properti
                            </button>
                            <button
                              onClick={() => setUgcCategory('vehicle')}
                              className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${ugcCategory === 'vehicle' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                            >
                              Kendaraan
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-400 mb-2">Aspect Ratio</label>
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { label: 'Landscape', value: 'IMAGE_ASPECT_RATIO_LANDSCAPE', icon: '▭' },
                              { label: 'Portrait', value: 'IMAGE_ASPECT_RATIO_PORTRAIT', icon: '▯' },
                              { label: 'Square', value: 'IMAGE_ASPECT_RATIO_SQUARE', icon: '□' },
                            ].map((ratio) => (
                              <button
                                key={ratio.value}
                                onClick={() => setUgcAspectRatio(ratio.value as ImageAspectRatio)}
                                className={`p-2 rounded-lg border text-xs font-medium transition-all flex flex-col items-center gap-1 ${ugcAspectRatio === (ratio.value as ImageAspectRatio)
                                    ? 'bg-purple-500/10 border-purple-500 text-purple-500'
                                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                                  }`}
                              >
                                <span className="text-lg leading-none">{ratio.icon}</span>
                                {ratio.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Vibe (Suasana)</label>
                            <select value={ugcVibe} onChange={(e) => setUgcVibe(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none">
                            {UGC_VIBES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Lighting (Pencahayaan)</label>
                            <select value={ugcLighting} onChange={(e) => setUgcLighting(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none">
                            {UGC_LIGHTING.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                            </select>
                        </div>

                        <div>
                            <div className="flex justify-between items-center mb-2">
                            <label className="block text-sm font-medium text-gray-400">Pilih Gaya ({ugcSelectedStyles.length}/6)</label>
                            <span className="text-xs text-gray-500">Max 6</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                            {currentUgcStyles.map(style => {
                                const isSelected = ugcSelectedStyles.includes(style.id);
                                return (
                                <button
                                    key={style.id}
                                    onClick={() => {
                                    if (isSelected) {
                                        setUgcSelectedStyles(prev => prev.filter(id => id !== style.id));
                                    } else {
                                        if (ugcSelectedStyles.length < 6) {
                                        setUgcSelectedStyles(prev => [...prev, style.id]);
                                        }
                                    }
                                    }}
                                    className={`p-3 rounded-xl border text-left transition-all relative ${isSelected ? 'bg-purple-500/20 border-purple-500' : 'bg-gray-800 border-gray-700 hover:border-gray-600'}`}
                                >
                                    <div className="text-2xl mb-2">{style.icon}</div>
                                    <div className="text-xs font-bold text-gray-200">{style.label}</div>
                                    {isSelected && <div className="absolute top-2 right-2 w-4 h-4 bg-purple-500 rounded-full flex items-center justify-center"><Check className="w-3 h-3 text-white" /></div>}
                                </button>
                                );
                            })}
                            </div>
                        </div>

                        <button
                            onClick={handleUGCGenerate}
                            disabled={isGenerating}
                            className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all ${isGenerating ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-400 hover:to-pink-500 text-white shadow-lg'}`}
                        >
                            {isGenerating ? <Loader2 className="animate-spin w-5 h-5" /> : <Wand2 className="w-5 h-5" />}
                            {isGenerating ? 'Generating...' : `Generate ${ugcSelectedStyles.length} Iklan TV`}
                        </button>
                        {error && <div className="text-red-400 text-xs text-center">{error}</div>}
                    </div>

                    <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-4 md:p-6 min-h-[500px] flex flex-col items-center justify-center">
                        {generatedImages.length > 0 ? (
                            <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full h-full content-start mb-6">
                                {generatedImages.map((img, idx) => {
                                     const imgSrc = img.base64 ? `data:${img.mimeType || 'image/png'};base64,${img.base64}` : (img.url as string);
                                     const promptVal = videoPromptInputs[imgSrc] || '';
                                     const inline = inlineVideoMap ? inlineVideoMap[imgSrc] : undefined;
                                     const st = inline?.state.status;
                                     const videoUrl = inline?.state.videoUrl;
                                     const isVideoReady = st === GenerationStatus.Completed && !!videoUrl;
                                     const isLoading = st === GenerationStatus.Uploading || st === GenerationStatus.Pending || st === GenerationStatus.Processing;
                                     const aspectCls = inline?.aspect === AspectRatio.Portrait
                                      ? 'aspect-[9/16]'
                                      : inline?.aspect === AspectRatio.Square
                                        ? 'aspect-square'
                                        : 'aspect-video';
                                     
                                     return (
                                        <div key={idx} className="relative w-full bg-gray-900 rounded-xl overflow-hidden shadow-lg group">
                                            <div className={`relative ${inline?.aspect ? aspectCls : 'aspect-video'} bg-black transition-all duration-500`}>
                                              {isVideoReady && (
                                                <div className="absolute inset-0 animate-fadeIn z-10">
                                                  <video src={videoUrl as string} controls autoPlay loop playsInline className="w-full h-full object-contain" />
                                                </div>
                                              )}
                                              
                                              {isLoading && (
                                                <div className="absolute inset-0 flex items-center justify-center p-4 animate-fadeIn z-20 bg-black/50">
                                                  <div className="space-y-3 w-full max-w-xs text-center">
                                                    <div className="relative w-14 h-14 mx-auto">
                                                      <div className="absolute inset-0 rounded-full border-8 border-white/20"></div>
                                                      <div className="absolute inset-0 rounded-full border-t-8 border-yellow-500 animate-spin"></div>
                                                    </div>
                                                    <p className="text-xs font-medium text-white/90">{inline?.state.message || 'Membuat video...'}</p>
                                                    <div className="h-2 w-full bg-white/20 rounded-full overflow-hidden">
                                                      <div className="h-full bg-yellow-500 rounded-full transition-all duration-700" style={{ width: `${Math.max(5, inline?.state.progress || 0)}%` }}></div>
                                                    </div>
                                                  </div>
                                                </div>
                                              )}

                                              {(!inline || st === GenerationStatus.Idle || st === undefined) && (
                                                <div className="cursor-pointer relative h-full" onClick={() => setSelectedImage(imgSrc)}>
                                                    <img src={imgSrc} className="w-full h-full object-cover" />
                                                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); downloadGenerated(img, `ugc-tv-ad-${idx + 1}.png`); }}
                                                            className="bg-gray-900/80 text-white p-2 rounded-lg hover:bg-black"
                                                            title="Download"
                                                        >
                                                            <Upload className="w-4 h-4 rotate-180" />
                                                        </button>
                                                    </div>
                                                </div>
                                              )}
                                            </div>
                                            
                                            <div className="p-3 border-t border-gray-700 space-y-2 bg-gray-900">
                                              <input
                                                type="text"
                                                value={promptVal}
                                                onChange={(e) => setVideoPromptInputs(prev => ({ ...prev, [imgSrc]: e.target.value }))}
                                                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-sm text-gray-100 placeholder:text-gray-500"
                                                placeholder="Tulis prompt video..."
                                              />
                                              <button
                                                type="button"
                                                disabled={isLoading}
                                                onClick={() => onCreateVideo?.(imgSrc, promptVal.trim() || undefined)}
                                                className={`inline-flex items-center justify-center w-full px-3 py-2 rounded-xl font-bold text-sm transition-colors shadow-sm ${isLoading ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-purple-600 text-white hover:bg-purple-500'}`}
                                              >
                                                {isLoading ? 'Memproses...' : 'Buat Video'}
                                              </button>
                                            </div>
                                        </div>
                                     );
                                })}
                            </div>
                            <div className="flex flex-wrap gap-3 w-full justify-center pt-4 border-t border-gray-700 mt-auto">
                                <button type="button" onClick={handleDownloadAllImages} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-700 border border-gray-600 text-white font-bold hover:bg-gray-600 transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M5 5h14v14H5z"/><path d="M12 14l-3-3-4 4v2h14v-2l-4-4-3 3z"/></svg>
                                    Download Semua Gambar
                                </button>
                                <button type="button" onClick={handleDownloadAllVideos} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 text-white font-bold hover:bg-purple-500 transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M4 6h16v12H4z"/><path d="M12 14l-3-3-4 4v2h14v-2l-4-4-3 3z"/></svg>
                                    Download Semua Video
                                </button>
                                <button type="button" onClick={handleMergeAll} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600 text-white font-bold hover:bg-orange-500 transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M4 6h16v12H4z"/><path d="M9 8h6v8H9z"/></svg>
                                    Gabungkan Semua Video
                                </button>
                            </div>
                            </>
                        ) : (
                            <div className="text-center text-gray-500">
                                <Tv className="w-16 h-16 mx-auto mb-4 opacity-50" />
                                <p>Siap Generate Iklan TV</p>
                                <p className="text-xs mt-2 max-w-xs mx-auto">Pilih Vibe, Lighting, dan Gaya Iklan yang diinginkan, lalu klik Generate.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

        {selectedImage && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 p-4" onClick={() => { setSelectedImage(null); onModalOpenChange?.(false); }}>
            <div className="relative max-w-full max-h-full">
              <img src={selectedImage} alt="Full size" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" />
              <div className="absolute -top-12 right-0 flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (selectedImage.startsWith('data:')) {
                      const link = document.createElement('a');
                      link.href = selectedImage;
                      link.download = 'banana-pro-generated-full.png';
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    } else {
                      forceDownload(selectedImage, 'banana-pro-generated-full.png');
                    }
                  }}
                  className="p-2 text-white hover:text-gray-300 transition-colors"
                  title="Download"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default NanoBananaPro;
