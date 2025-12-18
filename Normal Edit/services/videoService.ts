// Canvas+MediaRecorder based video processing (augmented with FFmpeg-wasm for MP4 compatibility)
// Works broadly without COOP/COEP by using single-thread FFmpeg core

// Avoid static imports to prevent Vite optimized-deps export mismatches.
// Load FFmpeg dynamically and normalize exports for compatibility.
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
  // If FFmpeg fails to initialize, return original blob so flow continues
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
      await ff.run(
        '-i', inputName,
        '-c:v', 'copy',
        '-c:a', 'copy',
        '-movflags', '+faststart',
        outputName
      );
    } else {
      await ff.run(
        '-i', inputName,
        '-c:v', 'libx264',
        '-profile:v', 'high',
        '-level', '4.1',
        '-pix_fmt', 'yuv420p',
        '-preset', 'ultrafast',
        '-crf', '23',
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
    // Fallback to transcode if copy fails
    try {
      await ff.run(
        '-i', inputName,
        '-c:v', 'libx264',
        '-profile:v', 'high',
        '-level', '4.1',
        '-pix_fmt', 'yuv420p',
        '-preset', 'ultrafast',
        '-crf', '23',
        '-r', String(Math.max(1, fps || 30)),
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '48000',
        '-ac', '2',
        '-movflags', '+faststart',
        outputName
      );
    } catch (e2) {
      // If FFmpeg fails entirely, return original blob to avoid breaking flows
      try { ff.FS('unlink', inputName); } catch { }
      return blob;
    }
  }
  const data = ff.FS('readFile', outputName);
  try { ff.FS('unlink', inputName); } catch { }
  try { ff.FS('unlink', outputName); } catch { }
  return new Blob([data.buffer], { type: 'video/mp4' });
};

export interface VideoFile {
  url: string;
  extension: string;
}

// Initialize function - no longer needed but kept for compatibility
export const initializeFFmpeg = async (onProgress?: (message: string) => void): Promise<boolean> => {
  try {
    if (onProgress) onProgress('Menyiapkan FFmpeg...');
    await getFfmpeg();
    if (onProgress) onProgress('FFmpeg siap');
    return true;
  } catch {
    if (onProgress) onProgress('FFmpeg tidak tersedia, menggunakan hasil asli');
    return false;
  }
};

// Get video duration using HTML5 video element (supports File or URL)
export const getVideoDuration = async (videoInput: string | File): Promise<number> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const isFile = typeof videoInput !== 'string';
    const src = isFile ? URL.createObjectURL(videoInput as File) : (videoInput as string);
    video.src = src;
    video.onloadedmetadata = () => {
      if (isFile) URL.revokeObjectURL(src);
      resolve(video.duration);
    };
    video.onerror = () => {
      if (isFile) URL.revokeObjectURL(src);
      reject(new Error('Failed to load video'));
    };
  });
};

// Get audio duration using HTML5 audio element
export const getAudioDuration = async (audioUrl: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio');
    audio.src = audioUrl;
    audio.onloadedmetadata = () => {
      resolve(audio.duration);
    };
    audio.onerror = () => {
      reject(new Error('Failed to load audio'));
    };
  });
};

// Merge single video with audio using Canvas+MediaRecorder
export const mergeVideoWithAudio = async (
  videoFile: File,
  audioFile: File,
  onProgress?: (message: string) => void
): Promise<VideoFile> => {
  if (onProgress) onProgress('Initializing render engine...');

  const canvas = document.createElement('canvas');
  let width = 720;
  let height = 1280;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error("Could not get canvas context");
  try { (ctx as any).imageSmoothingEnabled = false; } catch { }
  try { (ctx as any).imageSmoothingEnabled = false; } catch { }
  try { (ctx as any).imageSmoothingEnabled = false; } catch { }
  try { (ctx as any).imageSmoothingEnabled = false; } catch { }

  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  if (onProgress) onProgress('Loading media files...');

  // Create object URLs for the files
  const videoUrl = URL.createObjectURL(videoFile);
  const audioUrl = URL.createObjectURL(audioFile);

  const [audioBuffer, video] = await Promise.all([
    audioFile.arrayBuffer().then(buf => audioCtx.decodeAudioData(buf)),
    new Promise<HTMLVideoElement>((resolve, reject) => {
      const video = document.createElement('video');
      video.src = videoUrl;
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.onloadedmetadata = () => resolve(video);
      video.onerror = (e) => reject(new Error(`Failed to load video: ${e}`));
      video.load();
    })
  ]);

  // Sesuaikan resolusi canvas ke resolusi asli video
  if (video.videoWidth && video.videoHeight) {
    width = video.videoWidth;
    height = video.videoHeight;
    canvas.width = width;
    canvas.height = height;
  }
  const audioDestination = audioCtx.createMediaStreamDestination();
  const videoStream = canvas.captureStream(60);
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

  const supportedMimeType = mimeTypesToTry.find(type => MediaRecorder.isTypeSupported(type));
  if (!supportedMimeType) {
    audioCtx.close();
    throw new Error("Your browser does not support the required video recording formats.");
  }

  const options = { mimeType: supportedMimeType, videoBitsPerSecond: (width * height >= 2000000 ? 16000000 : (width * height >= 900000 ? 8000000 : 5000000)) };
  const extension = supportedMimeType.includes('webm') ? 'webm' : 'mp4';
  const recorder = new MediaRecorder(combinedStream, options);
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  let animationFrameId: number;
  const recorderPromise = new Promise<VideoFile>((resolve, reject) => {
    recorder.onstop = async () => {
      cancelAnimationFrame(animationFrameId);
      audioCtx.close();
      // Clean up object URLs
      URL.revokeObjectURL(videoUrl);
      URL.revokeObjectURL(audioUrl);
      if (onProgress) try { (onProgress as any)(95); } catch { }
      if (onStatusUpdate) onStatusUpdate('Finalizing to MP4 (H.264/AAC)...');
      if (chunks.length === 0) {
        reject(new Error("Recording failed, resulting in an empty file."));
      } else {
        const blob = new Blob(chunks, { type: options.mimeType });
        const finalBlob = await ensureMp4H264Aac(blob, extension, 60);
        const url = URL.createObjectURL(finalBlob);
        if (onProgress) try { (onProgress as any)(100); } catch { }
        if (onStatusUpdate) onStatusUpdate('Selesai!');
        resolve({ url, extension: 'mp4' });
      }
    };
    recorder.onerror = (e) => {
      cancelAnimationFrame(animationFrameId);
      audioCtx.close();
      // Clean up object URLs
      URL.revokeObjectURL(videoUrl);
      URL.revokeObjectURL(audioUrl);
      console.error("MediaRecorder error:", e);
      reject(new Error("A fatal error occurred during video recording."));
    };
  });

  // Audio source will be the master clock
  const audioSource = audioCtx.createBufferSource();
  audioSource.buffer = audioBuffer;
  audioSource.connect(audioDestination);
  audioSource.onended = () => { if (recorder.state === 'recording') recorder.stop(); };
  let startTime = 0;
  const totalDuration = Math.max(0.001, audioBuffer.duration || 0);

  // Video rendering loop
  video.onended = () => {
    // Loop the video if audio is longer
    video.currentTime = 0;
    video.play().catch(console.error);
  };

  let started = false;
  video.currentTime = 0;
  video.onplaying = () => {
    if (!started) {
      startTime = audioCtx.currentTime;
      try { recorder.start(); } catch { }
      try { audioSource.start(0); } catch { }
      started = true;
    }
  };
  video.play().catch(e => { console.error('Video failed to play', e); if (recorder.state === 'recording') recorder.stop(); });

  // Text overlay renderer for editor feature
  const drawTextOverlay = (ctx2: CanvasRenderingContext2D) => {
    if (!textOverlay?.text || !textOverlay.text.trim()) return;
    const fontSize = Math.max(10, textOverlay.fontSize || 36);
    const fontFamily = textOverlay.fontFamily || 'Arial';
    ctx2.font = `${fontSize}px ${fontFamily}`;
    const fill = textOverlay.fontColor || '#ffffff';
    const outline = textOverlay.outlineColor || 'rgba(0,0,0,0.8)';
    const lw = Math.max(0, textOverlay.outlineWidth || 5);
    ctx2.fillStyle = fill;
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'bottom';
    let x = width / 2 + (textOverlay.xOffset || 0);
    let y = height - (textOverlay.yOffset || 40);
    const pos = textOverlay.position || 'bottom';
    if (pos === 'center') { y = height / 2; ctx2.textBaseline = 'middle'; }
    if (pos === 'top-left' || pos === 'top-right') { y = (textOverlay.yOffset || 40); ctx2.textBaseline = 'top'; }
    if (pos.includes('left')) { x = (textOverlay.xOffset || 40); ctx2.textAlign = 'left'; }
    if (pos.includes('right')) { x = width - (textOverlay.xOffset || 40); ctx2.textAlign = 'right'; }
    if (lw > 0) { ctx2.lineWidth = lw; ctx2.strokeStyle = outline; try { ctx2.strokeText(textOverlay.text, x, y); } catch { } }
    try { ctx2.fillText(textOverlay.text, x, y); } catch { }
  };

  // Watermark renderer for editor feature
  const drawWatermarkLocal = (ctx2: CanvasRenderingContext2D) => {
    if (!watermark?.enabled) return;
    const pad = 16;
    let x = pad;
    let y = pad;
    const pos = watermark.position || 'bottom-right';
    switch (pos) {
      case 'top-left': x = pad; y = pad; break;
      case 'top-right': x = width - pad; y = pad; break;
      case 'bottom-left': x = pad; y = height - pad; break;
      case 'bottom-right': x = width - pad; y = height - pad; break;
      case 'center': x = width / 2; y = height / 2; break;
    }
    x += watermark.xOffset || 0;
    y += watermark.yOffset || 0;

    if (wmImage) {
      const scale = Math.max(0.1, Math.min(1, watermark.imageScale || 0.3));
      const imgW = wmImage.width * scale;
      const imgH = wmImage.height * scale;
      let drawX = x;
      let drawY = y;
      if (pos.includes('right')) drawX -= imgW;
      if (pos.includes('bottom')) drawY -= imgH;
      if (pos === 'center') { drawX -= imgW / 2; drawY -= imgH / 2; }
      ctx2.save();
      ctx2.globalAlpha = Math.max(0, Math.min(1, watermark.imageOpacity ?? 0.6));
      ctx2.drawImage(wmImage, drawX, drawY, imgW, imgH);
      ctx2.restore();
    }

    if (watermark.text && watermark.text.trim()) {
      const fontSize = Math.max(10, watermark.fontSize || 28);
      const fontFamily = watermark.fontFamily || 'Arial';
      ctx2.font = `${fontSize}px ${fontFamily}`;
      ctx2.textBaseline = pos.includes('top') ? 'top' : pos.includes('bottom') ? 'bottom' : 'middle';
      ctx2.textAlign = pos.includes('right') ? 'right' : pos.includes('left') ? 'left' : 'center';
      const fill = watermark.fontColor || '#ffffff';
      const outline = watermark.outlineColor || 'rgba(0,0,0,0.6)';
      const lw = Math.max(0, watermark.outlineWidth || 3);
      if (lw > 0) { ctx2.lineWidth = lw; ctx2.strokeStyle = outline; try { ctx2.strokeText(watermark.text, x, y); } catch { } }
      ctx2.fillStyle = fill; try { ctx2.fillText(watermark.text, x, y); } catch { }
    }
  };

  const renderLoop = () => {
    if (video.readyState >= 2) {
      ctx.drawImage(video, 0, 0, width, height);
    }
    animationFrameId = requestAnimationFrame(renderLoop);
  };

  if (onProgress) onProgress('Rendering video...');
  animationFrameId = requestAnimationFrame(renderLoop);

  return recorderPromise;
};

