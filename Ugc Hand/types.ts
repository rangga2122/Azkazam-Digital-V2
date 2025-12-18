
export enum AppState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  GENERATING_IMAGES = 'GENERATING_IMAGES',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR'
}

export enum SceneStyle {
  MINIMALIST = 'Studio Minimalis',
  KITCHEN = 'Dapur Modern',
  LIVING_ROOM = 'Ruang Tamu Nyaman',
  OUTDOOR = 'Taman Cerah & Outdoor',
  OFFICE = 'Ruang Kerja Profesional',
  BATHROOM = 'Kamar Mandi Mewah',
  CUSTOM = 'Background Sendiri (Upload)'
}

export type AspectRatio = "1:1" | "3:4" | "4:3" | "9:16" | "16:9";

export type SceneCount = 2 | 3 | 4;

export type VoiceGender = 'Pria' | 'Wanita';

export type Language = 
  | 'Indonesia' 
  | 'Inggris' 
  | 'Malaysia' 
  | 'Jawa' 
  | 'Sunda' 
  | 'Mandarin' 
  | 'Jepang' 
  | 'Korea' 
  | 'Arab' 
  | 'Spanyol';

export interface SceneScript {
  id: number;
  title: string;
  visualPrompt: string;
  narrativePrompt: string;
  generatedImage?: string; // Base64 string
  isRegenerating?: boolean; // State for individual image regeneration
}

export interface UgcGenerationResult {
  productName: string;
  scenes: SceneScript[];
}

export interface FileData {
  file: File;
  preview: string;
  base64: string; // raw base64 data without prefix
  mimeType: string;
}
