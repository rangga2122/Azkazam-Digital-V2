export type SceneGenerationStatus = 'pending' | 'generating' | 'complete' | 'error';

export interface Scene {
  scene_number: number;
  visual_description: string;
  narration: string;
  dialogue_text: string;
  prompt: string; // Ini akan menjadi prompt skrip untuk Veo
  duration: string;
  image_generation_status: SceneGenerationStatus;
  image_url?: string;
}

export interface Storyboard {
  title: string;
  logline: string;
  scenes: Scene[];
}

export interface GenerationState {
  status: 'idle' | 'analyzing_character' | 'generating_story' | 'generating_images' | 'complete' | 'error';
  message?: string;
}