// Merge multiple videos with audio using Canvas+MediaRecorder
export const mergeMultipleVideosWithAudio = async (
  videoFiles: File[],
  audio?: File | string,
  onProgress?: (progressPercent: number) => void,
  onStatusUpdate?: (status: string) => void
): Promise<string> => {
  if (onStatusUpdate) onStatusUpdate('Initializing render engine...');

  const canvas = document.createElement('canvas');
  let width = 720;
  let height = 1280;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error("Could not get canvas context");

  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  if (onStatusUpdate) onStatusUpdate('Loading media assets...');

  const tempVideoUrls: string[] = [];
  const [audioBuffer, videos] = await Promise.all([
    (audio
      ? ((typeof audio === 'string'
        ? fetch(audio).then(res => res.arrayBuffer())
        : (audio as File).arrayBuffer()
      ).then(buf => audioCtx.decodeAudioData(buf)))
      : Promise.resolve(null as unknown as AudioBuffer)
    ),
    Promise.all(videoFiles.map(file => new Promise<HTMLVideoElement>((resolve, reject) => {
      const video = document.createElement('video');
      const videoUrl = URL.createObjectURL(file);
      tempVideoUrls.push(videoUrl);
      video.src = videoUrl;
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.onloadedmetadata = () => resolve(video);
      video.onerror = (e) => {
        reject(new Error(`Failed to load video. Please try again. ${e}`));
      };
      video.load();
    })))
  ]);

  // Sesuaikan resolusi canvas ke resolusi terbesar dari sumber video
  const targetW = Math.max(...videos.map(v => v.videoWidth || width));
  const targetH = Math.max(...videos.map(v => v.videoHeight || height));
  width = targetW; height = targetH; canvas.width = width; canvas.height = height;

  const audioDestination = audioCtx.createMediaStreamDestination();
  const videoStream = canvas.captureStream(60);
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

  const supportedMimeType = mimeTypesToTry.find(type => MediaRecorder.isTypeSupported(type));
  if (!supportedMimeType) {
    audioCtx.close();
    throw new Error("Your browser does not support the required video recording formats.");
  }

  const options = { mimeType: supportedMimeType, videoBitsPerSecond: (width * height >= 2000000 ? 16000000 : (width * height >= 900000 ? 8000000 : 5000000)) };
  const extension = supportedMimeType.includes('webm') ? 'webm' : 'mp4';
  const recorder = new MediaRecorder(combinedStream, options);
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  let animationFrameId: number;
  const recorderPromise = new Promise<VideoFile>((resolve, reject) => {
    recorder.onstop = async () => {
      cancelAnimationFrame(animationFrameId);
      audioCtx.close();
      // Cleanup temporary video object URLs
      tempVideoUrls.forEach(url => {
        try { URL.revokeObjectURL(url); } catch { }
      });
      if (wmImgUrl) {
        try { URL.revokeObjectURL(wmImgUrl); } catch { }
      }
      if (onProgress) onProgress(95);
      if (onStatusUpdate) onStatusUpdate('Finalizing to MP4 (H.264/AAC)...');
      if (chunks.length === 0) {
        reject(new Error('Recording failed, resulting in an empty file.'));
      } else {
        const blob = new Blob(chunks, { type: options.mimeType });
        const finalBlob = await ensureMp4H264Aac(blob, extension, 60);
        const url = URL.createObjectURL(finalBlob);
        if (onProgress) onProgress(100);
        if (onStatusUpdate) onStatusUpdate('Selesai!');
        resolve({ url, extension: 'mp4' });
      }
    };
    recorder.onerror = (e) => {
      cancelAnimationFrame(animationFrameId);
      audioCtx.close();
      // Cleanup temporary video object URLs
      tempVideoUrls.forEach(url => {
        try { URL.revokeObjectURL(url); } catch { }
      });
      console.error("MediaRecorder error:", e);
      reject(new Error("A fatal error occurred during video recording."));
    };
  });

  // Start recorder
  let started = false;
  let startTime = 0;
  let totalDuration = 0;
  let osc: OscillatorNode | null = null;
  let gain: GainNode | null = null;
  let segmentEnd = 0;
  if (audioBuffer && audioBuffer.duration && audioBuffer.duration > 0.001) {
    totalDuration = audioBuffer.duration;
  } else {
    try {
      osc = audioCtx.createOscillator();
      gain = audioCtx.createGain();
      osc.frequency.value = 0;
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(audioDestination);
      totalDuration = videos.reduce((sum, v) => sum + (v.duration || 0), 0);
      recorder.addEventListener('stop', () => { try { osc && osc.stop(); } catch { } });
    } catch { }
  }
  // Ensure totalDuration is at least something to avoid division by zero or immediate stop
  totalDuration = Math.max(0.1, totalDuration);

  let currentVideoIndex = 0;
  let preloadedNextIndex = -1;
  const hasExternalAudio = !!(audioBuffer && audioBuffer.duration && audioBuffer.duration > 0.001);
  // const segmentDuration = hasExternalAudio ? Math.max(0.1, totalDuration / Math.max(1, videos.length)) : 0;
  const playNextVideo = () => {
    if (currentVideoIndex >= videos.length) {
      // Loop back to the first video to match audio duration
      currentVideoIndex = 0;
    }

    const video = videos[currentVideoIndex];
    video.onplaying = () => {
      if (!started) {
        startTime = audioCtx.currentTime;
        try { recorder.start(); } catch { }
        if (audioBuffer && audioBuffer.duration && audioBuffer.duration > 0.001) {
          try {
            const audioSource = audioCtx.createBufferSource();
            audioSource.buffer = audioBuffer;
            audioSource.connect(audioDestination);
            audioSource.onended = () => { if (recorder.state === 'recording') recorder.stop(); };
            audioSource.start(0);
          } catch { }
        } else {
          try { osc && osc.start(); } catch { }
        }
        started = true;
      }
      // if (hasExternalAudio) {
      //   segmentEnd = audioCtx.currentTime + segmentDuration;
      // } else {
      //   segmentEnd = audioCtx.currentTime + Math.max(0.1, video.duration || 0);
      // }
    };
    video.onended = () => {
      currentVideoIndex++;
      const sceneNumber = (currentVideoIndex % videos.length) + 1;
      if (onStatusUpdate) onStatusUpdate(`Rendering scene ${sceneNumber}/${videos.length}...`);
      playNextVideo();
    };

    video.currentTime = 0;
    video.onplaying = () => {
      if (!started) {
        startTime = audioCtx.currentTime;
        try { recorder.start(); } catch { }
        if (audioBuffer && audioBuffer.duration && audioBuffer.duration > 0.001) {
          try {
            const audioSource = audioCtx.createBufferSource();
            audioSource.buffer = audioBuffer;
            audioSource.connect(audioDestination);
            audioSource.onended = () => { if (recorder.state === 'recording') recorder.stop(); };
            audioSource.start(0);
          } catch { }
        } else {
          try { osc && osc.start(); } catch { }
        }
        started = true;
      }
      try { video.muted = false; } catch { }
      // if (hasExternalAudio) { segmentEnd = audioCtx.currentTime + segmentDuration; }
    };
    video.play().catch(e => {
      console.error(`Video ${currentVideoIndex} failed to play`, e);
      if (recorder.state === 'recording') recorder.stop();
    });
  };

  const renderLoop = () => {
    let switched = false;
    const videoToDraw = videos[currentVideoIndex] || videos[videos.length - 1];
    if (videoToDraw) {
      if (hasExternalAudio) {
        // const segElapsed = (audioCtx.currentTime - startTime) - (segmentDuration * currentVideoIndex);
        // if (segElapsed > Math.max(0.01, segmentDuration - 0.25)) {
        //   const nextIndex = (currentVideoIndex + 1) % videos.length;
        //   if (preloadedNextIndex !== nextIndex) {
        //     const nextVideo = videos[nextIndex];
        //     try { nextVideo.muted = true; nextVideo.currentTime = 0; nextVideo.play().catch(() => {}); preloadedNextIndex = nextIndex; } catch {}
        //   }
        // }
      } else {
        const remaining = (videoToDraw.duration || 0) - (videoToDraw.currentTime || 0);
        if (remaining < 0.25) {
          const nextIndex = (currentVideoIndex + 1) % videos.length;
          if (preloadedNextIndex !== nextIndex) {
            const nextVideo = videos[nextIndex];
            try { nextVideo.pause(); nextVideo.currentTime = 0; nextVideo.load(); preloadedNextIndex = nextIndex; } catch { }
          }
        }
      }
      const vw = videoToDraw.videoWidth || width;
      const vh = videoToDraw.videoHeight || height;
      const sc = Math.min(width / vw, height / vh);
      const dw = Math.max(1, Math.round(vw * sc));
      const dh = Math.max(1, Math.round(vh * sc));
      const dx = Math.round((width - dw) / 2);
      const dy = Math.round((height - dh) / 2);
      if (videoToDraw.readyState >= 2) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(videoToDraw, dx, dy, dw, dh);
      } else {
        const fb = videos[(currentVideoIndex - 1 + videos.length) % videos.length];
        if (fb && fb.readyState >= 2) {
          const fvw = fb.videoWidth || width;
          const fvh = fb.videoHeight || height;
          const fsc = Math.min(width / fvw, height / fvh);
          const fdw = Math.max(1, Math.round(fvw * fsc));
          const fdh = Math.max(1, Math.round(fvh * fsc));
          const fdx = Math.round((width - fdw) / 2);
          const fdy = Math.round((height - fdh) / 2);
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(fb, fdx, fdy, fdw, fdh);
        }
      }
      // if (hasExternalAudio && audioCtx.currentTime >= segmentEnd) {
      //   currentVideoIndex++;
      //   const sceneNumber = (currentVideoIndex % videos.length) + 1;
      //   if (onStatusUpdate) onStatusUpdate(`Rendering scene ${sceneNumber}/${videos.length}...`);
      //   playNextVideo();
      //   switched = true;
      // }
    }
    if (onProgress && totalDuration > 0) {
      const now = performance.now();
      if (!(renderLoop as any)._lastProgTs || now - (renderLoop as any)._lastProgTs > 120) {
        (renderLoop as any)._lastProgTs = now;
        const elapsed = audioCtx.currentTime - startTime;
        const pct = Math.max(0, Math.min(95, Math.round((elapsed / totalDuration) * 95)));
        try { onProgress(pct); } catch { }
      }
    }
    try {
      const elapsed = audioCtx.currentTime - startTime;
      if (hasExternalAudio) {
        if (elapsed >= Math.max(0.001, totalDuration - 0.1) && recorder.state === 'recording') {
          recorder.stop();
        }
      } else {
        if (elapsed >= totalDuration + 1.0 && recorder.state === 'recording') {
          recorder.stop();
        }
      }
    } catch { }
    const v = videos[currentVideoIndex];
    if (!switched && v && (v as any).requestVideoFrameCallback) {
      try { (v as any).requestVideoFrameCallback(() => renderLoop()); } catch { animationFrameId = requestAnimationFrame(renderLoop); }
    } else {
      animationFrameId = requestAnimationFrame(renderLoop);
    }
  };

  if (onStatusUpdate) onStatusUpdate(`Rendering scene 1/${videos.length}...`);
  playNextVideo();
  // If no external audio, stop recorder after completing all videos once
  if (!hasExternalAudio) {
    videos[videos.length - 1].addEventListener('ended', () => {
      setTimeout(() => {
        if (recorder.state === 'recording') {
          try { recorder.stop(); } catch { }
        }
      }, 100); // small buffer to capture last frame
    });
  }
  const vStart = videos[0];
  if (vStart && (vStart as any).requestVideoFrameCallback) {
    try { (vStart as any).requestVideoFrameCallback(() => renderLoop()); } catch { animationFrameId = requestAnimationFrame(renderLoop); }
  } else {
    animationFrameId = requestAnimationFrame(renderLoop);
  }

  const result = await recorderPromise;
  return result.url;
};

