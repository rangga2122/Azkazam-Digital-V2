import { VideoFile, WatermarkConfig, WatermarkPosition, WatermarkTemplate, WatermarkType, SubtitleConfig, SubtitleChunk } from "../types";

// SVG Paths for Icons (Normalized to 24x24 Viewbox)
const ICONS = {
  PHONE: "M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z",
  AT_SIGN: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z",
  GLOBE: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"
};

/**
 * This service uses HTML5 Canvas and Web Audio API to merge videos client-side.
 * It plays videos sequentially, draws them to a canvas, and records the stream.
 * It also mixes the TTS audio track if provided.
 */
export class VideoProcessor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private audioCtx: AudioContext;
  private dest: MediaStreamAudioDestinationNode;
  private watermarkImageElement: HTMLImageElement | null = null;
  
  // Performance Constraints
  private readonly MAX_WIDTH = 1920;
  private readonly MAX_HEIGHT = 1080;
  private readonly TARGET_FPS = 30;
  private readonly VIDEO_BITRATE = 5000000; // 5 Mbps (Balanced Quality/Performance)

  constructor() {
    this.canvas = document.createElement('canvas');
    // Default size, will be overridden by the first video
    this.canvas.width = 1280;
    this.canvas.height = 720;
    
    // Optimization: alpha false improves rendering speed as we don't need transparency
    const context = this.canvas.getContext('2d', { 
      alpha: false,
      willReadFrequently: false // We are mostly writing to canvas
    }); 
    
    if (!context) throw new Error("Canvas context not supported");
    this.ctx = context;

    this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.dest = this.audioCtx.createMediaStreamDestination();
  }

  async mergeVideos(
    videos: VideoFile[], 
    ttsAudioBlob: Blob | null,
    watermarkConfig: WatermarkConfig,
    subtitleConfig: SubtitleConfig,
    subtitleChunks: SubtitleChunk[],
    keepOriginalAudio: boolean,
    trimToAudio: boolean,
    onProgress: (msg: string) => void
  ): Promise<{ blob: Blob, extension: string }> {
    if (videos.length === 0) throw new Error("Tidak ada video untuk digabungkan.");

    onProgress("Menganalisis resolusi video...");

    // 1. Set Canvas Size based on the FIRST video (Master ratio) but capped at 1080p
    try {
      const dims = await this.getVideoDimensions(videos[0].file);
      this.canvas.width = dims.width;
      this.canvas.height = dims.height;
      console.log(`Canvas set to ${dims.width}x${dims.height}`);
    } catch (e) {
      console.warn("Could not read video dimensions, using default 720p");
    }

    // Pre-load watermark image if needed
    if (watermarkConfig.enabled && watermarkConfig.type === WatermarkType.IMAGE && watermarkConfig.imageFile) {
       try {
         this.watermarkImageElement = await this.loadImage(watermarkConfig.imageFile);
       } catch (e) {
         console.warn("Failed to load watermark image", e);
       }
    }

    // Handle TTS Audio & Looping Logic
    let ttsBuffer: AudioBuffer | null = null;
    let ttsDuration = 0;

    if (ttsAudioBlob) {
      try {
        onProgress("Memproses audio narasi...");
        const arrayBuffer = await ttsAudioBlob.arrayBuffer();
        ttsBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
        ttsDuration = ttsBuffer.duration;
      } catch (e) {
        console.error("Error decoding TTS audio", e);
      }
    }

    // Construct Playlist (Loop logic)
    const playlist: File[] = [];
    
    if (ttsDuration > 0) {
      onProgress("Menghitung durasi visual...");
      // Get durations of all videos
      const videoDurations = await Promise.all(videos.map(v => this.getVideoDuration(v.file)));
      const totalVideoDuration = videoDurations.reduce((a, b) => a + b, 0);
      
      // If TTS is longer than video, loop videos
      let currentVisualDuration = 0;
      
      if (totalVideoDuration > 0) {
        while (currentVisualDuration < ttsDuration) {
          for (let i = 0; i < videos.length; i++) {
             playlist.push(videos[i].file);
             currentVisualDuration += videoDurations[i];
             // Optimization: Stop adding if we have enough buffer (e.g. +2 seconds over)
             if (currentVisualDuration > ttsDuration + 2) break;
          }
        }
      } else {
        // Fallback if duration calc fails
        playlist.push(...videos.map(v => v.file));
      }

      if (playlist.length > videos.length) {
        console.log(`Looping videos: Original count ${videos.length}, New count ${playlist.length}`);
      }
    } else {
      // No TTS, just play sequence once
      playlist.push(...videos.map(v => v.file));
    }


    onProgress("Menyiapkan engine video...");

    // 2. Determine best MIME type (Prioritize MP4)
    const { mimeType, extension } = this.getSupportedMimeType();
    console.log(`Using MIME: ${mimeType}`);

    // Combine video track (from canvas) and audio track (from web audio dest)
    // Force capture stream to target FPS. 
    // Important: captureStream(30) makes the stream assume 30fps, but we must feed it at that rate.
    const canvasStream = this.canvas.captureStream(this.TARGET_FPS); 
    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...this.dest.stream.getAudioTracks()
    ]);

    const mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType: mimeType,
      videoBitsPerSecond: this.VIDEO_BITRATE 
    });

    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.start();

    // Start TTS Audio Playback (if exists)
    let ttsSource: AudioBufferSourceNode | null = null;
    // Record start time of the whole process to sync subtitles
    const recordingStartTime = this.audioCtx.currentTime;

    if (ttsBuffer) {
        ttsSource = this.audioCtx.createBufferSource();
        ttsSource.buffer = ttsBuffer;
        // Create a gain node to control TTS volume relative to video
        const gainNode = this.audioCtx.createGain();
        gainNode.gain.value = 1.0; 
        ttsSource.connect(gainNode).connect(this.dest);
        ttsSource.start(0);
    }

    // Calculate exact max duration based on user preference
    // If trimToAudio is true and we have TTS, use ttsDuration. Otherwise, 0 (infinite/video length)
    const maxProcessDuration = (trimToAudio && ttsDuration > 0) ? ttsDuration : 0;

    // Play videos sequentially from the playlist
    for (let i = 0; i < playlist.length; i++) {
      const videoFile = playlist[i];
      onProgress(`Memproses klip ${i + 1} dari ${playlist.length}${playlist.length > videos.length ? ' (Looping)' : ''}...`);
      
      // Check if we have already exceeded the max duration
      const currentElapsed = this.audioCtx.currentTime - recordingStartTime;
      if (maxProcessDuration > 0 && currentElapsed >= maxProcessDuration) {
        console.log("Max duration reached before playing next clip. Stopping.");
        break;
      }

      await this.playAndRecordVideo(
        videoFile, 
        watermarkConfig, 
        subtitleConfig,
        subtitleChunks,
        keepOriginalAudio, 
        recordingStartTime,
        maxProcessDuration
      );
    }

    onProgress("Finalisasi video...");
    
    if (ttsSource) {
      try { ttsSource.stop(); } catch(e) {}
    }
    
    // Wait a moment for the recorder to catch the last frames
    await new Promise(resolve => setTimeout(resolve, 200));
    
    mediaRecorder.stop();

    return new Promise((resolve) => {
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        // Close Audio Context to free resources
        this.audioCtx.close();
        resolve({ blob, extension });
      };
    });
  }

  // Helper to get standard dimensions from the first file, CAPPED at 1080p to prevent lag
  private getVideoDimensions(file: File): Promise<{width: number, height: number}> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        let w = video.videoWidth;
        let h = video.videoHeight;

        // Downscale logic if video is larger than 1080p (e.g. 4K)
        // 4K canvas operations are too slow for client-side JS MediaRecorder
        if (w > this.MAX_WIDTH || h > this.MAX_HEIGHT) {
          const ratio = w / h;
          if (w > h) {
            // Landscape
            w = Math.min(w, this.MAX_WIDTH);
            h = Math.round(w / ratio);
          } else {
            // Portrait
            h = Math.min(h, this.MAX_HEIGHT);
            w = Math.round(h * ratio);
          }
        }

        // Ensure dimensions are even numbers (some encoders fail with odd numbers)
        if (w % 2 !== 0) w--;
        if (h % 2 !== 0) h--;

        resolve({ width: w, height: h });
        URL.revokeObjectURL(video.src);
      };
      video.onerror = reject;
      video.src = URL.createObjectURL(file);
    });
  }

  private getVideoDuration(file: File): Promise<number> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        resolve(video.duration);
        URL.revokeObjectURL(video.src);
      };
      video.onerror = reject;
      video.src = URL.createObjectURL(file);
    });
  }

  private loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  // Determine browser support for MP4 vs WebM
  private getSupportedMimeType(): { mimeType: string, extension: string } {
    const types = [
      { mime: 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"', ext: 'mp4' }, // Standard H.264
      { mime: 'video/mp4', ext: 'mp4' }, // Generic MP4
      { mime: 'video/webm; codecs=h264', ext: 'mp4' }, // WebM container but H.264 (sometimes treated as mp4)
      { mime: 'video/webm; codecs=vp9', ext: 'webm' },
      { mime: 'video/webm', ext: 'webm' }
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type.mime)) {
        return { mimeType: type.mime, extension: type.ext };
      }
    }
    
    return { mimeType: 'video/webm', extension: 'webm' };
  }

  private playAndRecordVideo(
    file: File, 
    watermarkConfig: WatermarkConfig,
    subtitleConfig: SubtitleConfig,
    subtitleChunks: SubtitleChunk[], 
    keepOriginalAudio: boolean,
    globalStartTime: number,
    maxDuration: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.src = URL.createObjectURL(file);
      video.crossOrigin = "anonymous";
      video.muted = false; 
      video.volume = 1.0;
      video.playsInline = true;

      // Connect video audio to our destination
      const source = this.audioCtx.createMediaElementSource(video);
      
      // Control Original Video Volume
      const videoGain = this.audioCtx.createGain();
      if (keepOriginalAudio) {
        videoGain.gain.value = 0.8; 
      } else {
        videoGain.gain.value = 0; 
      }
      
      source.connect(videoGain).connect(this.dest);

      // CRITICAL LAG FIX: Use requestVideoFrameCallback
      let handle = 0;
      
      const drawFrame = (now: number, metadata: VideoFrameCallbackMetadata) => {
        // If video is paused or ended, stop loop
        if (video.paused || video.ended) return;

        // Check Max Duration Cutoff
        const currentElapsed = this.audioCtx.currentTime - globalStartTime;
        if (maxDuration > 0 && currentElapsed >= maxDuration) {
           // Force stop video playback
           video.pause();
           // Trigger dispatch event to handle cleanup
           video.dispatchEvent(new Event('ended'));
           return;
        }
        
        // Draw video to canvas properly scaled (contain)
        const hRatio = this.canvas.width / video.videoWidth;
        const vRatio = this.canvas.height / video.videoHeight;
        const ratio = Math.min(hRatio, vRatio);
        
        const centerShift_x = (this.canvas.width - video.videoWidth * ratio) / 2;
        const centerShift_y = (this.canvas.height - video.videoHeight * ratio) / 2;
        
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 1. Draw Video Frame
        this.ctx.drawImage(
            video, 
            0, 0, video.videoWidth, video.videoHeight,
            centerShift_x, centerShift_y, video.videoWidth * ratio, video.videoHeight * ratio
        );

        // 2. Draw Watermark
        if (watermarkConfig.enabled) {
          this.drawWatermark(watermarkConfig);
        }

        // 3. Draw Subtitles
        if (subtitleConfig.enabled && subtitleChunks.length > 0) {
            // Calculate current playback time relative to the entire sequence
            // We use currentElapsed calculated above
            this.drawSubtitle(subtitleConfig, subtitleChunks, currentElapsed);
        }

        // Re-queue the callback for the NEXT frame
        handle = video.requestVideoFrameCallback(drawFrame);
      };

      video.onloadedmetadata = () => {
        video.play().then(() => {
          // Start the drawing loop using the specific video frame callback
          if ('requestVideoFrameCallback' in video) {
             handle = video.requestVideoFrameCallback(drawFrame);
          } else {
             // Fallback for older browsers
             const fallbackLoop = () => {
                const v = video as HTMLVideoElement;
                if (v.paused || v.ended) return;

                // Check Max Duration Cutoff in fallback loop too
                const currentElapsed = this.audioCtx.currentTime - globalStartTime;
                if (maxDuration > 0 && currentElapsed >= maxDuration) {
                    v.pause();
                    v.dispatchEvent(new Event('ended'));
                    return;
                }
                
                this.ctx.fillStyle = '#000000';
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                
                 const hRatio = this.canvas.width / v.videoWidth;
                 const vRatio = this.canvas.height / v.videoHeight;
                 const ratio = Math.min(hRatio, vRatio);
                 const centerShift_x = (this.canvas.width - v.videoWidth * ratio) / 2;
                 const centerShift_y = (this.canvas.height - v.videoHeight * ratio) / 2;
                 this.ctx.drawImage(v, 0, 0, v.videoWidth, v.videoHeight, centerShift_x, centerShift_y, v.videoWidth * ratio, v.videoHeight * ratio);
                 
                 if (watermarkConfig.enabled) this.drawWatermark(watermarkConfig);
                 if (subtitleConfig.enabled && subtitleChunks.length > 0) {
                    this.drawSubtitle(subtitleConfig, subtitleChunks, currentElapsed);
                 }

                 requestAnimationFrame(fallbackLoop);
             };
             requestAnimationFrame(fallbackLoop);
          }
        }).catch(reject);
      };

      video.onended = () => {
        URL.revokeObjectURL(video.src);
        if ('requestVideoFrameCallback' in video && handle) {
            video.cancelVideoFrameCallback(handle);
        }
        // Disconnect audio
        source.disconnect();
        videoGain.disconnect();
        resolve();
      };

      video.onerror = (e) => {
        console.error("Video playback error", e);
        reject(e);
      };
    });
  }

  private drawSubtitle(config: SubtitleConfig, chunks: SubtitleChunk[], currentTime: number) {
      // Use save/restore to isolate canvas state for subtitles
      this.ctx.save();

      // Find active chunk
      const activeChunk = chunks.find(c => currentTime >= c.startTime && currentTime < c.endTime);
      if (!activeChunk) {
          this.ctx.restore();
          return;
      }

      const { width, height } = this.canvas;
      // Apply fontSizeScale from config
      const fontSize = height * 0.05 * config.fontSizeScale;
      const fontStyle = `${config.isItalic ? 'italic' : ''} ${config.isBold ? 'bold' : ''}`;
      
      this.ctx.font = `${fontStyle} ${fontSize}px Arial, sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';

      const x = width / 2;
      // Map percent 0-100 to canvas height. usually bottom (80-90%)
      const y = (config.positionY / 100) * height;

      // Shadow for visibility
      this.ctx.shadowColor = 'rgba(0,0,0,0.8)';
      this.ctx.shadowBlur = 4;
      this.ctx.shadowOffsetX = 2;
      this.ctx.shadowOffsetY = 2;

      // Outline (Stroke)
      this.ctx.strokeStyle = config.outlineColor;
      this.ctx.lineWidth = fontSize * 0.15; // Proportional outline
      this.ctx.lineJoin = 'round';
      this.ctx.strokeText(activeChunk.text, x, y);

      // Fill Text
      this.ctx.shadowBlur = 0; // Reset shadow for fill so text remains crisp
      this.ctx.fillStyle = config.textColor;
      this.ctx.fillText(activeChunk.text, x, y);
      
      this.ctx.restore();
  }

  private drawWatermark(config: WatermarkConfig) {
    this.ctx.save(); // Isolate watermark styles

    const { width, height } = this.canvas;
    const padding = width * 0.03;
    
    this.ctx.globalAlpha = config.opacity;
    // Reset shadow by default for watermark
    this.ctx.shadowBlur = 0;
    this.ctx.shadowColor = 'transparent';
    this.ctx.textAlign = 'left'; // Default align
    this.ctx.textBaseline = 'alphabetic';

    // Determine Position overrides for specific templates
    let position = config.position;
    if (config.template === WatermarkTemplate.NEWS) {
      // News always at bottom, full width
      position = WatermarkPosition.BOTTOM_LEFT; 
    }

    if (config.type === WatermarkType.TEXT && config.text) {
      const baseFontSize = height * 0.05; 
      const fontSize = baseFontSize * config.scale;
      this.ctx.font = `bold ${fontSize}px Arial, sans-serif`;
      
      const textMetrics = this.ctx.measureText(config.text);
      const textWidth = textMetrics.width;
      
      // Helper to draw Icon
      const drawIconPath = (pathStr: string, x: number, y: number, size: number, color: string) => {
        this.ctx.save();
        this.ctx.translate(x, y);
        const scale = size / 24; // Normalize 24px SVG to target size
        this.ctx.scale(scale, scale);
        this.ctx.fillStyle = color;
        this.ctx.fill(new Path2D(pathStr));
        this.ctx.restore();
      }

      // Template Specific Drawing Logic
      if (config.template === WatermarkTemplate.NEWS) {
         // Full width banner at bottom
         const bannerHeight = fontSize * 2;
         const iconSize = fontSize * 1.2;

         this.ctx.fillStyle = '#cc0000'; // Red news banner
         this.ctx.fillRect(0, height - bannerHeight, width, bannerHeight);
         
         // Draw Globe Icon
         const iconY = height - (bannerHeight / 2) - (iconSize / 2);
         drawIconPath(ICONS.GLOBE, padding, iconY, iconSize, '#ffffff');

         this.ctx.fillStyle = '#ffffff';
         this.ctx.textAlign = 'left';
         this.ctx.textBaseline = 'middle';
         // Shift text slightly for icon
         this.ctx.fillText(config.text, padding + iconSize + (padding / 2), height - (bannerHeight / 2));

      } else if (config.template === WatermarkTemplate.CONTACT) {
         // Rounded Box for Contact (WhatsApp Style)
         // Refined padding logic
         const boxPaddingH = fontSize * 0.8; 
         const boxPaddingV = fontSize * 0.4; 
         const iconSize = fontSize * 1.2;
         const gap = fontSize * 0.3; 
         
         // Calculate exact Box dimensions + Extra Buffer
         const boxWidth = boxPaddingH + iconSize + gap + textWidth + boxPaddingH + (fontSize * 0.1);
         const boxHeight = fontSize + (boxPaddingV * 2);
         
         const pos = this.calculatePosition(position, boxWidth, boxHeight, width, height, padding);
         
         // Draw Box (WhatsApp Green)
         this.ctx.fillStyle = '#25D366'; 
         this.ctx.strokeStyle = '#ffffff';
         this.ctx.lineWidth = 2;
         this.roundRect(this.ctx, pos.x, pos.y, boxWidth, boxHeight, boxHeight / 2, true, true);

         // Calculate Vertical Centers
         const centerY = pos.y + (boxHeight / 2);
         const iconX = pos.x + boxPaddingH;
         const iconY = centerY - (iconSize / 2);

         // Draw Phone Icon
         drawIconPath(ICONS.PHONE, iconX, iconY, iconSize, '#ffffff');

         // Draw Text
         this.ctx.fillStyle = '#ffffff';
         this.ctx.textAlign = 'left'; // Force Left Align to prevent text jumping out of box
         this.ctx.textBaseline = 'middle'; // Key for vertical centering
         this.ctx.fillText(config.text, iconX + iconSize + gap, centerY);

      } else if (config.template === WatermarkTemplate.SOCIAL) {
         // Glassmorphism Box
         const boxPaddingH = fontSize * 0.8;
         const boxPaddingV = fontSize * 0.4;
         const iconSize = fontSize * 1.2;
         const gap = fontSize * 0.3;

         const boxWidth = boxPaddingH + iconSize + gap + textWidth + boxPaddingH + (fontSize * 0.1);
         const boxHeight = fontSize + (boxPaddingV * 2);
         
         const pos = this.calculatePosition(position, boxWidth, boxHeight, width, height, padding);
         
         this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
         this.roundRect(this.ctx, pos.x, pos.y, boxWidth, boxHeight, 8, true, false);

         // Calculate Vertical Centers
         const centerY = pos.y + (boxHeight / 2);
         const iconX = pos.x + boxPaddingH;
         const iconY = centerY - (iconSize / 2);

         // Draw At Sign Icon
         drawIconPath(ICONS.AT_SIGN, iconX, iconY, iconSize, '#ffffff');

         this.ctx.fillStyle = '#ffffff';
         this.ctx.textAlign = 'left'; // Force Left Align
         this.ctx.textBaseline = 'middle';
         this.ctx.fillText(config.text, iconX + iconSize + gap, centerY);

      } else {
         // PLAIN Text (Original Logic)
         const pos = this.calculatePosition(position, textWidth, fontSize, width, height, padding);
         this.ctx.textAlign = 'left';
         this.ctx.textBaseline = 'top';
         
         this.ctx.shadowColor = "black";
         this.ctx.shadowBlur = 4;
         this.ctx.lineWidth = 3;
         this.ctx.strokeStyle = 'black';
         this.ctx.strokeText(config.text, pos.x, pos.y);
         
         this.ctx.fillStyle = 'white';
         this.ctx.fillText(config.text, pos.x, pos.y);
      }

    } else if (config.type === WatermarkType.IMAGE && this.watermarkImageElement) {
      const img = this.watermarkImageElement;
      const maxImgHeight = height * 0.15 * config.scale;
      const maxImgWidth = width * 0.25 * config.scale;

      const scale = Math.min(maxImgWidth / img.width, maxImgHeight / img.height);
      const imgW = img.width * scale;
      const imgH = img.height * scale;

      const pos = this.calculatePosition(position, imgW, imgH, width, height, padding);

      this.ctx.drawImage(img, pos.x, pos.y, imgW, imgH);
    }

    this.ctx.restore(); // Restore original state
  }

  private calculatePosition(
    position: WatermarkPosition, 
    objWidth: number, 
    objHeight: number, 
    canvasWidth: number, 
    canvasHeight: number, 
    padding: number
  ): { x: number, y: number } {
    let x = 0;
    let y = 0;

    switch (position) {
      case WatermarkPosition.TOP_LEFT:
        x = padding;
        y = padding;
        break;
      case WatermarkPosition.TOP_RIGHT:
        x = canvasWidth - objWidth - padding;
        y = padding;
        break;
      case WatermarkPosition.BOTTOM_LEFT:
        x = padding;
        y = canvasHeight - objHeight - padding;
        break;
      case WatermarkPosition.BOTTOM_RIGHT:
        x = canvasWidth - objWidth - padding;
        y = canvasHeight - objHeight - padding;
        break;
      case WatermarkPosition.CENTER:
        x = (canvasWidth - objWidth) / 2;
        y = (canvasHeight - objHeight) / 2;
        break;
    }

    return { x, y };
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, fill: boolean, stroke: boolean) {
    if (typeof radius === 'undefined') {
      radius = 5;
    }
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) {
      ctx.fill();
    }
    if (stroke) {
      ctx.stroke();
    }
  }
}