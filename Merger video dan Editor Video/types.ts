export enum AspectRatio {
    Landscape = '16:9',
    Portrait = '9:16'
}

export enum Resolution {
    HD = '720p',
    FHD = '1080p'
}

export enum GenerationStatus {
    Idle = 'idle',
    Uploading = 'uploading',
    Pending = 'pending',
    Processing = 'processing',
    Completed = 'completed',
    Failed = 'failed'
}

export interface GenerationState {
    status: GenerationStatus;
    progress: number;
    message: string;
    videoUrl?: string;
    error?: string;
}

export interface GenerateOptions {
    prompt: string;
    aspectRatio: AspectRatio;
    resolution: Resolution;
    image?: File | null;
}