// Merge multiple videos with audio and KEEP original video audio mixed with narration
export const mergeMultipleVideosWithAudioMixOriginal = async (
  videoFiles: File[],
  audio?: File | string,
  onProgress?: (progressPercent: number) => void,
  onStatusUpdate?: (status: string) => void
): Promise<string> => {
  if (onStatusUpdate) onStatusUpdate('Initializing render engine...');

  const canvas = document.createElement('canvas');
  let width = 720;
  let height = 1280;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not get canvas context');
  try { (ctx as any).imageSmoothingEnabled = false; } catch { }
  try { (ctx as any).imageSmoothingEnabled = false; } catch { }
  try { (ctx as any).imageSmoothingEnabled = false; } catch { }

  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  if (onStatusUpdate) onStatusUpdate('Loading media assets...');

  const tempVideoUrls: string[] = [];
  const elementAudioSources: MediaElementAudioSourceNode[] = [];
  const elementGains: GainNode[] = [];
  const [audioBuffer, videos] = await Promise.all([
    (audio
      ? ((typeof audio === 'string'
        ? fetch(audio).then(res => res.arrayBuffer())
        : (audio as File).arrayBuffer()
      ).then(buf => audioCtx.decodeAudioData(buf)))
      : Promise.resolve(null as unknown as AudioBuffer)
    ),
    Promise.all(
      videoFiles.map(file => new Promise<HTMLVideoElement>((resolve, reject) => {
        const video = document.createElement('video');
        const videoUrl = URL.createObjectURL(file);
        tempVideoUrls.push(videoUrl);
        video.src = videoUrl;
        // start muted to satisfy autoplay, unmute onplaying
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.onloadedmetadata = () => resolve(video);
        video.onerror = (e) => reject(new Error(`Failed to load video. Please try again. ${e}`));
        video.load();
      }))
    )
  ]);

  // Match canvas to largest source resolution
  const targetW = Math.max(...videos.map(v => v.videoWidth || width));
  const targetH = Math.max(...videos.map(v => v.videoHeight || height));
  width = targetW; height = targetH; canvas.width = width; canvas.height = height;

  const audioDestination = audioCtx.createMediaStreamDestination();
  const videoStream = canvas.captureStream(60); // 60 FPS
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
  const supportedMimeType = mimeTypesToTry.find(type => MediaRecorder.isTypeSupported(type));
  if (!supportedMimeType) {
    audioCtx.close();
    throw new Error('Your browser does not support the required video recording formats.');
  }
  const options = { mimeType: supportedMimeType, videoBitsPerSecond: (width * height >= 2000000 ? 16000000 : (width * height >= 900000 ? 8000000 : 5000000)) };
  const extension = supportedMimeType.includes('webm') ? 'webm' : 'mp4';
  const recorder = new MediaRecorder(combinedStream, options);
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  let animationFrameId: number;
  const recorderPromise = new Promise<VideoFile>((resolve, reject) => {
    recorder.onstop = async () => {
      cancelAnimationFrame(animationFrameId);
      audioCtx.close();
      tempVideoUrls.forEach(url => { try { URL.revokeObjectURL(url); } catch { } });
      // disconnect element audio sources
      elementAudioSources.forEach(src => { try { src.disconnect(); } catch { } });
      elementGains.forEach(g => { try { g.disconnect(); } catch { } });
      if (onProgress) onProgress(95);
      if (onStatusUpdate) onStatusUpdate('Finalizing to MP4 (H.264/AAC)...');
      if (chunks.length === 0) {
        reject(new Error('Recording failed, resulting in an empty file.'));
      } else {
        const blob = new Blob(chunks, { type: options.mimeType });
        const finalBlob = await ensureMp4H264Aac(blob, extension, 60);
        const url = URL.createObjectURL(finalBlob);
        if (onProgress) onProgress(100);
        if (onStatusUpdate) onStatusUpdate('Selesai!');
        resolve({ url, extension: 'mp4' });
      }
    };
    recorder.onerror = (e) => {
      cancelAnimationFrame(animationFrameId);
      audioCtx.close();
      tempVideoUrls.forEach(url => { try { URL.revokeObjectURL(url); } catch { } });
      elementAudioSources.forEach(src => { try { src.disconnect(); } catch { } });
      elementGains.forEach(g => { try { g.disconnect(); } catch { } });
      console.error('MediaRecorder error:', e);
      reject(new Error('A fatal error occurred during video recording.'));
    };
  });

  // mix original video audio into destination
  videos.forEach(v => {
    try {
      const src = audioCtx.createMediaElementSource(v);
      const gain = audioCtx.createGain();
      gain.gain.value = 0;
      src.connect(gain);
      gain.connect(audioDestination);
      elementAudioSources.push(src);
      elementGains.push(gain);
    } catch (e) {
      console.warn('Failed to route original audio from a video element', e);
    }
  });

  // Start recorder
  recorder.start();
  const startTime = audioCtx.currentTime;
  let totalDuration = audioBuffer && audioBuffer.duration ? Math.max(0.001, audioBuffer.duration) : Math.max(0.001, videos.reduce((sum, v) => sum + (v.duration || 0), 0));
  if (audioBuffer && audioBuffer.duration) {
    const audioSource = audioCtx.createBufferSource();
    audioSource.buffer = audioBuffer;
    audioSource.connect(audioDestination);
    audioSource.onended = () => { if (recorder.state === 'recording') recorder.stop(); };
    try { audioSource.start(0); } catch { }
  } else {
    // No external audio: still ensure audio track exists via silent gain on element sources
    try {
      const osc = audioCtx.createOscillator();
      const gainSilent = audioCtx.createGain();
      gainSilent.gain.value = 0;
      osc.connect(gainSilent);
      gainSilent.connect(audioDestination);
      try { osc.start(); } catch { }
      recorder.addEventListener('stop', () => { try { osc.stop(); } catch { } });
    } catch { }
  }
  totalDuration = Math.max(0.1, totalDuration);

  let currentVideoIndex = 0;
  let preloadedNextIndex = -1;
  const CROSSFADE = 0.12;
  let segmentEnd = 0;
  const hasExternalAudio = !!(audioBuffer && audioBuffer.duration);
  // const segmentDuration = hasExternalAudio ? Math.max(0.1, (audioBuffer!.duration) / Math.max(1, videos.length)) : 0;
  const playNextVideo = () => {
    if (currentVideoIndex >= videos.length) currentVideoIndex = 0;
    const video = videos[currentVideoIndex];
    try {
      const t = audioCtx.currentTime;
      elementGains.forEach((g, i) => {
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        if (i === currentVideoIndex) {
          g.gain.linearRampToValueAtTime(1, t + CROSSFADE);
        } else {
          g.gain.linearRampToValueAtTime(0, t + CROSSFADE);
        }
      });
    } catch { }
    video.onended = () => {
      currentVideoIndex++;
      const sceneNumber = (currentVideoIndex % videos.length) + 1;
      if (onStatusUpdate) onStatusUpdate(`Rendering scene ${sceneNumber}/${videos.length}...`);
      playNextVideo();
    };
    video.currentTime = 0;
    video.onplaying = () => { try { video.muted = false; } catch { } };
    video.play().catch(e => {
      console.error(`Video ${currentVideoIndex} failed to play`, e);
      if (recorder.state === 'recording') recorder.stop();
    });
  };

  const renderLoop = () => {
    let switched = false;
    const videoToDraw = videos[currentVideoIndex] || videos[videos.length - 1];
    if (videoToDraw) {
      if (hasExternalAudio) {
        // const segElapsed = (audioCtx.currentTime - startTime) - (segmentDuration * currentVideoIndex);
        // if (segElapsed > Math.max(0.01, segmentDuration - 0.25)) {
        //   const nextIndex = (currentVideoIndex + 1) % videos.length;
        //   if (preloadedNextIndex !== nextIndex) {
        //     const nextVideo = videos[nextIndex];
        //     try { nextVideo.muted = true; nextVideo.currentTime = 0; nextVideo.play().catch(() => {}); preloadedNextIndex = nextIndex; } catch {}
        //   }
        // }
      } else {
        const remaining = (videoToDraw.duration || 0) - (videoToDraw.currentTime || 0);
        if (remaining < 0.25) {
          const nextIndex = (currentVideoIndex + 1) % videos.length;
          if (preloadedNextIndex !== nextIndex) {
            const nextVideo = videos[nextIndex];
            try {
              nextVideo.pause();
              nextVideo.currentTime = 0;
              nextVideo.load();
              preloadedNextIndex = nextIndex;
            } catch { }
          }
        }
      }
      const vw = videoToDraw.videoWidth || width;
      const vh = videoToDraw.videoHeight || height;
      const sc = Math.min(width / vw, height / vh);
      const dw = Math.max(1, Math.round(vw * sc));
      const dh = Math.max(1, Math.round(vh * sc));
      const dx = Math.round((width - dw) / 2);
      const dy = Math.round((height - dh) / 2);
      if (videoToDraw.readyState >= 2) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(videoToDraw, dx, dy, dw, dh);
      } else {
        const fb = videos[(currentVideoIndex - 1 + videos.length) % videos.length];
        if (fb && fb.readyState >= 2) {
          const fvw = fb.videoWidth || width;
          const fvh = fb.videoHeight || height;
          const fsc = Math.min(width / fvw, height / fvh);
          const fdw = Math.max(1, Math.round(fvw * fsc));
          const fdh = Math.max(1, Math.round(fvh * fsc));
          const fdx = Math.round((width - fdw) / 2);
          const fdy = Math.round((height - fdh) / 2);
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(fb, fdx, fdy, fdw, fdh);
        }
      }
      // if (hasExternalAudio && audioCtx.currentTime - startTime >= segmentDuration * (currentVideoIndex + 1)) {
      //   currentVideoIndex++;
      //   const sceneNumber = (currentVideoIndex % videos.length) + 1;
      //   if (onStatusUpdate) onStatusUpdate(`Rendering scene ${sceneNumber}/${videos.length}...`);
      //   playNextVideo();
      //   switched = true;
      // }
    }
    if (onProgress) {
      const now = performance.now();
      if (!(renderLoop as any)._lastProgTs || now - (renderLoop as any)._lastProgTs > 120) {
        (renderLoop as any)._lastProgTs = now;
        const elapsed = audioCtx.currentTime - startTime;
        const pct = Math.max(0, Math.min(95, Math.round((elapsed / totalDuration) * 95)));
        try { onProgress(pct); } catch { }
      }
    }
    try {
      const elapsed = audioCtx.currentTime - startTime;
      if (hasExternalAudio) {
        if (elapsed >= Math.max(0.001, totalDuration - 0.1) && recorder.state === 'recording') {
          recorder.stop();
        }
      } else {
        if (elapsed >= totalDuration + 1.0 && recorder.state === 'recording') {
          recorder.stop();
        }
      }
    } catch { }
    const v = videos[currentVideoIndex];
    if (!switched && v && (v as any).requestVideoFrameCallback) {
      try { (v as any).requestVideoFrameCallback(() => renderLoop()); } catch { animationFrameId = requestAnimationFrame(renderLoop); }
    } else {
      animationFrameId = requestAnimationFrame(renderLoop);
    }
  };

  if (onStatusUpdate) onStatusUpdate(`Rendering scene 1/${videos.length}...`);
  playNextVideo();
  const vStart = videos[0];
  if (vStart && (vStart as any).requestVideoFrameCallback) {
    try { (vStart as any).requestVideoFrameCallback(() => renderLoop()); } catch { animationFrameId = requestAnimationFrame(renderLoop); }
  } else {
    animationFrameId = requestAnimationFrame(renderLoop);
  }
  if (!hasExternalAudio) {
    videos[videos.length - 1].addEventListener('ended', () => {
      setTimeout(() => {
        if (recorder.state === 'recording') try { recorder.stop(); } catch { }
      }, 100);
    });
  }
  const result = await recorderPromise;
  return result.url;
};

