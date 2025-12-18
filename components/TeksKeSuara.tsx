import React, { useCallback, useMemo, useRef, useState } from 'react';

const defaultApiKeys = [
  'AIzaSyD-KPTQwHxAU-JFaAwLWG0MXv0TwEa_mrI',
  'AIzaSyCFK4B49JWxXYQudxIDwgOfDZ5eTuQUnAY',
  'AIzaSyBFvrDAyGwnJramyq-dm6I-23-WgzNK0qc',
  'AIzaSyD722wWYLk00l10r5uUpO_wHpyPyg8iSn4',
  'AIzaSyDWeRv9F9W6DSCgAN343nN9XmWSNK62vs8',
  'AIzaSyDhCbHunNRxpIoFrtnSNcPpQStkCK_vcvg'
];

const voices = [
  { name: 'Zephyr', description: 'Sari - Cewek, Cerah & Jelas', displayName: 'Sari' },
  { name: 'Puck', description: 'Budi - Cowok, Ceria & Semangat', displayName: 'Budi' },
  { name: 'Charon', description: 'Andi - Cowok, Informatif & Formal', displayName: 'Andi' },
  { name: 'Kore', description: 'Dewi - Cewek, Tegas & Kuat', displayName: 'Dewi' },
  { name: 'Fenrir', description: 'Rudi - Cowok, Mudah Bersemangat', displayName: 'Rudi' },
  { name: 'Leda', description: 'Sinta - Cewek, Muda & Segar', displayName: 'Sinta' },
  { name: 'Orus', description: 'Agus - Cowok, Tegas & Dewasa', displayName: 'Agus' },
  { name: 'Aoede', description: 'Maya - Cewek, Ringan & Santai', displayName: 'Maya' },
  { name: 'Callirrhoe', description: 'Rina - Cewek, Mudah Bergaul', displayName: 'Rina' },
  { name: 'Enceladus', description: 'Dian - Cewek, Berbisik & Lembut', displayName: 'Dian' },
  { name: 'Iapetus', description: 'Bayu - Cowok, Jernih & Tegas', displayName: 'Bayu' },
  { name: 'Umbriel', description: 'Indah - Cewek, Ramah & Santai', displayName: 'Indah' },
  { name: 'Algieba', description: 'Lestari - Cewek, Halus & Lembut', displayName: 'Lestari' },
  { name: 'Gacrux', description: 'Hendra - Cowok, Dewasa & Matang', displayName: 'Hendra' },
  { name: 'Pulcherrima', description: 'Fitri - Cewek, Terus Terang', displayName: 'Fitri' },
  { name: 'Achird', description: 'Joko - Cowok, Ramah & Bersahabat', displayName: 'Joko' },
  { name: 'Zubenelgenubi', description: 'Wati - Cewek, Kasual & Santai', displayName: 'Wati' },
  { name: 'Vindemiatrix', description: 'Putri - Cewek, Lembut & Tenang', displayName: 'Putri' },
  { name: 'Sadachbia', description: 'Eko - Cowok, Hidup & Bersemangat', displayName: 'Eko' },
  { name: 'Sulafat', description: 'Ayu - Cewek, Hangat & Menenangkan', displayName: 'Ayu' },
];

const styles = [
  'Ucapkan dengan lembut:',
  'Katakan dengan gembira:',
  'Bacakan dengan nada sedih:',
  'Berbisik:',
  'Bicaralah perlahan:',
  'Baca seperti penyiar berita:',
  'Ucapkan dengan suara robot:',
  'Katakan dengan antusias:',
  'Baca dengan nada datar:',
  'Ucapkan dengan nada marah:',
  'Bicaralah dengan cepat:',
  'Nyanyikan teks ini:',
];

function base64ToArrayBuffer(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes.buffer;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

function pcmToWav(pcmData: ArrayBuffer, sampleRate: number) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const dataSize = pcmData.byteLength;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const pcm16 = new Int16Array(pcmData);
  for (let i = 0; i < pcm16.length; i++) view.setInt16(44 + i * 2, pcm16[i], true);

  return new Blob([buffer], { type: 'audio/wav' });
}

