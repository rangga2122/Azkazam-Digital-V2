export enum ContentTone {
  INFORMATIVE = 'Informative',
  MIND_BLOWING = 'Mind Blowing',
  FUN = 'Fun & Quirky',
  HISTORICAL = 'Historical'
}

export type TargetAudience = 'KIDS' | 'ADULT';
export type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

export interface ContentConcept {
  tone: ContentTone;
  title: string;
  hook: string;
  summary: string;
}

export interface SocialPack {
  youtubeTitle: string;
  instagramCaption: string;
  hashtags: string[];
}

export interface Scene {
  id: number;
  timeStart: string;
  timeEnd: string;
  description: string;
  imagePrompt: string;
  motionPrompt: string;
  narration: string;
  generatedImageUrl?: string;
  isGeneratingImage?: boolean;
}

export interface FullContent {
  wordCount: number;
  estimatedDuration: string;
  consistentSubject: string;
  socialPack: SocialPack;
  scenes: Scene[];
  seed?: number;
}

export interface VisualStyle {
  id: string;
  name: string;
  description: string;
  icon: string;
  promptModifier: string;
  audiences: TargetAudience[]; // New field to categorize styles
}

export enum AppStep {
  INPUT = 'INPUT',
  SELECTION = 'SELECTION',
  GENERATION = 'GENERATION',
  RESULT = 'RESULT'
}