// Watermark options for text and image overlays
export interface WatermarkOptions {
  enabled?: boolean;
  // Text watermark
  text?: string;
  fontFamily?: string; // e.g. 'Arial', 'Inter', 'Poppins'
  fontSize?: number; // px
  fontColor?: string; // CSS color, e.g. '#ffffff'
  outlineColor?: string; // CSS color
  outlineWidth?: number; // px
  // Positioning
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  xOffset?: number; // px
  yOffset?: number; // px
  // Image watermark
  imageFile?: File; // optional image overlay
  imageOpacity?: number; // 0..1
  imageScale?: number; // relative scale (0.1..1)
}

// Merge multiple videos with audio and apply optional watermark overlays (Canvas-based)
export const mergeMultipleVideosWithAudioWithWatermark = async (
  videoFiles: File[],
  audio: File | string,
  watermark: WatermarkOptions,
  onProgress?: (progressPercent: number) => void,
  onStatusUpdate?: (status: string) => void
): Promise<string> => {
  const wmEnabled = !!watermark?.enabled && (
    !!watermark?.text || !!watermark?.imageFile
  );

  if (onStatusUpdate) onStatusUpdate('Initializing render engine...');
  const canvas = document.createElement('canvas');
  let width = 720;
  let height = 1280;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not get canvas context');

  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  if (onStatusUpdate) onStatusUpdate('Loading media assets...');

  const tempVideoUrls: string[] = [];
  const [audioBuffer, videos] = await Promise.all([
    (typeof audio === 'string'
      ? fetch(audio).then(res => res.arrayBuffer())
      : (audio as File).arrayBuffer()
    ).then(buf => audioCtx.decodeAudioData(buf)),
    Promise.all(
      videoFiles.map(
        file =>
          new Promise<HTMLVideoElement>((resolve, reject) => {
            const video = document.createElement('video');
            const videoUrl = URL.createObjectURL(file);
            tempVideoUrls.push(videoUrl);
            video.src = videoUrl;
            video.muted = true;
            video.playsInline = true;
            video.preload = 'auto';
            video.onloadedmetadata = () => resolve(video);
            video.onerror = e => reject(new Error(`Failed to load video. Please try again. ${e}`));
            video.load();
          })
      )
    )
  ]);

  // Prepare optional image watermark
  let wmImage: HTMLImageElement | null = null;
  let wmImgUrl: string | null = null;
  if (wmEnabled && watermark?.imageFile) {
    wmImgUrl = URL.createObjectURL(watermark.imageFile);
    wmImage = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = e => reject(new Error(`Failed to load watermark image: ${e}`));
      img.src = wmImgUrl!;
    });
  }

  // Sesuaikan resolusi canvas ke resolusi terbesar dari sumber video
  const targetW = Math.max(...videos.map(v => v.videoWidth || width));
  const targetH = Math.max(...videos.map(v => v.videoHeight || height));
  width = targetW; height = targetH; canvas.width = width; canvas.height = height;

  const audioDestination = audioCtx.createMediaStreamDestination();
  const videoStream = canvas.captureStream(60);
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
  const supportedMimeType = mimeTypesToTry.find(type => MediaRecorder.isTypeSupported(type));
  if (!supportedMimeType) {
    audioCtx.close();
    throw new Error('Your browser does not support the required video recording formats.');
  }
  const extension = supportedMimeType.includes('webm') ? 'webm' : 'mp4';
  const options = { mimeType: supportedMimeType, videoBitsPerSecond: (width * height >= 2000000 ? 16000000 : (width * height >= 900000 ? 8000000 : 5000000)) };
  const recorder = new MediaRecorder(combinedStream, options);
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  let animationFrameId: number;
  const recorderPromise = new Promise<VideoFile>((resolve, reject) => {
    recorder.onstop = async () => {
      cancelAnimationFrame(animationFrameId);
      audioCtx.close();
      // Cleanup temporary video object URLs
      tempVideoUrls.forEach(url => {
        try { URL.revokeObjectURL(url); } catch { }
      });
      if (wmImgUrl) {
        try { URL.revokeObjectURL(wmImgUrl); } catch { }
      }
      if (chunks.length === 0) {
        reject(new Error('Recording failed, resulting in an empty file.'));
      } else {
        const blob = new Blob(chunks, { type: options.mimeType });
        if (onProgress) onProgress(95);
        if (onStatusUpdate) onStatusUpdate('Finalizing to MP4 (H.264/AAC)...');
        const finalBlob = await ensureMp4H264Aac(blob, extension, 60);
        const url = URL.createObjectURL(finalBlob);
        if (onProgress) onProgress(100);
        if (onStatusUpdate) onStatusUpdate('Selesai!');
        resolve({ url, extension: 'mp4' });
      }
    };
    recorder.onerror = (e) => {
      cancelAnimationFrame(animationFrameId);
      audioCtx.close();
      // Cleanup temporary video object URLs
      tempVideoUrls.forEach(url => {
        try { URL.revokeObjectURL(url); } catch { }
      });
      console.error("MediaRecorder error:", e);
      reject(new Error("A fatal error occurred during video recording."));
    };
  });

  const audioSource = audioCtx.createBufferSource();
  audioSource.buffer = audioBuffer;
  audioSource.connect(audioDestination);
  audioSource.onended = () => { if (recorder.state === 'recording') recorder.stop(); };
  let startTime = 0;
  const totalDuration = Math.max(0.001, audioBuffer.duration || 0);

  let currentVideoIndex = 0;
  let started = false;
  let preloadedNextIndex = -1;
  let segmentEnd = 0;
  // const segmentDuration = Math.max(0.1, totalDuration / Math.max(1, videos.length));
  const playNextVideo = () => {
    if (currentVideoIndex >= videos.length) {
      currentVideoIndex = 0;
    }
    const video = videos[currentVideoIndex];
    video.onended = () => {
      currentVideoIndex++;
      const sceneNumber = (currentVideoIndex % videos.length) + 1;
      if (onStatusUpdate) onStatusUpdate(`Rendering scene ${sceneNumber}/${videos.length}...`);
      playNextVideo();
    };
    video.currentTime = 0;
    video.onplaying = () => {
      if (!started) {
        startTime = audioCtx.currentTime;
        try { recorder.start(); } catch { }
        try { audioSource.start(0); } catch { }
        started = true;
      }
      // segmentEnd = audioCtx.currentTime + segmentDuration;
    };
    video.play().catch(e => { console.error(`Video ${currentVideoIndex} failed to play`, e); if (recorder.state === 'recording') recorder.stop(); });
  };

  const drawWatermark = (ctx: CanvasRenderingContext2D) => {
    if (!wmEnabled) return;
    // Determine anchor
    const pad = 16;
    let x = pad;
    let y = pad;
    switch (watermark.position || 'bottom-right') {
      case 'top-left':
        x = pad; y = pad; break;
      case 'top-right':
        x = width - pad; y = pad; break;
      case 'bottom-left':
        x = pad; y = height - pad; break;
      case 'bottom-right':
        x = width - pad; y = height - pad; break;
      case 'center':
        x = width / 2; y = height / 2; break;
    }
    x += watermark.xOffset || 0;
    y += watermark.yOffset || 0;

    // Draw image watermark first if present
    if (wmImage) {
      const scale = Math.max(0.1, Math.min(1, watermark.imageScale || 0.3));
      const imgW = wmImage.width * scale;
      const imgH = wmImage.height * scale;
      let drawX = x;
      let drawY = y;
      // Adjust for right/top anchors
      const pos = watermark.position || 'bottom-right';
      if (pos.includes('right')) drawX -= imgW;
      if (pos.includes('bottom')) drawY -= imgH;
      if (pos === 'center') { drawX -= imgW / 2; drawY -= imgH / 2; }
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, watermark.imageOpacity ?? 0.6));
      ctx.drawImage(wmImage, drawX, drawY, imgW, imgH);
      ctx.restore();
    }

    // Draw text watermark
    if (watermark.text && watermark.text.trim()) {
      const fontSize = Math.max(10, watermark.fontSize || 28);
      const fontFamily = watermark.fontFamily || 'Arial';
      ctx.font = `${fontSize}px ${fontFamily}`;
      ctx.textBaseline = 'bottom';
      ctx.textAlign = (
        (watermark.position || 'bottom-right').includes('right') ? 'right' :
          (watermark.position || 'bottom-right').includes('left') ? 'left' : 'center'
      );
      const fill = watermark.fontColor || '#ffffff';
      const outline = watermark.outlineColor || 'rgba(0,0,0,0.6)';
      const lw = Math.max(0, watermark.outlineWidth || 3);
      if (lw > 0) {
        ctx.lineWidth = lw;
        ctx.strokeStyle = outline;
        ctx.strokeText(watermark.text, x, y);
      }
      ctx.fillStyle = fill;
      ctx.fillText(watermark.text, x, y);
    }
  };

  const renderLoop = () => {
    let switched = false;
    const videoToDraw = videos[currentVideoIndex] || videos[videos.length - 1];
    if (videoToDraw) {
      const remaining = (videoToDraw.duration || 0) - (videoToDraw.currentTime || 0);
      if (remaining < 0.25) {
        const nextIndex = (currentVideoIndex + 1) % videos.length;
        if (preloadedNextIndex !== nextIndex) {
          const nextVideo = videos[nextIndex];
          try { nextVideo.currentTime = 0; nextVideo.play().catch(() => { }); preloadedNextIndex = nextIndex; } catch { }
        }
      }
      const vw = videoToDraw.videoWidth || width;
      const vh = videoToDraw.videoHeight || height;
      const sc = Math.min(width / vw, height / vh);
      const dw = Math.max(1, Math.round(vw * sc));
      const dh = Math.max(1, Math.round(vh * sc));
      const dx = Math.round((width - dw) / 2);
      const dy = Math.round((height - dh) / 2);
      if (videoToDraw.readyState >= 2) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(videoToDraw, dx, dy, dw, dh);
        drawWatermark(ctx);
      }
      // if (audioCtx.currentTime >= segmentEnd) {
      //   currentVideoIndex++;
      //   const sceneNumber = (currentVideoIndex % videos.length) + 1;
      //   if (onStatusUpdate) onStatusUpdate(`Rendering scene ${sceneNumber}/${videos.length}...`);
      //   playNextVideo();
      //   switched = true;
      // }
    }
    if (onProgress) {
      const now = performance.now();
      if (!(renderLoop as any)._lastProgTs || now - (renderLoop as any)._lastProgTs > 120) {
        (renderLoop as any)._lastProgTs = now;
        const elapsed = audioCtx.currentTime - startTime;
        const pct = Math.max(0, Math.min(95, Math.round((elapsed / totalDuration) * 95)));
        try { onProgress(pct); } catch { }
      }
    }
    const v = videos[currentVideoIndex];
    if (!switched && v && (v as any).requestVideoFrameCallback) {
      try { (v as any).requestVideoFrameCallback(() => renderLoop()); } catch { animationFrameId = requestAnimationFrame(renderLoop); }
    } else {
      animationFrameId = requestAnimationFrame(renderLoop);
    }
  };

  if (onStatusUpdate) onStatusUpdate(`Rendering scene 1/${videos.length}...`);
  playNextVideo();
  const vStart = videos[0];
  if (vStart && (vStart as any).requestVideoFrameCallback) {
    try { (vStart as any).requestVideoFrameCallback(() => renderLoop()); } catch { animationFrameId = requestAnimationFrame(renderLoop); }
  } else {
    animationFrameId = requestAnimationFrame(renderLoop);
  }
  const result = await recorderPromise;
  return result.url;
};

