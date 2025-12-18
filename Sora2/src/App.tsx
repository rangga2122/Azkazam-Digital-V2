import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const funnyStatusMessages = [
  "Setiap frame adalah peluang baru untuk bersinar.",
  "Diam bukan berarti berhenti, kadang semesta juga perlu loading.",
  "Kesabaran itu seperti render video: lama, tapi hasilnya bisa bikin senyum.",
  "Ide hebat butuh waktu, sama seperti video ini.",
  "Server lagi olahraga cardio: lari dari satu frame ke frame lainnya.",
  "Mencari ending yang paling dramatis untuk videomu…",
  "Menata pencahayaan biar wajah tokohmu tetap glowing.",
  "Sedang mengatur kamera: no goyang, no blur, no drama.",
  "Mengurangi piksel galau, menambah piksel bahagia.",
  "Mengompres keraguan, mengekspor kepercayaan diri.",
  "Menulis dialog di sela-sela orbit bintang.",
  "Memastikan background nggak kalah cakep dari pemeran utama.",
  "Menambahkan 10% lagi sentuhan sinematik.",
  "Menyinkronkan semesta: audio, visual, dan vibes." 
];

const POLLING_INTERVAL = 10000;
const MAX_SUBMIT_ATTEMPTS = 5;
const SUBMIT_RETRY_DELAY = 3000;