const TeksKeSuara: React.FC = () => {
  const [text, setText] = useState('');
  const [voiceName, setVoiceName] = useState('');
  const [temperature, setTemperature] = useState(1.0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stylePrefix, setStylePrefix] = useState('');
  const apiKeyInputRef = useRef<HTMLTextAreaElement | null>(null);
  const keyIndexRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const customKeys = useMemo(() => {
    const raw = (apiKeyInputRef.current?.value || '').trim();
    if (!raw) return [] as string[];
    return raw.split(/\r?\n|,|;/).map(s => s.trim()).filter(Boolean);
  }, [apiKeyInputRef.current?.value]);

  const activeKeys = customKeys.length ? customKeys : defaultApiKeys;

  const getNextApiKey = useCallback(() => {
    const key = activeKeys[keyIndexRef.current % activeKeys.length];
    keyIndexRef.current = (keyIndexRef.current + 1) % activeKeys.length;
    return key;
  }, [activeKeys]);

  const applyStyleToText = useCallback((prefix: string) => {
    setStylePrefix('');
    if (!prefix) return;
    let currentText = text;
    const isSsml = currentText.trim().startsWith('<speak>');
    if (isSsml) currentText = currentText.replace(/<\/?speak>/g, '').trim();
    let cleanText = currentText;
    styles.forEach(s => {
      if (cleanText.startsWith(s)) cleanText = cleanText.substring(s.length).trim();
    });
    let newText = `${prefix} ${cleanText}`.trim();
    if (isSsml) newText = `<speak>\n  ${newText}\n</speak>`;
    setText(newText);
  }, [text]);

  const makeApiCall = useCallback(async (payload: any) => {
    let attempts = 0;
    let delay = 1000;
    const maxAttempts = activeKeys.length * 2;
    while (attempts < maxAttempts) {
      const currentApiKey = getNextApiKey();
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${currentApiKey}`;
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (response.ok) {
          return await response.json();
        }
        if (response.status === 429 || response.status >= 500) {
          attempts++;
          await new Promise(r => setTimeout(r, delay));
          delay = Math.min(delay * 1.5, 5000);
          continue;
        } else {
          let errorText = `HTTP error! Status: ${response.status}`;
          try {
            const errorData = await response.json();
            errorText = (errorData?.error?.message) || JSON.stringify(errorData);
          } catch (e) {
            try { errorText = await response.text(); } catch {}
          }
          attempts++;
          setMessage(`❌ ${errorText}`);
          continue;
        }
      } catch (networkError: any) {
        attempts++;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
    }
    throw new Error('Semua API key telah dicoba namun gagal. Silakan coba lagi nanti.');
  }, [activeKeys, getNextApiKey]);

  const generateSpeech = useCallback(async () => {
    setMessage(null);
    setAudioUrl(null);
    if (!text.trim()) { setMessage('Silakan masukkan teks terlebih dahulu.'); return; }
    if (!voiceName) { setMessage('Silakan pilih suara terlebih dahulu.'); return; }
    setLoading(true);
    try {
      const payload = {
        contents: [{ parts: [{ text }]}],
        generationConfig: {
          temperature,
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
        },
        model: 'gemini-2.5-flash-preview-tts',
      };
      const result = await makeApiCall(payload);
      const part = result?.candidates?.[0]?.content?.parts?.[0];
      const audioData = part?.inlineData?.data;
      const mimeType = part?.inlineData?.mimeType;
      if (audioData && mimeType && mimeType.startsWith('audio/')) {
        const sampleRateMatch = (mimeType as string).match(/rate=(\d+)/);
        const sampleRate = sampleRateMatch ? parseInt(sampleRateMatch[1], 10) : 24000;
        const pcmBuffer = base64ToArrayBuffer(audioData);
        const wavBlob = pcmToWav(pcmBuffer, sampleRate);
        const url = URL.createObjectURL(wavBlob);
        setAudioUrl(url);
        setMessage('🎉 Audio berhasil dibuat! Klik play untuk mendengarkan.');
        setTimeout(() => { try { audioRef.current?.play(); } catch {} }, 0);
      } else {
        throw new Error('Struktur respons audio tidak valid. Cek kembali format SSML atau teks Anda.');
      }
    } catch (e: any) {
      setMessage(`❌ ${e?.message || 'Terjadi kesalahan.'}`);
    } finally {
      setLoading(false);
    }
  }, [text, voiceName, temperature, makeApiCall]);

  return (
    <div className="w-full">
      <div className="bg-white rounded-2xl p-6 md:p-8 space-y-6 border border-slate-200 shadow-[0_20px_25px_-5px_rgba(234,88,12,0.1),0_10px_10px_-5px_rgba(234,88,12,0.04)]">
        <div className="text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white border border-slate-200 text-orange-600">🎙️</span>
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white border border-slate-200 text-orange-600">🔊</span>
          </div>
          <p className="text-gray-600 mt-2 flex items-center justify-center gap-2">
            <span className="text-orange-500">✨</span>
            Ubah teks menjadi suara dengan gaya dan intonasi yang Anda inginkan
            <span className="text-orange-500">✨</span>
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <span className="text-orange-500">🔑</span>
              API Key (Opsional)
            </label>
            <textarea
              ref={apiKeyInputRef}
              rows={3}
              className="w-full p-3 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
              placeholder="Masukkan satu atau beberapa API key. Pisahkan dengan koma atau baris baru."
            />
            <p className="text-xs text-gray-500 mt-1">Jika kolom ini kosong, sistem akan memakai daftar API key bawaan.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <span className="text-orange-500">🎨</span>
              Pilih Gaya Intonasi (Opsional)
            </label>
            <select
              value={stylePrefix}
              onChange={(e) => { const val = e.target.value; applyStyleToText(val); setStylePrefix(''); }}
              className="w-full p-3 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
            >
              <option value="">Pilih Gaya Intonasi...</option>
              {styles.map((s, idx) => (
                <option key={idx} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <span className="text-orange-500">✍️</span>
              Teks Anda
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              className="w-full p-3 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
              placeholder="Masukkan teks yang ingin diubah menjadi suara di sini. Anda bisa menggunakan tag SSML seperti <break time='1s'/> untuk jeda."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <span className="text-orange-500">👤</span>
              Pilih Suara
            </label>
            <select
              value={voiceName}
              onChange={(e) => setVoiceName(e.target.value)}
              className="w-full p-3 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
            >
              <option value="">Pilih suara...</option>
              {voices.map(v => (
                <option key={v.name} value={v.name}>{v.description}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <span className="text-orange-500">🌡️</span>
              Temperatur: <span className="font-semibold text-orange-600">{temperature.toFixed(1)}</span>
            </label>
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full h-2 bg-white rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 pt-2">
          <button
            onClick={generateSpeech}
            disabled={loading}
            className={`w-full max-w-xs flex items-center justify-center gap-2 text-white font-semibold py-3 px-6 rounded-lg transition shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 transform ${loading ? 'opacity-60 cursor-not-allowed bg-orange-600' : 'hover:scale-105 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800'}`}
          >
            <span className="text-xl">▶️</span>
            <span>Buat Suara</span>
            <span>✨</span>
          </button>
        </div>
        <div className="flex justify-center mt-2">
          <div className={`border-4 border-orange-200 border-t-orange-600 rounded-full w-[30px] h-[30px] animate-spin ${loading ? '' : 'hidden'}`}></div>
        </div>

        <div className={`mt-6 ${audioUrl ? '' : 'hidden'}`}>
          <p className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <span className="text-orange-500">🎧</span>
            Hasil Audio:
          </p>
          <audio ref={audioRef} controls src={audioUrl ?? undefined} className="w-full rounded-lg border-2 border-slate-200" />
        </div>
        <div className={`mt-4 text-center font-medium ${message ? '' : 'hidden'} ${message?.startsWith('🎉') ? 'text-green-600' : 'text-red-500'}`}>{message}</div>
      </div>
    </div>
  );
};

export default TeksKeSuara;