export interface SubtitleStyleOptions {
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  outlineColor?: string;
  outlineWidth?: number;
  bottomMargin?: number; // px from bottom
  minWordDuration?: number; // seconds
  wordsPerGroup?: number; // 1, 2, 3 words per subtitle
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
}

// Merge multiple videos with audio, apply watermark, and KEEP original audio mixed with narration
export const mergeMultipleVideosWithAudioWithWatermarkMixOriginal = async (
  videoFiles: File[],
  audio: File | string,
  watermark: WatermarkOptions,
  onProgress?: (progressPercent: number) => void,
  onStatusUpdate?: (status: string) => void
): Promise<string> => {
  const wmEnabled = !!watermark?.enabled && (
    !!watermark?.text || !!watermark?.imageFile
  );

  if (onStatusUpdate) onStatusUpdate('Initializing render engine...');
  const canvas = document.createElement('canvas');
  let width = 720;
  let height = 1280;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not get canvas context');

  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (audioCtx.state === 'suspended') { await audioCtx.resume(); }
  if (onStatusUpdate) onStatusUpdate('Loading media assets...');

  const tempVideoUrls: string[] = [];
  const elementAudioSources: MediaElementAudioSourceNode[] = [];
  const [audioBuffer, videos] = await Promise.all([
    (typeof audio === 'string' ? fetch(audio).then(res => res.arrayBuffer()) : (audio as File).arrayBuffer()).then(buf => audioCtx.decodeAudioData(buf)),
    Promise.all(
      videoFiles.map(file => new Promise<HTMLVideoElement>((resolve, reject) => {
        const video = document.createElement('video');
        const videoUrl = URL.createObjectURL(file);
        tempVideoUrls.push(videoUrl);
        video.src = videoUrl;
        // allow original audio
        video.muted = false;
        video.playsInline = true;
        video.preload = 'auto';
        video.onloadedmetadata = () => resolve(video);
        video.onerror = e => reject(new Error(`Failed to load video. Please try again. ${e}`));
        video.load();
      }))
    )
  ]);

  // Prepare optional image watermark
  let wmImage: HTMLImageElement | null = null;
  let wmImgUrl: string | null = null;
  if (wmEnabled && watermark?.imageFile) {
    wmImgUrl = URL.createObjectURL(watermark.imageFile);
    wmImage = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = e => reject(new Error(`Failed to load watermark image: ${e}`));
      img.src = wmImgUrl!;
    });
  }

  const targetW = Math.max(...videos.map(v => v.videoWidth || width));
  const targetH = Math.max(...videos.map(v => v.videoHeight || height));
  width = targetW; height = targetH; canvas.width = width; canvas.height = height;

  const audioDestination = audioCtx.createMediaStreamDestination();
  const videoStream = canvas.captureStream(60);
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
  const supportedMimeType = mimeTypesToTry.find(type => MediaRecorder.isTypeSupported(type));
  if (!supportedMimeType) { audioCtx.close(); throw new Error('Your browser does not support the required video recording formats.'); }
  const extension = supportedMimeType.includes('webm') ? 'webm' : 'mp4';
  const options = { mimeType: supportedMimeType, videoBitsPerSecond: (width * height >= 2000000 ? 16000000 : (width * height >= 900000 ? 8000000 : 5000000)) };
  const recorder = new MediaRecorder(combinedStream, options);
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  let animationFrameId: number;
  const recorderPromise = new Promise<VideoFile>((resolve, reject) => {
    recorder.onstop = async () => {
      cancelAnimationFrame(animationFrameId);
      audioCtx.close();
      tempVideoUrls.forEach(url => { try { URL.revokeObjectURL(url); } catch { } });
      if (wmImgUrl) { try { URL.revokeObjectURL(wmImgUrl); } catch { } }
      elementAudioSources.forEach(s => { try { s.disconnect(); } catch { } });
      if (onProgress) onProgress(95);
      if (onStatusUpdate) onStatusUpdate('Finalizing to MP4 (H.264/AAC)...');
      if (chunks.length === 0) {
        reject(new Error('Recording failed, resulting in an empty file.'));
      } else {
        const blob = new Blob(chunks, { type: options.mimeType });
        const finalBlob = await ensureMp4H264Aac(blob, extension, 60);
        const url = URL.createObjectURL(finalBlob);
        if (onProgress) onProgress(100);
        if (onStatusUpdate) onStatusUpdate('Selesai!');
        resolve({ url, extension: 'mp4' });
      }
    };
    recorder.onerror = (e) => {
      cancelAnimationFrame(animationFrameId);
      audioCtx.close();
      tempVideoUrls.forEach(url => { try { URL.revokeObjectURL(url); } catch { } });
      if (wmImgUrl) { try { URL.revokeObjectURL(wmImgUrl); } catch { } }
      elementAudioSources.forEach(s => { try { s.disconnect(); } catch { } });
      console.error('MediaRecorder error:', e);
      reject(new Error('A fatal error occurred during video recording.'));
    };
  });

  // route original audio from each video into destination
  videos.forEach(v => {
    try {
      const src = audioCtx.createMediaElementSource(v);
      src.connect(audioDestination);
      elementAudioSources.push(src);
    } catch (e) {
      console.warn('Failed to route original audio from a video element', e);
    }
  });

  // narration audio is the master clock
  const audioSource = audioCtx.createBufferSource();
  audioSource.buffer = audioBuffer;
  audioSource.connect(audioDestination);
  audioSource.onended = () => { if (recorder.state === 'recording') recorder.stop(); };
  // Progress tracking based on narration audio duration
  const startTime = audioCtx.currentTime;
  const totalDuration = Math.max(0.001, audioBuffer.duration || 0);
  recorder.start();
  audioSource.start(0);

  let currentVideoIndex = 0;
  const playNextVideo = () => {
    if (currentVideoIndex >= videos.length) currentVideoIndex = 0;
    const video = videos[currentVideoIndex];
    video.onended = () => {
      currentVideoIndex++;
      const sceneNumber = (currentVideoIndex % videos.length) + 1;
      if (onStatusUpdate) onStatusUpdate(`Rendering scene ${sceneNumber}/${videos.length}...`);
      playNextVideo();
    };
    video.currentTime = 0;
    video.play().catch(e => { console.error(`Video ${currentVideoIndex} failed to play`, e); if (recorder.state === 'recording') recorder.stop(); });
  };

  const drawWatermark = (ctx2: CanvasRenderingContext2D) => {
    if (!wmEnabled) return;
    const pad = 16; let x = pad; let y = pad;
    const pos = watermark.position || 'bottom-right';
    switch (pos) {
      case 'top-left': x = pad; y = pad; break;
      case 'top-right': x = width - pad; y = pad; break;
      case 'bottom-left': x = pad; y = height - pad; break;
      case 'bottom-right': x = width - pad; y = height - pad; break;
      case 'center': x = width / 2; y = height / 2; break;
    }
    x += watermark.xOffset || 0;
    y += watermark.yOffset || 0;
    if (wmImage) {
      const scale = Math.max(0.1, Math.min(1, watermark.imageScale || 0.3));
      const imgW = wmImage.width * scale;
      const imgH = wmImage.height * scale;
      let dx = x; let dy = y;
      if (pos.includes('right')) dx -= imgW;
      if (pos.includes('bottom')) dy -= imgH;
      if (pos === 'center') { dx -= imgW / 2; dy -= imgH / 2; }
      ctx2.save();
      ctx2.globalAlpha = Math.max(0, Math.min(1, watermark.imageOpacity ?? 0.6));
      ctx2.drawImage(wmImage, dx, dy, imgW, imgH);
      ctx2.restore();
    }
    if (watermark.text && watermark.text.trim()) {
      const fontSize = Math.max(10, watermark.fontSize || 28);
      const fontFamily = watermark.fontFamily || 'Arial';
      ctx2.font = `${fontSize}px ${fontFamily}`;
      ctx2.textBaseline = 'bottom';
      ctx2.textAlign = (pos.includes('right') ? 'right' : pos.includes('left') ? 'left' : 'center');
      const fill = watermark.fontColor || '#ffffff';
      const outline = watermark.outlineColor || 'rgba(0,0,0,0.6)';
      const lw = Math.max(0, watermark.outlineWidth || 3);
      if (lw > 0) { ctx2.lineWidth = lw; ctx2.strokeStyle = outline; ctx2.strokeText(watermark.text, x, y); }
      ctx2.fillStyle = fill; ctx2.fillText(watermark.text, x, y);
    }
  };

  const renderLoop = () => {
    const videoToDraw = videos[currentVideoIndex] || videos[videos.length - 1];
    if (videoToDraw && videoToDraw.readyState >= 2) {
      ctx.drawImage(videoToDraw, 0, 0, width, height);
      drawWatermark(ctx);
    }
    if (onProgress) {
      const elapsed = audioCtx.currentTime - startTime;
      const pct = Math.max(0, Math.min(95, Math.round((elapsed / totalDuration) * 95)));
      try { onProgress(pct); } catch { }
    }
    try {
      const elapsed = audioCtx.currentTime - startTime;
      if (elapsed >= Math.max(0.001, totalDuration - 0.02) && recorder.state === 'recording') {
        recorder.stop();
      }
    } catch { }
    animationFrameId = requestAnimationFrame(renderLoop);
  };

  if (onStatusUpdate) onStatusUpdate(`Rendering scene 1/${videos.length}...`);
  playNextVideo();
  animationFrameId = requestAnimationFrame(renderLoop);
  const result = await recorderPromise;
  return result.url;
};

