export interface VideoFile {
  id: string;
  file: File;
  previewUrl: string;
  duration: number;
}

export enum ProcessingState {
  IDLE = 'IDLE',
  GENERATING_SCRIPT = 'GENERATING_SCRIPT',
  GENERATING_AUDIO = 'GENERATING_AUDIO',
  MERGING_VIDEO = 'MERGING_VIDEO',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export enum AI_Voice {
  Kore = 'Kore',
  Puck = 'Puck',
  Charon = 'Charon',
  Fenrir = 'Fenrir',
  Zephyr = 'Zephyr'
}

export enum NarrationStyle {
  CASUAL = 'Santai & Akrab',
  FORMAL = 'Formal & Profesional',
  EXCITED = 'Ceria & Bersemangat',
  STORY = 'Bercerita (Storytelling)',
  POETIC = 'Puitis & Sinematik',
  FUNNY = 'Lucu & Humoris'
}

export interface TTSConfig {
  text: string;
  voice: AI_Voice;
}

export enum WatermarkType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE'
}

export enum WatermarkPosition {
  TOP_LEFT = 'TOP_LEFT',
  TOP_RIGHT = 'TOP_RIGHT',
  BOTTOM_LEFT = 'BOTTOM_LEFT',
  BOTTOM_RIGHT = 'BOTTOM_RIGHT',
  CENTER = 'CENTER'
}

export enum WatermarkTemplate {
  PLAIN = 'PLAIN',
  CONTACT = 'CONTACT', // Phone number style
  SOCIAL = 'SOCIAL',   // Social media handle style
  NEWS = 'NEWS'        // Breaking news banner
}

export interface WatermarkConfig {
  enabled: boolean;
  type: WatermarkType;
  template: WatermarkTemplate;
  text?: string;
  imageFile?: File;
  position: WatermarkPosition;
  opacity: number; // 0.1 to 1.0
  scale: number; // 0.5 to 2.0 (Multiplier relative to base size)
}

export interface SubtitleChunk {
  text: string;
  startTime: number;
  endTime: number;
}

export interface SubtitleConfig {
  enabled: boolean;
  textColor: string;
  outlineColor: string;
  isBold: boolean;
  isItalic: boolean;
  fontSizeScale: number; // 0.5 to 2.0
  wordsPerLine: 1 | 2; // Limit to 1 or 2 words
  positionY: number; // 0 to 100% from top (usually 80-90%)
}