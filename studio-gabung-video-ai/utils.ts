import { SubtitleChunk } from "./types";

// Utility to convert Base64 string to Uint8Array
export const base64ToUint8Array = (base64: string): Uint8Array => {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

// Utility to format seconds to MM:SS
export const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Convert Raw PCM (from Gemini) to WAV Blob so browsers can play/process it
export const pcmToWav = (pcmData: Uint8Array, sampleRate: number = 24000): Blob => {
  const numChannels = 1;
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const dataSize = pcmData.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, byteRate, true); // ByteRate
  view.setUint16(32, blockAlign, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write PCM data
  const pcmBytes = new Uint8Array(buffer, 44);
  pcmBytes.set(pcmData);

  return new Blob([buffer], { type: 'audio/wav' });
};

const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

/**
 * Generates synchronized subtitle chunks based on text and total audio duration.
 * Uses character-count proportional distribution for better accuracy than word-count.
 */
export const generateSubtitleChunks = (
  fullText: string, 
  totalDuration: number, 
  wordsPerLine: number
): SubtitleChunk[] => {
  // Clean text and split by whitespace
  const words = fullText.replace(/\s+/g, ' ').trim().split(' ');
  if (words.length === 0) return [];

  // Group words based on wordsPerLine preference
  const textGroups: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerLine) {
    textGroups.push(words.slice(i, i + wordsPerLine).join(' '));
  }

  // Calculate total "weight" (characters) to distribute time
  const totalChars = textGroups.reduce((acc, group) => acc + group.length, 0);
  
  const chunks: SubtitleChunk[] = [];
  let currentTime = 0;

  textGroups.forEach((text) => {
    // Calculate duration for this chunk based on its length relative to total
    // Minimum duration safeguard (e.g. 0.2s) to prevent flickering for very short words
    let duration = (text.length / totalChars) * totalDuration;
    
    // Slight adjustment: Add a tiny padding for readability, handled by ensuring start time flows
    chunks.push({
      text: text,
      startTime: currentTime,
      endTime: currentTime + duration
    });

    currentTime += duration;
  });

  return chunks;
};