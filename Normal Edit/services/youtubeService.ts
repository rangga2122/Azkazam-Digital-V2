import { getVideoDuration } from './videoService';
// Avoid static import; normalize FFmpeg exports via dynamic import for compatibility
let ffmpegExports: { createFFmpeg: (opts: any) => any; fetchFile: (input: any) => Promise<Uint8Array> } | null = null;
const getFfmpegExports = async () => {
  if (ffmpegExports) return ffmpegExports;
  const mod: any = await import('@ffmpeg/ffmpeg');
  const create = mod?.createFFmpeg || mod?.default?.createFFmpeg;
  const fetch = mod?.fetchFile || mod?.default?.fetchFile;
  if (!create || !fetch) throw new Error('FFmpeg exports not found');
  ffmpegExports = { createFFmpeg: create, fetchFile: fetch };
  return ffmpegExports;
};

let ffmpegInstance: any | null = null;
let ffmpegLoading: Promise<void> | null = null;
const getFfmpeg = async () => {
  if (ffmpegInstance) return ffmpegInstance;
  if (!ffmpegLoading) {
    const corePath = 'https://unpkg.com/@ffmpeg/core-st@0.12.6/dist/umd/ffmpeg-core.js';
    const { createFFmpeg } = await getFfmpegExports();
    ffmpegInstance = createFFmpeg({ log: false, corePath });
    ffmpegLoading = ffmpegInstance.load();
  }
  await ffmpegLoading;
  return ffmpegInstance;
};

const ensureMp4H264Aac = async (blob: Blob, extension: string, fps = 30): Promise<Blob> => {
  let ff: any;
  try {
    ff = await getFfmpeg();
  } catch (initErr) {
    return blob;
  }
  const { fetchFile } = await getFfmpegExports();
  const inExt = (extension || 'webm').toLowerCase();
  const inputName = `input.${inExt}`;
  const outputName = 'output.mp4';
  ff.FS('writeFile', inputName, await fetchFile(blob));
  const tryCopy = inExt === 'mp4';
  try {
    if (tryCopy) {
      await ff.run('-i', inputName, '-c:v', 'copy', '-c:a', 'copy', '-movflags', '+faststart', outputName);
    } else {
      await ff.run(
        '-i', inputName,
        '-c:v', 'libx264',
        '-profile:v', 'high',
        '-level', '4.1',
        '-pix_fmt', 'yuv420p',
        '-preset', 'veryfast',
        '-crf', '18',
        '-r', String(Math.max(1, fps || 30)),
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '48000',
        '-ac', '2',
        '-movflags', '+faststart',
        outputName
      );
    }
  } catch (e) {
    try {
      await ff.run(
        '-i', inputName,
        '-c:v', 'libx264',
        '-profile:v', 'high',
        '-level', '4.1',
        '-pix_fmt', 'yuv420p',
        '-preset', 'veryfast',
        '-crf', '18',
        '-r', String(Math.max(1, fps || 30)),
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '48000',
        '-ac', '2',
        '-movflags', '+faststart',
        outputName
      );
    } catch (e2) {
      try { ff.FS('unlink', inputName); } catch {}
      return blob;
    }
  }
  const data = ff.FS('readFile', outputName);
  try { ff.FS('unlink', inputName); } catch {}
  try { ff.FS('unlink', outputName); } catch {}
  return new Blob([data.buffer], { type: 'video/mp4' });
};

export type ShortsSegment = { start: number; duration: number; title?: string };


export const normalizeYouTubeUrl = (url: string): string => {
  try {
    const u = new URL(url.trim());
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return `https://www.youtube.com/watch?v=${v}`;
      const paths = u.pathname.split('/').filter(Boolean);
      if (paths[0] === 'shorts' && paths[1]) return `https://www.youtube.com/watch?v=${paths[1]}`;
      if (paths[0] === 'embed' && paths[1]) return `https://www.youtube.com/watch?v=${paths[1]}`;
    } else if (u.hostname === 'youtu.be') {
      const id = u.pathname.replace('/', '');
      if (id) return `https://www.youtube.com/watch?v=${id}`;
    }
    return url.trim();
  } catch { return url.trim(); }
};

export const downloadYouTubeMp4 = async (url: string): Promise<Blob> => {
  const normalized = normalizeYouTubeUrl(url);
  const resp = await fetch(`http://localhost:4001/api/youtube/download?url=${encodeURIComponent(normalized)}`);
  if (!resp.ok) throw new Error('Gagal mendownload video YouTube');
  const buf = await resp.arrayBuffer();
  return new Blob([buf], { type: 'video/mp4' });
};

// Analyze scenes using showinfo logs
export const computeDefaultSegments = (totalDuration: number): ShortsSegment[] => {
  const targets = [30, 20, 15];
  const starts = [0, 30, 60];
  const segments: ShortsSegment[] = [];
  for (let i = 0; i < targets.length; i++) {
    const d = Math.min(targets[i], Math.max(5, Math.floor(totalDuration)));
    let s = starts[i];
    if (s + d > totalDuration) s = Math.max(0, totalDuration - d);
    segments.push({ start: s, duration: d });
  }
  // Remove near-duplicates
  const out: ShortsSegment[] = [];
  for (const s of segments) {
    if (!out.some(o => Math.abs(o.start - s.start) < 5)) out.push(s);
  }
  return out;
};

