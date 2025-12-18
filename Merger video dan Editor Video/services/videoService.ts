export { 
  initializeFFmpeg,
  getVideoDuration,
  getAudioDuration,
  mergeVideoWithAudio,
  mergeMultipleVideosWithAudio,
  mergeMultipleVideosWithAudioMixOriginal,
  mergeMultipleVideosWithAudioWithWatermark,
  mergeMultipleVideosWithAudioWithWatermarkMixOriginal,
  addWordByWordSubtitles,
  composeVideoWithOverlays,
} from '../../Normal Edit/services/videoService';

export type { 
  WatermarkOptions,
} from '../../Normal Edit/services/videoService';