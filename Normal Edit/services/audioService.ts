declare global {
    interface Window {
        // Fix: 'webkitAudioContext' is referenced directly or indirectly in its own type annotation.
        // The original `typeof AudioContext` created a circular reference with the `AudioContext` variable below.
        // Providing an explicit constructor type breaks this circular dependency.
        webkitAudioContext: new (contextOptions?: AudioContextOptions) => AudioContext;
    }
}

const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
};

const pcmToWav = (pcmData: ArrayBuffer, sampleRate: number): Blob => {
    const buffer = new ArrayBuffer(44 + pcmData.byteLength);
    const view = new DataView(buffer);
    const writeString = (view: DataView, offset: number, string: string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcmData.byteLength, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // Mono
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byteRate
    view.setUint16(32, 2, true); // blockAlign
    view.setUint16(34, 16, true); // bitsPerSample
    writeString(view, 36, 'data');
    view.setUint32(40, pcmData.byteLength, true);
    new Uint8Array(buffer, 44).set(new Uint8Array(pcmData));
    return new Blob([view], { type: 'audio/wav' });
};

const audioBufferToWav = (buffer: AudioBuffer): Blob => {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const bitDepth = 16;
    const result = buffer.getChannelData(0); // Assuming mono
    const dataLength = result.length * (bitDepth / 8);
    const bufferLength = 44 + dataLength;
    const wavBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(wavBuffer);

    const writeString = (view: DataView, offset: number, string: string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    let offset = 0;
    writeString(view, offset, 'RIFF'); offset += 4;
    view.setUint32(offset, 36 + dataLength, true); offset += 4;
    writeString(view, offset, 'WAVE'); offset += 4;
    writeString(view, offset, 'fmt '); offset += 4;
    view.setUint32(offset, 16, true); offset += 4;
    view.setUint16(offset, 1, true); offset += 2;
    view.setUint16(offset, numChannels, true); offset += 2;
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, sampleRate * numChannels * (bitDepth / 8), true); offset += 4;
    view.setUint16(offset, numChannels * (bitDepth / 8), true); offset += 2;
    view.setUint16(offset, bitDepth, true); offset += 2;
    writeString(view, offset, 'data'); offset += 4;
    view.setUint32(offset, dataLength, true); offset += 4;

    for (let i = 0; i < result.length; i++, offset += 2) {
        let s = Math.max(-1, Math.min(1, result[i]));
        s = s < 0 ? s * 0x8000 : s * 0x7FFF;
        view.setInt16(offset, s, true);
    }
    return new Blob([view], { type: 'audio/wav' });
};

// Overloaded function for processing Float32Array audio data
export async function processAudio(channelData: Float32Array, sampleRate: number): Promise<ArrayBuffer>;
// Original function for processing base64 audio data
export async function processAudio(base64Data: string, mimeType: string, style: string, voiceName: string): Promise<string>;

export async function processAudio(
    input: Float32Array | string, 
    param2: number | string, 
    style?: string, 
    voiceName?: string
): Promise<ArrayBuffer | string> {
    // Handle Float32Array input (for TTS generation)
    if (input instanceof Float32Array) {
        const sampleRate = param2 as number;
        const buffer = new ArrayBuffer(44 + input.length * 2);
        const view = new DataView(buffer);
        
        const writeString = (view: DataView, offset: number, string: string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };
        
        // WAV header
        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + input.length * 2, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // PCM
        view.setUint16(22, 1, true); // Mono
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(view, 36, 'data');
        view.setUint32(40, input.length * 2, true);
        
        // Convert Float32Array to 16-bit PCM
        for (let i = 0; i < input.length; i++) {
            const sample = Math.max(-1, Math.min(1, input[i]));
            const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            view.setInt16(44 + i * 2, intSample, true);
        }
        
        return buffer;
    }
    
    // Handle string input (original function)
    const base64Data = input as string;
    const mimeType = param2 as string;
    const sampleRateMatch = mimeType.match(/rate=(\d+)/);
    if (!sampleRateMatch) throw new Error("Sample rate not found in mimeType.");
    const sampleRate = parseInt(sampleRateMatch[1], 10);

    const pcmData = base64ToArrayBuffer(base64Data);
    const wavBlob = pcmToWav(pcmData, sampleRate);

    const arrayBuffer = await wavBlob.arrayBuffer();
    let initialAudioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    
    // Create an offline context to apply effects
    const offlineCtx = new OfflineAudioContext(initialAudioBuffer.numberOfChannels, initialAudioBuffer.length, initialAudioBuffer.sampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = initialAudioBuffer;
    let currentNode: AudioNode = source;

    if (voiceName === 'leda') {
        source.playbackRate.value = 1.3;
    }

    if (style === 'berbisik') {
        const compressor = offlineCtx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-40, 0);
        compressor.knee.setValueAtTime(30, 0);
        compressor.ratio.setValueAtTime(12, 0);
        compressor.attack.setValueAtTime(0.003, 0);
        compressor.release.setValueAtTime(0.25, 0);
        currentNode.connect(compressor);
        currentNode = compressor;
    }

    const gainNode = offlineCtx.createGain();
    if (style === 'teriak') {
        gainNode.gain.value = 1.5;
    } else if (style === 'berbisik') {
        gainNode.gain.value = 2.5;
    }
    currentNode.connect(gainNode);
    gainNode.connect(offlineCtx.destination);
    
    source.start();
    const renderedBuffer = await offlineCtx.startRendering();

    const finalWavBlob = audioBufferToWav(renderedBuffer);
    return URL.createObjectURL(finalWavBlob);
}