const getDefaultApiBase = () => {
  if (typeof window === 'undefined') return '';
  return '';
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || getDefaultApiBase();

// Map old API paths to new Vercel serverless endpoints
const apiUrl = (p: string) => {
  const pathMap: Record<string, string> = {
    '/api/generate': '/api/soraGenerate',
    '/api/check-status': '/api/soraCheckStatus',
    '/api/test-solver': '/api/soraTestSolver'
  };
  // Check if path starts with any mapped path
  for (const [oldPath, newPath] of Object.entries(pathMap)) {
    if (p === oldPath || p.startsWith(oldPath + '?')) {
      return `${API_BASE}${p.replace(oldPath, newPath)}`;
    }
  }
  return `${API_BASE}${p}`;
};

const promptTemplateGroups = [
  {
    group: 'UGC & Media Sosial',
    items: [
      {
        value: 'ugc-gaya-hidup',
        label: 'UGC Gaya Hidup',
        prompt:
          'Detail Pemeran: Pria/wanita muda, gaya hidup aktif.\nSedang Apa: Menunjukkan penggunaan [NAMA PRODUK] sehari-hari, manfaat utama, ajakan follow/klik link.\nSetting Tempat Dan Suasana: Outdoor kota, cahaya alami, kamera handheld, musik ceria, subtitle dinamis.'
      },
      {
        value: 'unboxing',
        label: 'Pengalaman Unboxing',
        prompt:
          'Detail Pemeran: Content creator ramah.\nSedang Apa: Unboxing [NAMA PRODUK], first impression, highlight fitur dan harga, CTA di akhir.\nSetting Tempat Dan Suasana: Meja kayu estetik, lighting hangat, close-up detail, teks overlay informatif.'
      },
      {
        value: 'ugc-jalanan',
        label: 'UGC Gaya Jalanan',
        prompt:
          'Detail Pemeran: Anak muda casual.\nSedang Apa: Review singkat [NAMA PRODUK] di jalan, keunggulan utama, ajakan coba.\nSetting Tempat Dan Suasana: Street style, gerak cepat, transisi jump cut, tone modern energik.'
      }
    ]
  },
  {
    group: 'Pemasaran & Iklan',
    items: [
      {
        value: 'banner-promosi-video',
        label: 'Banner Promosi',
        prompt:
          'Detail Pemeran: Tidak ada pemeran.\nSedang Apa: Motion graphics promosi [NAMA PRODUK], headline kuat, 3 poin benefit, CTA jelas.\nSetting Tempat Dan Suasana: Latar putih/oranye, tipografi tegas, animasi sederhana, logo dan tagline di akhir.'
      },
      {
        value: 'iklan-tv-sinematik',
        label: 'Iklan TV Sinematik',
        prompt:
          'Detail Pemeran: Pria dan wanita profesional.\nSedang Apa: Iklan TV sinematik [NAMA PRODUK], storytelling singkat, close-up emosional, ending CTA.\nSetting Tempat Dan Suasana: Kantor modern, pencahayaan dramatis, musik inspiratif, transisi sinematik.'
      },
      {
        value: 'produk-unggulan',
        label: 'Video Produk Unggulan',
        prompt:
          'Detail Pemeran: Fokus pada produk.\nSedang Apa: Showcase unggulan [NAMA PRODUK], rotasi 360°, fitur utama, keunggulan dibanding kompetitor.\nSetting Tempat Dan Suasana: Studio minimalis, background netral, lighting lembut, pacing tegas.'
      }
    ]
  },
  {
    group: 'Fotografi Profesional',
    items: [
      {
        value: 'video-studio',
        label: 'Video Studio',
        prompt:
          'Detail Pemeran: Model profesional.\nSedang Apa: Demonstrasi [NAMA PRODUK] di studio, pose elegan, branding kuat, CTA.\nSetting Tempat Dan Suasana: Studio backdrop solid, key light lembut, teks overlay minimal.'
      },
      {
        value: 'potret-sinematik',
        label: 'Potret Sinematik',
        prompt:
          'Detail Pemeran: Satu pemeran.\nSedang Apa: Narasi personal tentang manfaat [NAMA PRODUK], potret close-up.\nSetting Tempat Dan Suasana: Cinematic bokeh, warna hangat, musik lembut, transisi halus.'
      },
      {
        value: 'detail-makro',
        label: 'Detail Makro',
        prompt:
          'Detail Pemeran: Fokus detail produk.\nSedang Apa: Makro shot komponen [NAMA PRODUK], tekstur dan kualitas.\nSetting Tempat Dan Suasana: Studio gelap, rim light, efek partikel halus, suara lembut.'
      }
    ]
  },
  {
    group: 'E-Commerce',
    items: [
      {
        value: 'latar-putih-ecom',
        label: 'Latar Putih E-Com',
        prompt:
          'Detail Pemeran: Tidak ada pemeran.\nSedang Apa: Video e-commerce latar putih untuk [NAMA PRODUK], rotasi 360°, highlight fitur dengan teks, CTA “Beli Sekarang”.\nSetting Tempat Dan Suasana: Latar putih bersih, shadow realistis, pacing cepat, fokus tajam.'
      },
      {
        value: 'penggunaan-kontekstual',
        label: 'Penggunaan Kontekstual',
        prompt:
          'Detail Pemeran: Pengguna nyata.\nSedang Apa: Penggunaan [NAMA PRODUK] dalam konteks sehari-hari, tiga adegan, manfaat jelas, CTA.\nSetting Tempat Dan Suasana: Rumah/kantor, cahaya alami, tone hangat, ambience nyaman.'
      },
      {
        value: 'promosi-diskon',
        label: 'Promosi Diskon',
        prompt:
          'Detail Pemeran: Motion graphics.\nSedang Apa: Pengumuman promo/diskon [NAMA PRODUK], durasi 10–15 detik, countdown singkat, CTA kuat.\nSetting Tempat Dan Suasana: Oranye-putih, tipografi tegas, animasi masuk-keluar cepat, logo brand.'
      }
    ]
  }
];
const promptTemplateMap = Object.fromEntries(
  promptTemplateGroups.flatMap(g => g.items.map(i => [i.value, i.prompt]))
);

function App() {
  const [formData, setFormData] = useState({
    prompt: '',
    duration: '10',
    aspect_ratio: 'landscape',
    files: null
  });
  
  const [viewState, setViewState] = useState('form'); // form, loading, result, error
  const [loadingStatus, setLoadingStatus] = useState('Mengirim permintaan ke server...');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);
  const [jobs, setJobs] = useState(() => {
    try {
      const saved = localStorage.getItem('sora_jobs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  
  const progressBarRef = useRef(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    try {
      localStorage.setItem('sora_jobs', JSON.stringify(jobs));
    } catch {}
  }, [jobs]);

  const formatUuid = (id) => {
    if (!id || typeof id !== 'string') return '-';
    if (id.length <= 10) return id;
    const head = id.slice(0, 10);
    const tail = id.slice(-10);
    return `${head}…${tail}`;
  };

  const truncateText = (t, n = 48) => {
    if (!t) return '';
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
  };

  const statusColor = (s) => {
    switch (s) {
      case 'Queued': return 'bg-amber-100 text-amber-700 border border-amber-200';
      case 'Processing': return 'bg-blue-100 text-blue-700 border border-blue-200';
      case 'Complete': return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
      case 'Error': return 'bg-rose-100 text-rose-700 border border-rose-200';
      default: return 'bg-gray-100 text-gray-700 border border-gray-200';
    }
  };

  const sanitizeError = (msg: any): string => {
    // Handle object errors
    if (msg && typeof msg === 'object') {
      if (msg.message) return sanitizeError(msg.message);
      if (msg.error) return sanitizeError(msg.error);
      try {
        return JSON.stringify(msg);
      } catch {
        return 'Terjadi kesalahan. Silakan coba lagi.';
      }
    }
    const t = String(msg || '');
    if (!t || t === '[object Object]') {
      return 'Terjadi kesalahan. Silakan coba lagi.';
    }
    const lower = t.toLowerCase();
    if (lower.includes('captcha') || lower.includes('turnstile') || lower.includes('token')) {
      return 'Permintaan tidak dapat diproses saat ini. Silakan coba lagi.';
    }
    if (lower.includes('network') || lower.includes('fetch') || lower.includes('timeout')) {
      return 'Gagal terhubung ke server. Periksa koneksi internet Anda.';
    }
    return t;
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  };

  const removeJob = (id) => {
    setJobs(prev => prev.filter(j => j.id !== id));
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleTemplateSelect = (e) => {
    const v = e.target.value;
    if (!v) return;
    const p = promptTemplateMap[v];
    if (p) setFormData(prev => ({ ...prev, prompt: p }));
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFormData(prev => ({ ...prev, files: file }));
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
    }
  };

  const removeFile = () => {
    setFormData(prev => ({ ...prev, files: null }));
    setPreviewUrl(null);
    const fileInput = document.getElementById('files');
    if (fileInput) fileInput.value = '';
  };

  const resetUI = () => {
    setViewState('form');
    setFormData(prev => ({ ...prev, prompt: '', files: null }));
    setPreviewUrl(null);
    setProgress(0);
    setErrorMsg('');
    setVideoUrl('');
  };

  const animateProgress = (startPercent, endPercent, duration) => {
    return new Promise(resolve => {
      let startTime = null;
      const step = (timestamp) => {
        if (!startTime) startTime = timestamp;
        const progressTime = Math.min((timestamp - startTime) / duration, 1);
        const currentPercent = Math.floor(progressTime * (endPercent - startPercent) + startPercent);
        
        setProgress(currentPercent);
        
        if (progressTime < 1) {
          requestAnimationFrame(step);
        } else {
          setProgress(endPercent);
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  };

  const pollForVideo = async (uuid) => {
    let attempt = 1;
    let currentProgress = 0;

    setJobs(prev => prev.map(j => j.id === uuid ? { ...j, status: 'Processing' } : j));
    while (true) {
      const statusIndex = (attempt - 1) % funnyStatusMessages.length;
      setLoadingStatus(funnyStatusMessages[statusIndex]);

      try {
        const response = await axios.get(apiUrl(`/api/check-status?uuid=${encodeURIComponent(uuid)}`));
        const data = response.data;

        if (data.status === 'complete') {
          await animateProgress(currentProgress, 100, 500);
          setLoadingStatus('Video selesai!');
          await new Promise(resolve => setTimeout(resolve, 500));
          setVideoUrl(data.url);
          setJobs(prev => prev.map(j => j.id === uuid ? { ...j, status: 'Complete', url: data.url } : j));
          setViewState('result');
          return;
        } else if (data.status === 'error') {
          setErrorMsg(sanitizeError(data.message) || 'API gagal memproses video.');
          setJobs(prev => prev.map(j => j.id === uuid ? { ...j, status: 'Error', error: data.message || 'Gagal' } : j));
          setViewState('error');
          return;
        } else if (data.status === 'processing') {
          let startPercent = currentProgress;
          let targetPercent = 100 * (1 - Math.exp(-attempt / 10));
          let endPercent = Math.min(Math.floor(targetPercent), 99);
          if (endPercent < startPercent) endPercent = startPercent;
          
          await animateProgress(startPercent, endPercent, POLLING_INTERVAL);
          currentProgress = endPercent;
        }
      } catch (err: any) {
        const errMsg = err?.response?.data?.error || err?.response?.data?.message || err?.message || err;
        setErrorMsg(sanitizeError(errMsg) || 'Gagal saat polling status.');
        setViewState('error');
        return;
      }
      attempt++;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setViewState('loading');
    setProgress(0);
    setLoadingStatus('Mengirim permintaan ke server...');

    let lastError = 'Gagal mengirim form.';
    
    // Helper to convert file to base64
    const fileToBase64 = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
      });
    };
    
    // Prepare JSON payload with optional base64 image
    const submitPayload: Record<string, any> = {
      prompt: formData.prompt,
      duration: formData.duration,
      aspect_ratio: formData.aspect_ratio,
      model: 'sora-2-free',
      provider: 'openai',
      resolution: 'small',
      user_agent: navigator.userAgent || ''
    };
    
    // Convert image to base64 if provided
    if (formData.files) {
      try {
        setLoadingStatus('Mengkonversi gambar...');
        const base64Image = await fileToBase64(formData.files);
        submitPayload.image_base64 = base64Image;
        submitPayload.image_name = formData.files.name;
      } catch (err) {
        console.error('Failed to convert image:', err);
      }
    }
    
    // Try to get turnstile token
    try {
      const s = await axios.get(apiUrl('/api/test-solver'));
      if (s.data?.success && s.data?.token) {
        submitPayload.turnstile_token = s.data.token;
        if (s.data?.userAgent) submitPayload.user_agent = s.data.userAgent;
      }
    } catch {}
    
    for (let attempt = 1; attempt <= MAX_SUBMIT_ATTEMPTS; attempt++) {
      try {
        setLoadingStatus('Mengirim permintaan ke server...');
        const response = await axios.post(apiUrl('/api/generate'), submitPayload, {
          headers: { 'Content-Type': 'application/json' },
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        });

        if (response.data.success && response.data.uuid) {
          setLoadingStatus('Berhasil memulai! Menunggu video diproses...');
          const job = {
            id: response.data.uuid,
            prompt: formData.prompt,
            model: 'sora-2-free',
            duration: formData.duration,
            aspect_ratio: formData.aspect_ratio,
            status: 'Queued',
            url: '',
            createdAt: Date.now()
          };
          setJobs(prev => [job, ...prev]);
          pollForVideo(response.data.uuid);
          return;
        }

        lastError = response.data.error || 'Gagal mendapatkan UUID.';
        break; // Jika sukses false tapi bukan network error, stop retry
        
      } catch (err: any) {
        lastError = err?.response?.data?.error || err?.response?.data?.message || err?.message || err;
        const text = String(lastError || '').toLowerCase();
        if (text.includes('captcha') || text.includes('turnstile')) {
          try {
            setLoadingStatus('Sedang Proses Peracikan');
            const s = await axios.get(apiUrl('/api/test-solver'));
            if (s.data?.success && s.data?.token) {
              submitPayload.turnstile_token = s.data.token;
              if (s.data?.userAgent) submitPayload.user_agent = s.data.userAgent;
            }
          } catch {}
        }
        setLoadingStatus('Sedang Proses Peracikan');
        if (attempt < MAX_SUBMIT_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, SUBMIT_RETRY_DELAY));
        }
      }
    }
    
    setErrorMsg(sanitizeError(lastError) || 'Permintaan gagal diproses. Silakan coba lagi.');
    setViewState('error');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-inter selection:bg-orange-100 selection:text-orange-900">
      {/* Background accents */}
      <div className="fixed inset-0 -z-10 bg-white"></div>
      <div className="fixed top-0 left-0 w-full h-[500px] bg-gradient-to-b from-orange-50/50 to-transparent -z-10"></div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 mb-4">
            Video Generator <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-amber-500">Sora 2</span>
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Ubah ide menjadi video sinematik dalam hitungan menit. <span className="font-medium text-orange-600">1 Video estimasi 4-6 menit.</span>
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT COLUMN: FORM (lg:col-span-5) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
              <div className="p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="hidden">
                <label className="block text-sm font-bold text-slate-900">Template Cepat</label>
                <div className="relative">
                  <select
                    aria-label="Template Cepat"
                    onChange={handleTemplateSelect}
                    className="w-full appearance-none bg-white border border-slate-200 rounded-xl p-3 pr-10 text-sm text-slate-700 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                    defaultValue=""
                    disabled={viewState === 'loading'}
                  >
                    <option value="">Template Cepat...</option>
                    {promptTemplateGroups.map(g => (
                      <optgroup key={g.group} label={g.group}>
                        {g.items.map(i => (
                          <option key={i.value} value={i.value}>{i.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              </div>
              {/* Prompt */}
              <div className="space-y-3">
                <label htmlFor="prompt" className="block text-sm font-bold text-slate-900">
                  Prompt Video
                </label>
                    <div className="relative">
                      <textarea 
                        id="prompt" 
                        name="prompt" 
                        value={formData.prompt}
                        onChange={handleInputChange}
                        className="w-full bg-slate-50 border-slate-200 rounded-xl p-4 min-h-[140px] focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all resize-none text-base placeholder:text-slate-400 outline-none" 
                        required
                        placeholder="Jelaskan video yang ingin Anda buat..."
                        disabled={viewState === 'loading'}
                      ></textarea>
                      <div className="absolute bottom-3 right-3 text-xs text-slate-400 pointer-events-none">
                        AI Powered
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      💡 Tips: "Detail Pemeran - Sedang Apa - Setting Tempat Dan Suasana"
                    </p>
                  </div>

                  {/* Image Upload */}
                  <div className="space-y-3">
                    <label className="block text-sm font-bold text-slate-900">
                      Referensi Gaya Visual (Opsional)
                    </label>
                    
                    {!previewUrl ? (
                      <div className="relative group">
                        <input 
                          type="file" 
                          id="files" 
                          name="files" 
                          accept="image/*"
                          onChange={handleFileChange}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                          disabled={viewState === 'loading'}
                        />
                        <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center transition-all group-hover:border-orange-400 group-hover:bg-orange-50/30">
                          <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <p className="text-sm font-medium text-slate-700">Klik atau drop gambar di sini</p>
                          <p className="text-xs text-slate-400 mt-1">Mendukung JPG, PNG</p>
                        </div>
                      </div>
                    ) : (
                      <div className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-sm group">
                        <img src={previewUrl} alt="Preview" className="w-full h-64 object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button 
                            type="button" 
                            onClick={removeFile} 
                            className="bg-white/20 backdrop-blur-md text-white border border-white/50 px-4 py-2 rounded-full text-sm font-medium hover:bg-red-500/80 hover:border-red-500 transition-colors"
                          >
                            Hapus Gambar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Settings Grid */}
                  <div className="grid grid-cols-2 gap-6">
                    {/* Duration */}
                    <div className="space-y-3">
                      <label className="block text-sm font-bold text-slate-900">Durasi</label>
                      <div className="flex bg-slate-100 p-1 rounded-xl">
                        {['10', '15'].map((dur) => (
                          <label key={dur} className={`flex-1 relative cursor-pointer py-2 text-center text-sm font-medium rounded-lg transition-all ${formData.duration === dur ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                            <input 
                              type="radio" 
                              name="duration" 
                              value={dur} 
                              checked={formData.duration === dur}
                              onChange={handleInputChange}
                              className="sr-only"
                              disabled={viewState === 'loading'}
                            />
                            {dur}s
                          </label>
                        ))}
                      </div>
                    </div>
                    {/* Ratio */}
                    <div className="space-y-3">
                      <label className="block text-sm font-bold text-slate-900">Rasio</label>
                      <div className="flex bg-slate-100 p-1 rounded-xl">
                        {[
                          { val: 'landscape', label: '16:9' },
                          { val: 'portrait', label: '9:16' }
                        ].map((ar) => (
                          <label key={ar.val} className={`flex-1 relative cursor-pointer py-2 text-center text-sm font-medium rounded-lg transition-all ${formData.aspect_ratio === ar.val ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                            <input 
                              type="radio" 
                              name="aspect_ratio" 
                              value={ar.val} 
                              checked={formData.aspect_ratio === ar.val}
                              onChange={handleInputChange}
                              className="sr-only"
                              disabled={viewState === 'loading'}
                            />
                            {ar.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button 
                    type="submit" 
                    disabled={viewState === 'loading'}
                    className={`w-full py-4 text-white font-bold rounded-xl shadow-lg transition-all duration-200 ${viewState === 'loading' ? 'bg-orange-300 cursor-not-allowed' : 'bg-gradient-to-r from-orange-500 to-amber-500 shadow-orange-500/30 hover:shadow-orange-500/50 hover:scale-[1.02] active:scale-[0.98]'}`}
                  >
                    {viewState === 'loading' ? 'Sedang Memproses...' : '✨ Generate Video'}
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: RESULT (lg:col-span-7) */}
          <div className="lg:col-span-7">
            <div className="bg-white rounded-3xl shadow-2xl shadow-slate-200/50 border border-slate-100 overflow-hidden min-h-[600px] flex flex-col relative">
              
              {/* Placeholder */}
              {viewState === 'form' && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50">
                  <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mb-6 animate-pulse">
                    <svg className="w-10 h-10 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Area Preview Video</h3>
                  <p className="text-slate-500 max-w-md mx-auto">
                    Hasil video AI Anda akan muncul di sini dengan kualitas tinggi. Silakan isi form di sebelah kiri untuk memulai.
                  </p>
                </div>
              )}

              {/* Loading */}
              {viewState === 'loading' && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-8 bg-slate-900 text-white relative overflow-hidden">
                  {/* Abstract Background Animation */}
                  <div className="absolute inset-0 opacity-20">
                     <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-orange-500 rounded-full blur-[100px] animate-pulse"></div>
                  </div>

                  <div className="relative z-10">
                    <div className="relative w-24 h-24 mx-auto mb-8">
                      <div className="absolute inset-0 border-4 border-slate-700 rounded-full"></div>
                      <div className="absolute inset-0 border-4 border-orange-500 rounded-full border-t-transparent animate-spin"></div>
                      <div className="absolute inset-0 flex items-center justify-center font-bold text-xl">
                        {progress}%
                      </div>
                    </div>
                    
                    <h3 className="text-2xl font-bold tracking-tight mb-2">Sedang Meracik Video...</h3>
                    <p className="text-slate-400 text-lg max-w-md mx-auto animate-pulse">
                      "{loadingStatus}"
                    </p>
                  </div>
                </div>
              )}

              {/* Result */}
              {viewState === 'result' && (
                <div className="flex-1 flex flex-col bg-slate-900">
                  <div className="flex-1 relative flex items-center justify-center bg-black">
                    <video 
                      className="max-w-full max-h-[600px] w-auto h-auto shadow-2xl" 
                      controls 
                      autoPlay 
                      loop
                    >
                      <source src={videoUrl} type="video/mp4" />
                      Browser kamu tidak mendukung tag video.
                    </video>
                  </div>
                  <div className="p-6 bg-white border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <a 
                      href={videoUrl} 
                      target="_blank" 
                      rel="noreferrer" 
                      download 
                      className="flex items-center justify-center py-3 px-6 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl transition-colors shadow-lg shadow-orange-500/20"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download Video
                    </a>
                    <button 
                      onClick={resetUI} 
                      type="button" 
                      className="flex items-center justify-center py-3 px-6 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                    >
                      Buat Video Lain
                    </button>
                  </div>
                </div>
              )}

              {/* Error */}
              {viewState === 'error' && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-red-50/50">
                  <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-6">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-red-900 mb-2">Gagal Membuat Video</h3>
                  <p className="text-red-600 max-w-md mx-auto mb-8">{errorMsg}</p>
                  <button 
                    onClick={resetUI} 
                    type="button" 
                    className="py-3 px-8 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg shadow-red-500/30 transition-colors"
                  >
                    Coba Lagi
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* History List (Hidden as requested) */}
        <div className="hidden">
           {/* Content kept for state preservation but hidden */}
           {jobs.map(job => (
             <div key={job.id}>{job.id}</div>
           ))}
        </div>
      </div>
    </div>
  );
}

export default App;
