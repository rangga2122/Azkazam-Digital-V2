
export type AspectRatio = '16:9' | '9:16';
export type Resolution = '720p' | '1080p';
export type GenerationMode = 'single' | 'multi';

export interface GenerationState {
  isGenerating: boolean;
  progress: number;
  message: string;
  videoUrl: string | null;
  error: string | null;
}

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface BulkJob {
  id: string;
  prompt: string;
  imageBase64?: string | null; // Added support for image per job
  status: JobStatus;
  progress: number;
  videoUrl?: string;
  error?: string;
}

export interface PromptItem {
  id: string;
  text: string;
  image?: File | null;
}