const splitWords = (text: string): string[] => {
  return text
    .replace(/\n+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 0);
};

export const addWordByWordSubtitles = async (
  video: File | string,
  audio: File | string,
  text: string,
  style?: SubtitleStyleOptions,
  onStatusUpdate?: (status: string) => void
): Promise<string> => {
  if (onStatusUpdate) onStatusUpdate('Initializing subtitle render engine...');

  const canvas = document.createElement('canvas');
  let width = 720;
  let height = 1280;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not get canvas context');

  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  if (onStatusUpdate) onStatusUpdate('Loading media assets...');

  // Prepare video element from file or URL (guard against invalid inputs)
  let videoUrl: string;
  let wasObjectUrl = false;
  if (typeof video === 'string') {
    if (!video || video.length === 0) {
      throw new Error('Sumber video kosong. Harap gabungkan video terlebih dahulu.');
    }
    videoUrl = video;
  } else if (video && typeof (video as any).size === 'number') {
    videoUrl = URL.createObjectURL(video as File);
    wasObjectUrl = true;
  } else {
    throw new Error('Sumber video tidak valid untuk subtitel. Gunakan URL string atau File.');
  }
  const videoEl = await new Promise<HTMLVideoElement>((resolve, reject) => {
    const v = document.createElement('video');
    v.src = videoUrl;
    v.muted = true; // we'll use provided audio as master clock
    v.playsInline = true;
    v.preload = 'auto';
    v.onloadedmetadata = () => resolve(v);
    v.onerror = e => reject(new Error(`Failed to load video. ${e}`));
    v.load();
  });

  // Sesuaikan resolusi canvas ke resolusi asli video
  if (videoEl.videoWidth && videoEl.videoHeight) {
    width = videoEl.videoWidth;
    height = videoEl.videoHeight;
    canvas.width = width;
    canvas.height = height;
  }

  // Decode audio buffer from provided audio (string URL or File)
  const audioBuffer = await (
    typeof audio === 'string'
      ? fetch(audio).then(res => res.arrayBuffer())
      : (audio as File).arrayBuffer()
  ).then(buf => audioCtx.decodeAudioData(buf));

  const audioDestination = audioCtx.createMediaStreamDestination();
  const videoStream = canvas.captureStream(60);
  const combinedStream = new MediaStream([
    videoStream.getVideoTracks()[0],
    audioDestination.stream.getAudioTracks()[0]
  ]);

  const mimeTypesToTry = [
    'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
    'video/mp4',
    'video/webm; codecs="vp8, opus"',
    'video/webm'
  ];
  const supportedMimeType = mimeTypesToTry.find(type => MediaRecorder.isTypeSupported(type));
  if (!supportedMimeType) {
    audioCtx.close();
    if (wasObjectUrl) { try { URL.revokeObjectURL(videoUrl); } catch { } }
    throw new Error('Your browser does not support the required video recording formats.');
  }
  const options = { mimeType: supportedMimeType, videoBitsPerSecond: (width * height >= 2000000 ? 16000000 : (width * height >= 900000 ? 8000000 : 5000000)) } as MediaRecorderOptions;
  const recorder = new MediaRecorder(combinedStream, options);
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  let animationFrameId: number;
  const recorderPromise = new Promise<VideoFile>((resolve, reject) => {
    recorder.onstop = async () => {
      cancelAnimationFrame(animationFrameId);
      audioCtx.close();
      if (wasObjectUrl) { try { URL.revokeObjectURL(videoUrl); } catch { } }
      if (onStatusUpdate) onStatusUpdate('Finalizing to MP4 (H.264/AAC)...');
      if ((onStatusUpdate as any) && typeof onProgress === 'function') { try { (onProgress as any)(95); } catch { } }
      if (chunks.length === 0) {
        reject(new Error('Recording failed, resulting in an empty file.'));
      } else {
        const blob = new Blob(chunks, { type: options.mimeType });
        const ext = options.mimeType.includes('webm') ? 'webm' : 'mp4';
        const finalBlob = await ensureMp4H264Aac(blob, ext, 60);
        const url = URL.createObjectURL(finalBlob);
        if ((onStatusUpdate as any) && typeof onProgress === 'function') { try { (onProgress as any)(100); } catch { } }
        if (onStatusUpdate) onStatusUpdate('Selesai!');
        resolve({ url, extension: 'mp4' });
      }
    };
    recorder.onerror = (e) => {
      cancelAnimationFrame(animationFrameId);
      audioCtx.close();
      if (wasObjectUrl) { try { URL.revokeObjectURL(videoUrl); } catch { } }
      console.error('MediaRecorder error:', e);
      reject(new Error('A fatal error occurred during video recording.'));
    };
  });

  // Prepare words and timing
  const words = splitWords(text);
  const groupSize = Math.max(1, Math.min(3, style?.wordsPerGroup ?? 1));
  const tokens: string[] = [];
  for (let i = 0; i < words.length; i += groupSize) {
    tokens.push(words.slice(i, i + groupSize).join(' '));
  }
  const totalDuration = audioBuffer.duration;
  const perToken = Math.max(style?.minWordDuration ?? 0.25, totalDuration / Math.max(1, tokens.length));

  // Audio source as master clock
  const audioSource = audioCtx.createBufferSource();
  audioSource.buffer = audioBuffer;
  audioSource.connect(audioDestination);
  audioSource.onended = () => {
    if (recorder.state === 'recording') {
      recorder.stop();
    }
  };
  recorder.start();
  const startAt = audioCtx.currentTime;
  audioSource.start(0);

  // Ensure video loops to match audio duration
  videoEl.onended = () => {
    videoEl.currentTime = 0;
    videoEl.play().catch(console.error);
  };
  videoEl.currentTime = 0;
  videoEl.play().catch(e => {
    console.error('Video failed to play', e);
    if (recorder.state === 'recording') recorder.stop();
  });

  const renderLoop = () => {
    if (videoEl.readyState >= 2) {
      ctx.drawImage(videoEl, 0, 0, width, height);

      // Draw current word subtitle
      const elapsed = Math.max(0, audioCtx.currentTime - startAt);
      const idx = Math.min(tokens.length - 1, Math.floor(elapsed / perToken));
      const current = tokens[idx] || '';
      if (current) {
        const fontSize = Math.max(12, style?.fontSize ?? 48);
        const fontFamily = style?.fontFamily ?? 'Arial';
        const fill = style?.fontColor ?? '#ffffff';
        const outline = style?.outlineColor ?? 'rgba(0,0,0,0.8)';
        const lw = Math.max(0, style?.outlineWidth ?? 6);
        const margin = Math.max(10, style?.bottomMargin ?? 40);
        ctx.font = `${style?.fontWeight ?? 'normal'} ${style?.fontStyle ?? 'normal'} ${fontSize}px ${fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const x = width / 2;
        const y = height - margin;
        if (lw > 0) {
          ctx.lineWidth = lw;
          ctx.strokeStyle = outline;
          ctx.strokeText(current, x, y);
        }
        ctx.fillStyle = fill;
        ctx.fillText(current, x, y);
      }
    }
    animationFrameId = requestAnimationFrame(renderLoop);
  };

  if (onStatusUpdate) onStatusUpdate('Rendering subtitles...');
  animationFrameId = requestAnimationFrame(renderLoop);

  const result = await recorderPromise;
  return result.url;
};

// Editor-specific overlay options
export interface EditorOverlayOptions {
  overlayVideo?: File;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  scale?: number; // 0.1..1
  opacity?: number; // 0..1
}

// Editor-specific text overlay options
export interface EditorTextOverlayOptions {
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  outlineColor?: string;
  outlineWidth?: number;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' | 'bottom';
  xOffset?: number;
  yOffset?: number;
}

// Editor export options
export interface EditorExportOptions {
  resolution?: '720p' | '1080p';
  videoBitsPerSecond?: number;
}

// Compose videos with optional overlays/watermarks and optional audio
export const composeVideoWithOverlays = async (
  videoFiles: File[],
  audio: File | string | undefined,
  overlay: EditorOverlayOptions,
  watermark: WatermarkOptions | undefined,
  textOverlay: EditorTextOverlayOptions | undefined,
  exportOptions?: EditorExportOptions,
  onProgress?: (progressPercent: number) => void,
  onStatusUpdate?: (status: string) => void,
  useOriginalAudio?: boolean
): Promise<string> => {
  if (onStatusUpdate) onStatusUpdate('Initializing editor render engine...');

  const is1080 = exportOptions?.resolution === '1080p';
  let width = is1080 ? 1080 : 720;
  let height = is1080 ? 1920 : 1280;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not get canvas context');

  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }
  if (onStatusUpdate) onStatusUpdate('Loading media assets...');
  // Fix: deklarasi array source audio dari elemen video agar tidak ReferenceError
  const elementAudioSources: MediaElementAudioSourceNode[] = [];

  // Load all videos
  const tempVideoUrls: string[] = [];
  const videos = await Promise.all(
    videoFiles.map(file => new Promise<HTMLVideoElement>((resolve, reject) => {
      const v = document.createElement('video');
      const u = URL.createObjectURL(file);
      tempVideoUrls.push(u);
      v.src = u;
      // Jika audio asli diaktifkan, jangan mute agar sumber audio tersedia
      v.muted = !useOriginalAudio;
      v.playsInline = true;
      v.preload = 'auto';
      v.onloadedmetadata = () => resolve(v);
      v.onerror = e => reject(new Error(`Failed to load video. ${e}`));
      v.load();
    }))
  );

  // Tentukan orientasi output berdasarkan video pertama
  try {
    const first = videos[0];
    const vw = first?.videoWidth || 1280;
    const vh = first?.videoHeight || 720;
    const isLandscapeSrc = vw >= vh;
    if (isLandscapeSrc) {
      width = is1080 ? 1920 : 1280;
      height = is1080 ? 1080 : 720;
    } else {
      width = is1080 ? 1080 : 720;
      height = is1080 ? 1920 : 1280;
    }
    canvas.width = width;
    canvas.height = height;
  } catch { }

  // Optional overlay video
  let ovVideo: HTMLVideoElement | null = null;
  let ovUrl: string | null = null;
  if (overlay?.overlayVideo) {
    ovUrl = URL.createObjectURL(overlay.overlayVideo);
    ovVideo = await new Promise<HTMLVideoElement>((resolve, reject) => {
      const v = document.createElement('video');
      v.src = ovUrl!;
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.onloadedmetadata = () => resolve(v);
      v.onerror = e => reject(new Error(`Failed to load overlay video. ${e}`));
      v.load();
    });
  }

  // Optional watermark image
  let wmImage: HTMLImageElement | null = null;
  let wmImgUrl: string | null = null;
  if (watermark?.enabled && watermark?.imageFile) {
    wmImgUrl = URL.createObjectURL(watermark.imageFile);
    wmImage = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = e => reject(new Error(`Failed to load watermark image: ${e}`));
      img.src = wmImgUrl!;
    });
  }

  // Helper lokal: render teks overlay editor
  const drawTextOverlay = (ctx2: CanvasRenderingContext2D) => {
    if (!textOverlay?.text || !textOverlay.text.trim()) return;
    const fontSize = Math.max(10, textOverlay.fontSize || 36);
    const fontFamily = textOverlay.fontFamily || 'Arial';
    ctx2.font = `${fontSize}px ${fontFamily}`;
    const fill = textOverlay.fontColor || '#ffffff';
    const outline = textOverlay.outlineColor || 'rgba(0,0,0,0.8)';
    const lw = Math.max(0, textOverlay.outlineWidth || 5);
    ctx2.fillStyle = fill;
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'bottom';
    let x = width / 2 + (textOverlay.xOffset || 0);
    let y = height - (textOverlay.yOffset || 40);
    const pos = textOverlay.position || 'bottom';
    if (pos === 'center') { y = height / 2; ctx2.textBaseline = 'middle'; }
    if (pos === 'top-left' || pos === 'top-right') { y = (textOverlay.yOffset || 40); ctx2.textBaseline = 'top'; }
    if (pos.includes('left')) { x = (textOverlay.xOffset || 40); ctx2.textAlign = 'left'; }
    if (pos.includes('right')) { x = width - (textOverlay.xOffset || 40); ctx2.textAlign = 'right'; }
    if (lw > 0) { ctx2.lineWidth = lw; ctx2.strokeStyle = outline; ctx2.strokeText(textOverlay.text, x, y); }
    ctx2.fillText(textOverlay.text, x, y);
  };

  // Helper lokal: render watermark (gambar/teks) editor
  const drawWatermarkLocal = (ctx2: CanvasRenderingContext2D) => {
    if (!watermark?.enabled) return;
    const pad = 16;
    let x = pad;
    let y = pad;
    const pos = watermark.position || 'bottom-right';
    switch (pos) {
      case 'top-left':
        x = pad; y = pad; break;
      case 'top-right':
        x = width - pad; y = pad; break;
      case 'bottom-left':
        x = pad; y = height - pad; break;
      case 'bottom-right':
        x = width - pad; y = height - pad; break;
      case 'center':
        x = width / 2; y = height / 2; break;
    }
    x += watermark.xOffset || 0;
    y += watermark.yOffset || 0;

    if (wmImage) {
      const scale = Math.max(0.1, Math.min(1, watermark.imageScale || 0.3));
      const imgW = wmImage.width * scale;
      const imgH = wmImage.height * scale;
      let drawX = x;
      let drawY = y;
      if (pos.includes('right')) drawX -= imgW;
      if (pos.includes('bottom')) drawY -= imgH;
      if (pos === 'center') { drawX -= imgW / 2; drawY -= imgH / 2; }
      ctx2.save();
      ctx2.globalAlpha = Math.max(0, Math.min(1, watermark.imageOpacity ?? 0.6));
      ctx2.drawImage(wmImage, drawX, drawY, imgW, imgH);
      ctx2.restore();
    }

    if (watermark.text && watermark.text.trim()) {
      const fontSize = Math.max(10, watermark.fontSize || 28);
      const fontFamily = watermark.fontFamily || 'Arial';
      ctx2.font = `${fontSize}px ${fontFamily}`;
      ctx2.textBaseline = pos.includes('top') ? 'top' : pos.includes('bottom') ? 'bottom' : 'middle';
      ctx2.textAlign = pos.includes('right') ? 'right' : pos.includes('left') ? 'left' : 'center';
      const fill = watermark.fontColor || '#ffffff';
      const outline = watermark.outlineColor || 'rgba(0,0,0,0.6)';
      const lw = Math.max(0, watermark.outlineWidth || 3);
      if (lw > 0) { ctx2.lineWidth = lw; ctx2.strokeStyle = outline; try { ctx2.strokeText(watermark.text, x, y); } catch { } }
      ctx2.fillStyle = fill; try { ctx2.fillText(watermark.text, x, y); } catch { }
    }
  };

  // Prepare audio
  const audioDestination = audioCtx.createMediaStreamDestination();
  // Samakan dengan merger: gunakan 30 FPS untuk kompatibilitas MP4 umum
  const videoStream = canvas.captureStream(60);
  const combinedStream = new MediaStream([
    videoStream.getVideoTracks()[0],
    audioDestination.stream.getAudioTracks()[0]
  ]);
  // Durasi audio overlay untuk failsafe timer
  let overlayAudioDuration = 0;

  // Force MP4; jika tidak didukung, tampilkan error agar tidak menyimpan WebM sebagai .mp4
  const supportedMimeType = (
    MediaRecorder.isTypeSupported('video/mp4; codecs="avc1.42E01E, mp4a.40.2"') ? 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'
      : MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4'
        : null
  );
  if (!supportedMimeType) {
    audioCtx.close();
    throw new Error('Browser ini tidak mendukung perekaman MP4. Gunakan Chrome/Edge terbaru atau fitur Merger.');
  }
  // Samakan dengan merger: default bitrate 3 Mbps (bisa di-override di exportOptions)
  const options = { mimeType: supportedMimeType, videoBitsPerSecond: exportOptions?.videoBitsPerSecond ?? 3000000 };
  const recorder = new MediaRecorder(combinedStream, options);
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  let animationFrameId: number;
  let stopTimerId: number | null = null;
  const recorderPromise = new Promise<string>((resolve, reject) => {
    recorder.onstop = async () => {
      if (stopTimerId) { clearTimeout(stopTimerId); stopTimerId = null; }
      cancelAnimationFrame(animationFrameId);
      audioCtx.close();
      elementAudioSources.forEach(s => { try { s.disconnect(); } catch { } });
      tempVideoUrls.forEach(u => { try { URL.revokeObjectURL(u); } catch { } });
      if (ovUrl) { try { URL.revokeObjectURL(ovUrl); } catch { } }
      if (wmImgUrl) { try { URL.revokeObjectURL(wmImgUrl); } catch { } }
      const blob = new Blob(chunks, { type: options.mimeType });

      // Update UI to indicate finalization phase
      if (onProgress) onProgress(95);
      if (onStatusUpdate) onStatusUpdate('Finalizing to MP4 (H.264/AAC)...');

      // Pastikan kontainer MP4 kompatibel dengan HP (faststart, yuv420p, AAC)
      try {
        const { createFFmpeg, fetchFile } = await import('@ffmpeg/ffmpeg');
        const ffmpeg = createFFmpeg({ log: false });
        await ffmpeg.load();
        const inputName = (blob.type || '').toLowerCase().includes('mp4') ? 'input.mp4' : 'input.webm';
        ffmpeg.FS('writeFile', inputName, await fetchFile(blob));
        try {
          await ffmpeg.run('-i', inputName, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-movflags', 'faststart', '-c:a', 'aac', '-b:a', '128k', '-r', '60', 'output.mp4');
        } catch {
          await ffmpeg.run('-i', inputName, '-c:v', 'h264', '-pix_fmt', 'yuv420p', '-movflags', 'faststart', '-c:a', 'aac', '-b:a', '128k', '-r', '60', 'output.mp4');
        }
        const out = ffmpeg.FS('readFile', 'output.mp4');
        const mp4Blob = new Blob([out.buffer], { type: 'video/mp4' });
        try { ffmpeg.FS('unlink', inputName); ffmpeg.FS('unlink', 'output.mp4'); } catch { }
        const url = URL.createObjectURL(mp4Blob);
        if (onProgress) onProgress(100);
        if (onStatusUpdate) onStatusUpdate('Selesai!');
        resolve(url);
      } catch (convErr) {
        console.warn('Konversi MP4 gagal, gunakan hasil asli', convErr);
        const fallbackUrl = URL.createObjectURL(blob);
        if (onProgress) onProgress(100);
        if (onStatusUpdate) onStatusUpdate('Selesai!');
        resolve(fallbackUrl);
      }
    };
    recorder.onerror = (e) => {
      if (stopTimerId) { clearTimeout(stopTimerId); stopTimerId = null; }
      cancelAnimationFrame(animationFrameId);
      audioCtx.close();
      elementAudioSources.forEach(s => { try { s.disconnect(); } catch { } });
      tempVideoUrls.forEach(u => { try { URL.revokeObjectURL(u); } catch { } });
      if (ovUrl) { try { URL.revokeObjectURL(ovUrl); } catch { } }
      if (wmImgUrl) { try { URL.revokeObjectURL(wmImgUrl); } catch { } }
      console.error('MediaRecorder error:', e);
      reject(new Error('A fatal error occurred during video recording.'));
    };
  });

  const audioSource = audioCtx.createBufferSource();
  // Sumber audio tambahan (overlay) saat audio asli juga diaktifkan
  let overlaySource: AudioBufferSourceNode | null = null;
  if (useOriginalAudio) {
    // Route each video element's audio into destination
    videos.forEach(v => {
      try {
        const src = audioCtx.createMediaElementSource(v);
        src.connect(audioDestination);
        elementAudioSources.push(src);
      } catch (e) {
        console.warn('Failed to route original audio from a video element', e);
      }
    });
    // Jika ada audio overlay, ikut campurkan
    if (audio) {
      const buf = await (typeof audio === 'string' ? fetch(audio).then(r => r.arrayBuffer()) : (audio as File).arrayBuffer());
      const audioBuffer = await audioCtx.decodeAudioData(buf);
      overlaySource = audioCtx.createBufferSource();
      overlaySource.buffer = audioBuffer;
      overlaySource.connect(audioDestination);
      overlayAudioDuration = audioBuffer.duration || 0;
    }
    // Clock diam berdasarkan durasi maksimum (video/overlay audio/overlay video)
    const baseDuration = Math.max(1, videos.reduce((acc, vv) => acc + (isFinite(vv.duration) ? vv.duration : 0), 0));
    const overlayVideoDuration = ovVideo && isFinite(ovVideo.duration) ? ovVideo.duration : 0;
    const estDuration = Math.max(baseDuration, overlayVideoDuration, overlayAudioDuration, 3);
    const silentBuffer = audioCtx.createBuffer(1, Math.ceil(estDuration * audioCtx.sampleRate), audioCtx.sampleRate);
    audioSource.buffer = silentBuffer;
  } else if (audio) {
    const buf = await (typeof audio === 'string' ? fetch(audio).then(r => r.arrayBuffer()) : (audio as File).arrayBuffer());
    const audioBuffer = await audioCtx.decodeAudioData(buf);
    audioSource.buffer = audioBuffer;
    overlayAudioDuration = audioBuffer.duration || 0;
  } else {
    // Pure silent fallback
    const baseDuration = Math.max(1, videos.reduce((acc, vv) => acc + (isFinite(vv.duration) ? vv.duration : 0), 0));
    const overlayVideoDuration = ovVideo && isFinite(ovVideo.duration) ? ovVideo.duration : 0;
    const estDuration = Math.max(baseDuration, overlayVideoDuration, 3);
    const silentBuffer = audioCtx.createBuffer(1, Math.ceil(estDuration * audioCtx.sampleRate), audioCtx.sampleRate);
    audioSource.buffer = silentBuffer;
  }
  audioSource.connect(audioDestination);
  audioSource.onended = () => { if (recorder.state === 'recording') recorder.stop(); };

  // Tunda start hingga frame pertama siap diputar agar tidak ada blank di awal
  let started = false;
  // Failsafe: hentikan recorder setelah durasi estimasi berlalu
  try {
    const baseDurationFs = Math.max(1, videos.reduce((acc, vv) => acc + (isFinite(vv.duration) ? vv.duration : 0), 0));
    const overlayDurationFs = ovVideo && isFinite(ovVideo.duration) ? ovVideo.duration : 0;
    const overlayAudioDurationFs = overlayAudioDuration || 0;
    const estDurationFs = Math.max(baseDurationFs, overlayDurationFs, overlayAudioDurationFs, 3);
    stopTimerId = window.setTimeout(() => {
      if (recorder.state === 'recording') {
        try { recorder.stop(); } catch { }
      }
    }, Math.ceil(estDurationFs * 1000 + 250));
  } catch { }


  let currentVideoIndex = 0;
  const playNextVideo = () => {
    if (currentVideoIndex >= videos.length) currentVideoIndex = 0;
    const v = videos[currentVideoIndex];
    v.onended = () => { currentVideoIndex++; playNextVideo(); };
    v.currentTime = 0;
    v.play().catch(e => { console.error('Video failed to play', e); if (recorder.state === 'recording') recorder.stop(); });
    v.onplaying = () => {
      if (!started) {
        try { recorder.start(); } catch { }
        try { audioSource.start(0); } catch { }
        try { if (overlaySource) overlaySource.start(0); } catch { }
        started = true;
      }
    };

    if (ovVideo) {
      ovVideo.onended = () => { ovVideo!.currentTime = 0; ovVideo!.play().catch(console.error); };
      ovVideo.currentTime = 0;
      ovVideo.play().catch(console.error);
    }
  };

  const renderLoop = () => {
    const v = videos[currentVideoIndex] || videos[videos.length - 1];
    if (v && v.readyState >= 2) {
      const vw = v.videoWidth || width;
      const vh = v.videoHeight || height;
      const scale = Math.min(width / vw, height / vh);
      const dw = Math.max(1, Math.round(vw * scale));
      const dh = Math.max(1, Math.round(vh * scale));
      const dx = Math.floor((width - dw) / 2);
      const dy = Math.floor((height - dh) / 2);
      ctx.fillStyle = '#000000';
      try { ctx.fillRect(0, 0, width, height); } catch { }
      ctx.drawImage(v, dx, dy, dw, dh);

      // Overlay video
      if (ovVideo && ovVideo.readyState >= 2) {
        const scale = Math.max(0.1, Math.min(1, overlay?.scale ?? 0.4));
        const ovW = ovVideo.videoWidth * scale;
        const ovH = ovVideo.videoHeight * scale;
        let ox = 16; let oy = 16;
        const pos = overlay?.position || 'bottom-right';
        if (pos.includes('right')) ox = width - ovW - 16;
        if (pos.includes('bottom')) oy = height - ovH - 16;
        if (pos === 'center') { ox = (width - ovW) / 2; oy = (height - ovH) / 2; }
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, overlay?.opacity ?? 0.9));
        ctx.drawImage(ovVideo, ox, oy, ovW, ovH);
        ctx.restore();
      }

      // Text overlay and watermark image/text
      drawTextOverlay(ctx);
      drawWatermarkLocal(ctx);
    }
    animationFrameId = requestAnimationFrame(renderLoop);
  };

  if (onStatusUpdate) onStatusUpdate('Rendering...');
  playNextVideo();
  animationFrameId = requestAnimationFrame(renderLoop);

  const url = await recorderPromise;
  return url;
};