export const recommendShortSegments = (scenePoints: number[], totalDuration: number): ShortsSegment[] => {
  // Trend: 15-30s clips, choose up to 3 segments around strongest scene changes
  const targets = [30, 20, 15];
  const segments: ShortsSegment[] = [];
  const pivots = scenePoints.length ? scenePoints : [Math.min(10, totalDuration/2)];
  for (let i=0; i<targets.length; i++) {
    const d = targets[i];
    const center = pivots[Math.min(i, pivots.length-1)];
    const start = Math.max(0, center - d/2);
    const safeStart = Math.min(start, Math.max(0, totalDuration - d));
    segments.push({ start: Math.max(0, safeStart), duration: Math.min(d, totalDuration) });
  }
  // Remove overlaps
  const out: ShortsSegment[] = [];
  for (const s of segments) {
    if (!out.some(o => Math.abs(o.start - s.start) < 5)) out.push(s);
  }
  return out;
};

const recordSegmentUsingRecorder = async (
  inputBlob: Blob,
  start: number,
  duration: number,
  onStatus?: (msg: string) => void
): Promise<{ filename: string; url: string }> => {
  const width = 1080;
  const height = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas context not available');

  const videoUrl = URL.createObjectURL(inputBlob);
  const video = document.createElement('video');
  video.src = videoUrl;
  video.muted = false;
  video.playsInline = true;
  video.preload = 'auto';
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('Failed to load video'));
    video.load();
  });

  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (audioCtx.state === 'suspended') { await audioCtx.resume(); }
  const audioDestination = audioCtx.createMediaStreamDestination();
  let elementAudioSource: MediaElementAudioSourceNode | null = null;
  try {
    elementAudioSource = audioCtx.createMediaElementSource(video);
    elementAudioSource.connect(audioDestination);
  } catch {}

  const videoStream = canvas.captureStream(30);
  const combinedStream = new MediaStream([
    videoStream.getVideoTracks()[0],
    audioDestination.stream.getAudioTracks()[0]
  ]);

  const mimeTypesToTry = [
    'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
    'video/mp4',
    'video/webm; codecs="vp8, opus"',
    'video/webm',
  ];
  const supportedMimeType = mimeTypesToTry.find(t => MediaRecorder.isTypeSupported(t));
  if (!supportedMimeType) throw new Error('Browser tidak mendukung format rekam yang diperlukan');
  const options = { mimeType: supportedMimeType, videoBitsPerSecond: 3000000 } as MediaRecorderOptions;
  const extension = supportedMimeType.includes('webm') ? 'webm' : 'mp4';
  const recorder = new MediaRecorder(combinedStream, options);
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  const clockSource = audioCtx.createBufferSource();
  const silentBuffer = audioCtx.createBuffer(1, Math.ceil(duration * audioCtx.sampleRate), audioCtx.sampleRate);
  clockSource.buffer = silentBuffer;
  clockSource.connect(audioDestination);
  clockSource.onended = () => { if (recorder.state === 'recording') recorder.stop(); };

  await new Promise<void>((resolve) => {
    const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
    video.addEventListener('seeked', onSeeked);
    try { video.currentTime = Math.max(0, Math.min(start, video.duration || start)); } catch { resolve(); }
  });

  if (onStatus) onStatus(`Mulai merekam segmen ${Math.round(duration)}s @ ${Math.round(start)}s`);
  recorder.start();
  clockSource.start(0);
  video.play().catch(e => { console.error('Video failed to play', e); if (recorder.state === 'recording') recorder.stop(); });

  let animationFrameId = 0;
  const renderLoop = () => {
    if (video.readyState >= 2) {
      // Gambar video ke kanvas portrait (stretch sesuai sistem rekam editor)
      ctx.drawImage(video, 0, 0, width, height);
    }
    animationFrameId = requestAnimationFrame(renderLoop);
  };
  animationFrameId = requestAnimationFrame(renderLoop);

  return new Promise<{ filename: string; url: string }>((resolve, reject) => {
    recorder.onstop = async () => {
      cancelAnimationFrame(animationFrameId);
      audioCtx.close();
      try { URL.revokeObjectURL(videoUrl); } catch {}
      const blob = new Blob(chunks, { type: options.mimeType });
      const finalBlob = await ensureMp4H264Aac(blob, extension, 30);
      resolve({ filename: `short_${Math.max(1, Math.floor(start))}.mp4`, url: URL.createObjectURL(finalBlob) });
    };
    recorder.onerror = (e) => {
      cancelAnimationFrame(animationFrameId);
      audioCtx.close();
      try { URL.revokeObjectURL(videoUrl); } catch {}
      console.error('MediaRecorder error:', e);
      reject(new Error('Gagal merekam segmen'));
    };
  });
};

export const generateShorts = async (inputBlob: Blob, onProgress?: (msg: string)=>void): Promise<{ filename: string; url: string }[]> => {
  const tempUrl = URL.createObjectURL(inputBlob);
  const durationSec = await getVideoDuration(tempUrl).catch(() => 60);
  try { URL.revokeObjectURL(tempUrl); } catch {}
  const recs = computeDefaultSegments(durationSec);

  const outputs: { filename: string; url: string }[] = [];
  for (let i = 0; i < recs.length; i++) {
    const seg = recs[i];
    onProgress?.(`Merekam clip ${i+1} (${Math.round(seg.duration)}s)...`);
    try {
      const res = await recordSegmentUsingRecorder(inputBlob, seg.start, seg.duration, onProgress);
      outputs.push(res);
    } catch (e) {
      console.error('Record segment error', e);
    }
  }
  return outputs;
};
