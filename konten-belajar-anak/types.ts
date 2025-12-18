
export type AspectRatio = "1:1" | "9:16" | "16:9" | "4:3" | "3:4";

export interface AspectRatioOption {
  value: AspectRatio;
  label: string;
}

export interface ImageFile {
  data: string; // base64 data
  mimeType: string;
  previewUrl: string; // full data URL for <img> src
}

export type VisualStyle = 
  | "Roblox 3D" 
  | "Minecraft Voxel" 
  | "Disney Pixar 3D" 
  | "Anime Naruto Style" 
  | "Kartun Sopo Jarwo (3D Animation)" 
  | "Lego Stopmotion" 
  | "Claymation" 
  | "Paper Cutout"
  | "Superhero Comic"
  | "Low-Poly 3D"
  | "Pixel Art 2D"
  | "Flat Vector 2D"
  | "Watercolor Illustration"
  | "Chibi Anime"
  | "Realistic 3D Cartoon";

export type TeacherGender = "Pak Guru (Laki-laki)" | "Bu Guru (Perempuan)";
export type TeacherAge = "Muda & Enerjik (20-an)" | "Berpengalaman (30-40an)" | "Senior & Bijaksana (50+)";
export type TeacherVibe = "Seru & Lucu" | "Lembut & Mengayomi" | "Tegas & Memotivasi" | "Santai & Gaul";

export interface LearningMaterial {
    title: string;
    keyPoints: string;
}

export interface TeacherConfig {
    gender: TeacherGender;
    age: TeacherAge;
    vibe: TeacherVibe;
    visualStyle: VisualStyle;
    teacherPhoto?: string; // Base64 string of the uploaded photo
}

export interface Scene {
    id: number;
    script: string;
    image?: string; // URL/Base64
    videoPrompt?: string;
}
