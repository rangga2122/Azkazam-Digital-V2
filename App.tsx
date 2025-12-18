
import React, { useState, useCallback, useEffect, useRef } from 'react';
import GenerationForm from './components/GenerationForm';
import VideoDisplay from './components/VideoDisplay';
import ImageGenerationForm from './components/ImageGenerationForm';
import ImageDisplay from './components/ImageDisplay';
import { AspectRatio, GenerateOptions, GenerationState, GenerationStatus, LipsyncResult, Resolution } from './types';
import { generateVeoVideo } from './services/veoSandboxApi';
import { ArrowRightOnRectangleIcon, UsersIcon, VideoIcon, SparklesIcon, DownloadIcon, WhatsAppIcon, PhotoIcon, PhotoshootIcon, AdStudioIcon, LockClosedIcon, ChartBarIcon, XMarkIcon, ArrowPathIcon } from './components/icons';
import { mergeMultipleVideosWithAudioMixOriginal, mergeMultipleVideosWithAudio, getVideoDuration } from './Normal Edit/services/videoService';
import { AuthService, User } from './services/authService';
import LoginPage from './components/LoginPage';
import AdminUserModal from './components/AdminUserModal';
import { ReportingService } from './services/reportingService';
import { supabase, isSupabaseEnabled } from './services/supabaseClient';
import { generateImage, generateImagePromptOnly } from './services/imageSandboxApi';
import AiPhotoshoot, { AiPhotoshootRef } from './components/AiPhotoshoot';
import AiBannerProduk from './components/AiBannerProduk';
import StudioIklan, { StudioIklanRef } from './components/StudioIklan';
import TeksKeSuara from './components/TeksKeSuara';
import EditorNarasiPage from './studio-gabung-video-ai/App';
import Lipsync from './components/Lipsync';
import CinemaAI from './components/CinemaAI';
import CaptionScriptLipsync from './components/CaptionScriptLipsync';
import UGCHandApp from './Ugc Hand/App';
import KontenBelajarAnak from './konten-belajar-anak/App';
import NanoBananaPro from './components/NanoBananaPro';
import TanyaBangVidgoApp from './Tanya Bang Vidgo/App';
import BuatCeritaAnak from './buat-cerita/App';

const CONCURRENT_LIMIT = 2;
// Token diatur oleh Admin melalui AdminUserModal dan disimpan lokal

interface Job {
    id: string;
    options: GenerateOptions;
    state: GenerationState;
    retryCount?: number;
}

const MAX_VIDEO_RETRY_COUNT = 10;

const App: React.FC = () => {
    // --- AUTH STATE ---
    // Pastikan load user terbaru saat mount untuk sinkronisasi kredit/role
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [showAdminModal, setShowAdminModal] = useState(false);

    useEffect(() => {
        (async () => {
            const user = await AuthService.getCurrentUser();
            setCurrentUser(user);
        })();
    }, []);

    // Realtime sync: jika baris users untuk user ini berubah di Supabase, sinkronkan sesi lokal.
    useEffect(() => {
        if (!isSupabaseEnabled || !supabase || !currentUser?.id) return;
        const channel = supabase.channel(`user-session-${currentUser.id}`);
        channel.on('postgres_changes', { event: '*', schema: 'public', table: 'users', filter: `id=eq.${currentUser.id}` }, async () => {
            const refreshed = await AuthService.getCurrentUser();
            if (refreshed) setCurrentUser(refreshed);
        });
        channel.subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentUser?.id]);

    // --- APP STATE ---
    const [activeJobId, setActiveJobId] = useState<string | null>(null);
    const [jobs, setJobs] = useState<Job[]>([]);
    const [activeFeature, setActiveFeature] = useState<'dashboard' | 'video' | 'image' | 'cinema' | 'photoshoot' | 'iklan' | 'lipsync' | 'tts' | 'banner' | 'ugccaption' | 'ugchand' | 'editornarasi' | 'kontenbelajaranak' | 'nanobananapro' | 'tanyabangvidgo' | 'buatceritaanak'>("dashboard");
    const [sessionWarn, setSessionWarn] = useState<boolean>(false);
    const [sessionRemainingMin, setSessionRemainingMin] = useState<number>(0);

    // Admin Notification State
    const [adminNotification, setAdminNotification] = useState<{ enabled: boolean; title: string; message: string; image: string } | null>(null);

    const isFeatureAllowed = (f: 'dashboard' | 'video' | 'image' | 'cinema' | 'photoshoot' | 'iklan' | 'lipsync' | 'tts' | 'banner' | 'ugccaption' | 'ugchand' | 'editornarasi' | 'kontenbelajaranak' | 'nanobananapro' | 'tanyabangvidgo' | 'buatceritaanak'): boolean => {
        if (!currentUser) return false;
        return true;
    };

    // Pastikan fitur aktif selalu yang diizinkan
    useEffect(() => {
        if (!currentUser) return;
        if (isFeatureAllowed(activeFeature)) return;
        const ORDER: Array<typeof activeFeature> = ['dashboard','video','image','cinema','photoshoot','iklan','banner','ugccaption','tanyabangvidgo','ugchand','editornarasi','kontenbelajaranak','lipsync','tts','nanobananapro','buatceritaanak'];
        const firstAllowed = ORDER.find(f => isFeatureAllowed(f));
        if (firstAllowed) setActiveFeature(firstAllowed);
    }, [currentUser]);

    useEffect(() => {
        const warnHandler = () => {
            try {
                const timeoutAtStr = localStorage.getItem('veo_session_timeout_at');
                const timeoutAt = timeoutAtStr ? Number(timeoutAtStr) : undefined;
                if (timeoutAt) {
                    const remainingMs = Math.max(timeoutAt - Date.now(), 0);
                    setSessionRemainingMin(Math.ceil(remainingMs / 60000));
                } else {
                    setSessionRemainingMin(5);
                }
                setSessionWarn(true);
            } catch { setSessionWarn(true); }
        };
        window.addEventListener('vidgo-session-warning', warnHandler as EventListener);
        return () => window.removeEventListener('vidgo-session-warning', warnHandler as EventListener);
    }, []);

    // Load admin notification
    useEffect(() => {
        const loadNotification = async () => {
            try {
                const resp = await fetch(`/api/globalSettings?key=ADMIN_NOTIFICATION&t=${Date.now()}`);
                if (resp.ok) {
                    const json = await resp.json();
                    const raw = (json?.value || '').trim();
                    if (raw) {
                        try {
                            const data = JSON.parse(raw);
                            if (data.enabled) {
                                setAdminNotification(data);
                            } else {
                                setAdminNotification(null);
                            }
                        } catch {}
                    }
                }
            } catch {}
        };
        loadNotification();
        // Poll setiap 30 detik untuk cek update notifikasi
        const interval = setInterval(loadNotification, 30000);
        return () => clearInterval(interval);
    }, []);

    

    useEffect(() => {
        const interval = window.setInterval(() => {
            try {
                const sid = localStorage.getItem('veo_session_id');
                const sessionStr = localStorage.getItem('veo_session_user');
                const u = sessionStr ? JSON.parse(sessionStr) as User : null;
                if (!sid || !u?.id) return;
                supabase?.auth.getSession().then(s => {
                    const token = s.data.session?.access_token;
                    fetch('/api/singleSession', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ action: 'status', userId: u.id, sessionId: sid })
                    }).then(r => r.json()).then(j => {
                        const cur = j?.currentSessionId || null;
                        const list = j?.sessionIds || null;
                        const invalid = (cur != null && cur !== sid) || (Array.isArray(list) && !list.includes(sid));
                        if (invalid) {
                            AuthService.logout();
                            setCurrentUser(null);
                        }
                    }).catch(() => {});
                }).catch(() => {});
            } catch {}
        }, 5000);
        return () => window.clearInterval(interval);
    }, [currentUser?.id]);

    // Calculate global busy state if ANY job is active
    const isGlobalBusy = jobs.some(job =>
        job.state.status === GenerationStatus.Uploading ||
        job.state.status === GenerationStatus.Pending ||
        job.state.status === GenerationStatus.Processing
    );

    const [isMerging, setIsMerging] = useState(false);
    const [mergeProgress, setMergeProgress] = useState(0);
    const [mergeStatus, setMergeStatus] = useState('');
    const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(null);

    // State untuk fitur Generate Gambar (tanpa kredit)
    const [imageAspectRatio, setImageAspectRatio] = useState<AspectRatio>(AspectRatio.Portrait);
    const [imageState, setImageState] = useState<{ status: GenerationStatus; progress: number; message: string; imageUrl?: string; error?: string }>({
        status: GenerationStatus.Idle,
        progress: 0,
        message: ''
    });
    const [imageResults, setImageResults] = useState<string[]>([]);
    const imageAbortControllers = useRef<AbortController[]>([]);
    const cancelImageRef = useRef<boolean>(false);
    const videoAbortControllers = useRef<Record<string, AbortController>>({});
    const cancelVideoRef = useRef<boolean>(false);
    // Hasil untuk fitur Photoshoot & Iklan (ditampilkan di kolom kanan)
    const [photoshootResults, setPhotoshootResults] = useState<string[]>([]);
    const [bannerResults, setBannerResults] = useState<string[]>([]);
    const [iklanResults, setIklanResults] = useState<string[]>([]);
    const [resultViewUrl, setResultViewUrl] = useState<string | null>(null);
    const [isGlobalModalOpen, setIsGlobalModalOpen] = useState<boolean>(false);
    const [lipsyncResults, setLipsyncResults] = useState<LipsyncResult[]>([]);
    const [photoshootLypsingInputs, setPhotoshootLypsingInputs] = useState<Record<string, string>>({});
    const [imagePromptInputs, setImagePromptInputs] = useState<Record<string, string>>({});
    const [iklanPromptInputs, setIklanPromptInputs] = useState<Record<string, string>>({});
    const [editingLipsyncIndex, setEditingLipsyncIndex] = useState<number | null>(null);
    const [editingLipsyncText, setEditingLipsyncText] = useState<string>('');

    // Saat overlay viewer aktif: dukung ESC untuk tutup dan kunci scroll body
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setResultViewUrl(null);
        };
        if (resultViewUrl) {
            window.addEventListener('keydown', handleKeyDown);
            try { document.body.style.overflow = 'hidden'; } catch {}
            setIsGlobalModalOpen(true);
        }
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            try { document.body.style.overflow = ''; } catch {}
            setIsGlobalModalOpen(false);
        };
    }, [resultViewUrl]);

    useEffect(() => {
        const onOpen = () => setIsGlobalModalOpen(true);
        const onClose = () => setIsGlobalModalOpen(false);
        window.addEventListener('global-modal-open', onOpen as EventListener);
        window.addEventListener('global-modal-close', onClose as EventListener);
        return () => {
            window.removeEventListener('global-modal-open', onOpen as EventListener);
            window.removeEventListener('global-modal-close', onClose as EventListener);
        };
    }, []);

    useEffect(() => {
        const handler = (e: Event) => {
            try {
                const detail = (e as CustomEvent).detail as any;
                const urls = Array.isArray(detail?.urls) ? detail.urls : null;
                if (urls && urls.length > 0) {
                    try { sessionStorage.setItem('EDITOR_NARASI_URLS', JSON.stringify(urls)); } catch {}
                    setActiveFeature('editornarasi');
                }
            } catch {}
        };
        window.addEventListener('navigate-editor-narasi', handler as EventListener);
        return () => window.removeEventListener('navigate-editor-narasi', handler as EventListener);
    }, []);

    

    // Auto-scroll ke panel hasil pada mobile ketika gambar baru muncul
    useEffect(() => {
        if (window.innerWidth < 1024 && photoshootResults.length > 0 && activeFeature === 'photoshoot') {
            const el = document.getElementById('result-display-section');
            el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [photoshootResults, activeFeature]);

    useEffect(() => {
        if (window.innerWidth < 1024 && iklanResults.length > 0 && activeFeature === 'iklan') {
            const el = document.getElementById('result-display-section');
            el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [iklanResults, activeFeature]);

    useEffect(() => {
        if (window.innerWidth < 1024 && lipsyncResults.length > 0 && activeFeature === 'lipsync') {
            const el = document.getElementById('result-display-section');
            el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [lipsyncResults, activeFeature]);

    // Auto-scroll hasil gambar GEM FIX pada mobile ketika hasil baru muncul
    useEffect(() => {
        if (window.innerWidth < 1024 && imageResults.length > 0 && activeFeature === 'image') {
            const el = document.getElementById('result-display-section');
            el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [imageResults, activeFeature]);

    // Concurrent Queue Processor
    useEffect(() => {
        if (!currentUser) return;

        const activeCount = jobs.filter(job =>
            job.state.status === GenerationStatus.Processing ||
            job.state.status === GenerationStatus.Uploading
        ).length;

        if (activeCount >= CONCURRENT_LIMIT) return;

        const nextJob = jobs.find(job => job.state.status === GenerationStatus.Pending);
        if (!nextJob) return;

        processJob(nextJob);
    }, [jobs, currentUser]);

    const getLocalToken = (): string => {
        return (localStorage.getItem('VEO_BEARER_TOKEN') || '').trim();
    };

    // Prefer token yang diisi user di menu (localStorage). Jika kosong, baru ambil dari Global Settings (admin).
    const getCentralizedToken = async (): Promise<string> => {
        const local = getLocalToken();
        if (local) return local;
        try {
            const resp = await fetch(`/api/globalSettings?key=VEO_BEARER_TOKEN&t=${Date.now()}`);
            if (resp.ok) {
                const json = await resp.json();
                const token = (json?.value || '').trim();
                if (token) return token;
            }
        } catch {}
        return '';
    };

    // Helper: estimasi rasio aspek dari ukuran gambar
    const estimateAspectFromUrl = async (url: string): Promise<AspectRatio> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const w = img.width;
                const h = img.height;
                if (!w || !h) {
                    resolve(AspectRatio.Landscape);
                    return;
                }
                const ratio = w / h;
                if (Math.abs(ratio - 1) < 0.05) resolve(AspectRatio.Square);
                else if (ratio < 1) resolve(AspectRatio.Portrait);
                else resolve(AspectRatio.Landscape);
            };
            img.onerror = () => resolve(AspectRatio.Landscape);
            img.src = url;
        });
    };

    // Helper: konversi URL gambar menjadi File untuk I2V
    const urlToFile = async (url: string): Promise<File> => {
        let blob: Blob;
        
        // Jika URL adalah data URL (base64), konversi langsung
        if (url.startsWith('data:')) {
            const [header, base64Data] = url.split(',');
            const mimeMatch = header.match(/data:([^;]+)/);
            const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
            const byteString = atob(base64Data);
            const arrayBuffer = new ArrayBuffer(byteString.length);
            const uint8Array = new Uint8Array(arrayBuffer);
            for (let i = 0; i < byteString.length; i++) {
                uint8Array[i] = byteString.charCodeAt(i);
            }
            blob = new Blob([uint8Array], { type: mimeType });
        } else {
            // URL eksternal: gunakan proxy untuk menghindari CORS
            const downloadBase = import.meta.env?.DEV ? '/download' : '/api/download';
            const proxied = `${downloadBase}?url=${encodeURIComponent(url)}&filename=${encodeURIComponent('source-image.png')}`;
            try {
                const resp = await fetch(proxied);
                if (!resp.ok) throw new Error('Proxy fetch failed');
                blob = await resp.blob();
            } catch {
                // Fallback: coba fetch langsung (jika CORS mengizinkan)
                const resp2 = await fetch(url);
                if (!resp2.ok) throw new Error('Gagal mengambil gambar sumber');
                blob = await resp2.blob();
            }
        }
        
        const type = blob.type || 'image/png';
        const ext = type.includes('png') ? 'png' : (type.includes('jpeg') || type.includes('jpg')) ? 'jpg' : 'bin';
        return new File([blob], `source-image.${ext}`, { type });
    };

    const extractLastFrameAsFile = async (videoUrl: string): Promise<File> => {
        const downloadBase = import.meta.env?.DEV ? '/download' : '/api/download';
        const proxied = `${downloadBase}?url=${encodeURIComponent(videoUrl)}&filename=${encodeURIComponent('extend-capture.mp4')}`;
        let blob: Blob;
        try {
            const resp = await fetch(proxied);
            if (!resp.ok) throw new Error('Proxy fetch failed');
            blob = await resp.blob();
        } catch {
            const resp2 = await fetch(videoUrl);
            if (!resp2.ok) throw new Error('Gagal mengambil video sumber');
            blob = await resp2.blob();
        }
        const objUrl = URL.createObjectURL(blob);
        return new Promise<File>((resolve, reject) => {
            const video = document.createElement('video');
            video.src = objUrl;
            video.crossOrigin = 'anonymous';
            video.preload = 'auto';
            video.muted = true;
            video.playsInline = true;
            video.onloadedmetadata = () => {
                const w = video.videoWidth || 1280;
                const h = video.videoHeight || 720;
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d', { alpha: false });
                if (!ctx) { URL.revokeObjectURL(objUrl); reject(new Error('Canvas unavailable')); return; }
                (ctx as any).imageSmoothingEnabled = false;
                const offsets = [0.05, 0.12, 0.2, 0.3];
                const tryOnce = (offset: number) => new Promise<File | null>((res) => {
                    const target = Math.max(0, (video.duration || 0) - offset);
                    const draw = () => {
                        try {
                            ctx.drawImage(video, 0, 0, w, h);
                            const data = ctx.getImageData(Math.floor(w / 2), Math.floor(h / 2), 1, 1).data;
                            const avg = (data[0] + data[1] + data[2]) / 3;
                            if (avg < 1) { res(null); return; }
                            canvas.toBlob((imgBlob) => {
                                if (!imgBlob) { res(null); return; }
                                const file = new File([imgBlob], 'last-frame.png', { type: 'image/png' });
                                res(file);
                            }, 'image/png');
                        } catch { res(null); }
                    };
                    video.onseeked = () => { try { video.pause(); } catch {} draw(); };
                    try { video.currentTime = target; } catch { res(null); return; }
                    video.play().then(() => { setTimeout(() => { try { video.pause(); } catch {} }, 10); }).catch(() => {});
                });
                (async () => {
                    let result: File | null = null;
                    for (let i = 0; i < offsets.length; i++) {
                        result = await tryOnce(offsets[i]);
                        if (result) break;
                    }
                    if (result) {
                        URL.revokeObjectURL(objUrl);
                        resolve(result);
                    } else {
                        URL.revokeObjectURL(objUrl);
                        reject(new Error('Capture failed'));
                    }
                })();
            };
            video.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error('Video load error')); };
        });
    };

    // Sanitisasi pesan error agar tidak menampilkan detail teknis ke pengguna
    const toUserMessage = (msg: string): string => {
        const m = (msg || '').toLowerCase();
        if (m.includes('failed to fetch') || m.includes('gagal mengambil')) {
            return 'Gagal mengambil data. Periksa koneksi internet Anda dan coba lagi.';
        }
        const technicalPatterns = [
            'generation start failed',
            'invalid authentication',
            'oauth',
            'authorization',
            'developers.google.com',
            'timed out',
            'no valid operation',
            'image upload failed',
            'video generation failed',
            '401',
            '403'
        ];
        if (technicalPatterns.some(p => m.includes(p))) {
            return 'Gagal membuat video. Silakan coba lagi nanti.';
        }
        return msg || 'Terjadi kesalahan. Silakan coba lagi nanti.';
    };

    const processJob = async (job: Job) => {
        if (!currentUser) return;

        const currentRetry = job.retryCount || 0;

        // Double-check credits right before starting processing
        // Perlu ambil data user terbaru dari storage untuk menghindari race condition sederhana
        const freshUser = await AuthService.getCurrentUser();
        if (!freshUser || freshUser.remainingCredits <= 0) {
             updateJobState(job.id, {
                status: GenerationStatus.Failed,
                progress: 0,
                message: 'Gagal',
                error: 'Kredit harian habis. Coba lagi besok.'
            });
            if (freshUser) setCurrentUser(freshUser); // Sync UI
            return;
        }

        const retryMsg = currentRetry > 0 ? ` (Percobaan ${currentRetry + 1}/${MAX_VIDEO_RETRY_COUNT})` : '';
        updateJobState(job.id, { status: GenerationStatus.Processing, progress: 1, message: `Mengambil otorisasi...${retryMsg}` });

        try {
            const currentToken = await getCentralizedToken();
            if (!currentToken) {
                throw new Error('Token VEO3 belum diatur. Minta admin mengisi token di menu Admin (Token VEO3).');
            }
            updateJobState(job.id, { progress: 5, message: `Memulai...${retryMsg}` });

            const controller = new AbortController();
            videoAbortControllers.current[job.id] = controller;
            const videoUrl = await generateVeoVideo(
                job.options.prompt,
                job.options.aspectRatio,
                job.options.resolution,
                job.options.image,
                currentToken,
                (progress, message) => {
                    let status = GenerationStatus.Processing;
                    if (message.toLowerCase().includes('upload')) status = GenerationStatus.Uploading;
                    const retryInfo = currentRetry > 0 ? ` (Percobaan ${currentRetry + 1}/${MAX_VIDEO_RETRY_COUNT})` : '';
                    updateJobState(job.id, { status, progress, message: `${message}${retryInfo}` });
                },
                controller.signal
            );

            // BERHASIL: Kurangi Kredit & Catat Laporan
            const updatedUser = await AuthService.deductCredit(currentUser.id);
            if (updatedUser) {
                setCurrentUser(updatedUser);
            }
            ReportingService.logGeneration(currentUser.id, currentUser.email);


            updateJobState(job.id, {
                status: GenerationStatus.Completed,
                progress: 100,
                message: 'Selesai!',
                videoUrl
            });

        } catch (err: any) {
            const rawMessage = err?.message || 'Terjadi kesalahan tidak dikenal.';
            if (rawMessage && rawMessage.toLowerCase().includes('abort')) {
                updateJobState(job.id, {
                    status: GenerationStatus.Idle,
                    progress: 0,
                    message: 'Dihentikan.'
                });
            } else {
                // Retry logic: jika belum mencapai MAX_VIDEO_RETRY_COUNT, coba lagi
                if (currentRetry < MAX_VIDEO_RETRY_COUNT - 1) {
                    const nextRetry = currentRetry + 1;
                    updateJobState(job.id, {
                        status: GenerationStatus.Processing,
                        progress: 0,
                        message: `Gagal, mencoba ulang... (Percobaan ${nextRetry + 1}/${MAX_VIDEO_RETRY_COUNT})`
                    });
                    
                    // Update job dengan retry count baru
                    setJobs(prev => prev.map(j => 
                        j.id === job.id ? { ...j, retryCount: nextRetry } : j
                    ));
                    
                    // Tunggu 15 detik sebelum retry
                    await new Promise(resolve => setTimeout(resolve, 15000));
                    
                    // Recursive retry dengan job yang sudah diupdate
                    await processJob({ ...job, retryCount: nextRetry });
                    return;
                }
                
                // Sudah mencapai maksimal retry, set sebagai gagal
                const errorMessage = toUserMessage(rawMessage);
                updateJobState(job.id, {
                    status: GenerationStatus.Failed,
                    progress: 0,
                    message: 'Gagal',
                    error: `${errorMessage} (Sudah dicoba ${MAX_VIDEO_RETRY_COUNT} kali)`
                });
            }
        }
        finally {
            delete videoAbortControllers.current[job.id];
        }
    };

    const updateJobState = (id: string, newState: Partial<GenerationState>) => {
        setJobs(prev => prev.map(job =>
            job.id === id ? { ...job, state: { ...job.state, ...newState } } : job
        ));
    };

    const handleDownloadAll = useCallback(() => {
        const completed = jobs.filter(j => j.state.status === GenerationStatus.Completed && j.state.videoUrl);
        if (completed.length === 0) {
            alert('Tidak ada video selesai untuk diunduh.');
            return;
        }
        completed.forEach((j, idx) => {
            const url = j.state.videoUrl as string;
            const filename = `veo3-video-${idx + 1}.mp4`;
            const downloadBase = import.meta.env?.DEV ? '/download' : '/api/download';
            const proxied = `${downloadBase}?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
            setTimeout(() => {
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = proxied;
                a.download = filename;
                a.target = '_self';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { if (a.parentNode) a.parentNode.removeChild(a); }, 100);
            }, idx * 300);
        });
    }, [jobs]);

    const downloadVideoAsFile = useCallback(async (url: string, name: string): Promise<File> => {
        const downloadBase = import.meta.env?.DEV ? '/download' : '/api/download';
        const proxied = `${downloadBase}?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(name)}`;
        let blob: Blob;
        try {
            const resp = await fetch(proxied);
            if (!resp.ok) throw new Error('Proxy fetch failed');
            blob = await resp.blob();
        } catch {
            const resp2 = await fetch(url);
            if (!resp2.ok) throw new Error('Gagal mengambil video');
            blob = await resp2.blob();
        }
        const type = blob.type || 'video/mp4';
        return new File([blob], name, { type });
    }, []);

    const createSilentWavFile = useCallback(async (durationSec: number): Promise<File> => {
        const sampleRate = 44100;
        const channels = 1;
        const bytesPerSample = 2;
        const frameCount = Math.max(1, Math.floor(durationSec * sampleRate));
        const dataSize = frameCount * channels * bytesPerSample;
        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);
        const writeStr = (offset: number, str: string) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
        writeStr(0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        writeStr(8, 'WAVE');
        writeStr(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, channels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * channels * bytesPerSample, true);
        view.setUint16(32, channels * bytesPerSample, true);
        view.setUint16(34, 8 * bytesPerSample, true);
        writeStr(36, 'data');
        view.setUint32(40, dataSize, true);
        const out = new Uint8Array(buffer);
        for (let i = 44; i < out.length; i++) out[i] = 0;
        const blob = new Blob([out], { type: 'audio/wav' });
        return new File([blob], 'silence.wav', { type: 'audio/wav' });
    }, []);

    const handleMergeAll = useCallback(async () => {
        const sources = jobs.filter(j => j.state.status === GenerationStatus.Completed && j.state.videoUrl);
        if (sources.length === 0) {
            alert('Tidak ada video selesai.');
            return;
        }
        const downloadBase = import.meta.env?.DEV ? '/download' : '/api/download';
        const urls = sources.map((j, i) => `${downloadBase}?url=${encodeURIComponent(j.state.videoUrl as string)}&filename=${encodeURIComponent(`session-${String(i + 1).padStart(2, '0')}.mp4`)}`);
        try { sessionStorage.setItem('EDITOR_NARASI_URLS', JSON.stringify(urls)); } catch {}
        try { window.dispatchEvent(new CustomEvent('navigate-editor-narasi', { detail: { urls } })); } catch {}
    }, [jobs]);

    const handleGenerate = useCallback((optionsList: GenerateOptions[]) => {
        if (!currentUser) return;

        // Cek awal apakah kredit cukup untuk jumlah request yang diminta
        // Hitung juga job yang sedang pending agar tidak bypass limit dengan spam tombol
        const pendingJobsCount = jobs.filter(j => j.state.status === GenerationStatus.Pending).length;
        const totalRequested = optionsList.length + pendingJobsCount;

        if (currentUser.remainingCredits < totalRequested) {
             alert(`Kredit tidak mencukupi. Sisa kredit: ${currentUser.remainingCredits}, Antrian: ${pendingJobsCount}, Permintaan baru: ${optionsList.length}.`);
             return;
        }

        const newJobs: Job[] = optionsList.map(options => ({
            id: Math.random().toString(36).substring(7),
            options,
            state: {
                status: GenerationStatus.Pending,
                progress: 0,
                message: 'Menunggu Antrian...',
            }
        }));

        setJobs(prev => [...prev, ...newJobs]);
        if (!activeJobId && newJobs.length > 0) {
            setActiveJobId(newJobs[0].id);
        }

        if (window.innerWidth < 1024) {
            setTimeout(() => {
                document.getElementById('video-display-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
    }, [activeJobId, currentUser, jobs]);

    // Handler untuk Generate Gambar dengan GEM_PIX (tanpa kredit)
    const handleGenerateImage = useCallback(async (payload: { instruction: string; aspectRatio: AspectRatio; subjectImage?: File | null }) => {
        if (!currentUser) return;
        setActiveFeature('image');
        setImageAspectRatio(payload.aspectRatio);
        setImageState({ status: GenerationStatus.Pending, progress: 0, message: 'Menunggu...', imageUrl: undefined, error: undefined });
        cancelImageRef.current = false;
        imageAbortControllers.current = [];
        try {
            const currentToken = await getCentralizedToken();
            if (!currentToken) {
                setImageState({ status: GenerationStatus.Failed, progress: 0, message: 'Gagal', error: 'Token VEO3 belum diatur. Minta admin mengisi token di menu Admin (Token VEO3).' });
                return;
            }
            const COUNT = 6;
            const PARALLEL = 2;
            setImageResults([]);
            for (let i = 0; i < COUNT; i += PARALLEL) {
                if (cancelImageRef.current) { setImageState({ status: GenerationStatus.Idle, progress: 0, message: 'Dihentikan.', imageUrl: undefined }); return; }
                const batchSize = Math.min(PARALLEL, COUNT - i);
                const batchPromises: Promise<string>[] = [];
                for (let offset = 0; offset < batchSize; offset++) {
                    const overallIndex = i + offset; // 0-based
                    if (payload.subjectImage) {
                        setImageState(s => ({ ...s, status: GenerationStatus.Uploading, progress: Math.min(10 + Math.round((overallIndex / COUNT) * 85), 95), message: `Mengunggah & memproses (batch ${Math.floor(i / PARALLEL) + 1}/${Math.ceil(COUNT / PARALLEL)})` }));
                        const controller = new AbortController();
                        imageAbortControllers.current.push(controller);
                        batchPromises.push(
                            generateImage(
                                payload.instruction,
                                payload.aspectRatio,
                                payload.subjectImage,
                                currentToken,
                                (progress, msg) => {
                                    const isUpload = (msg || '').toLowerCase().includes('unggah');
                                    const approx = Math.min(95, 10 + Math.round(((overallIndex + progress / 100) / COUNT) * 85));
                                    setImageState((s) => ({ ...s, status: isUpload ? GenerationStatus.Uploading : GenerationStatus.Processing, progress: approx, message: `${msg} (${overallIndex + 1}/${COUNT})` }));
                                },
                                controller.signal
                            )
                        );
                    } else {
                        setImageState(s => ({ ...s, status: GenerationStatus.Processing, progress: Math.min(10 + Math.round((overallIndex / COUNT) * 85), 95), message: `Menghasilkan (batch ${Math.floor(i / PARALLEL) + 1}/${Math.ceil(COUNT / PARALLEL)})` }));
                        const controller = new AbortController();
                        imageAbortControllers.current.push(controller);
                        batchPromises.push(
                            generateImagePromptOnly(
                                payload.instruction,
                                payload.aspectRatio,
                                currentToken,
                                (progress, msg) => {
                                    const approx = Math.min(95, 10 + Math.round(((overallIndex + progress / 100) / COUNT) * 85));
                                    setImageState((s) => ({ ...s, status: GenerationStatus.Processing, progress: approx, message: `${msg} (${overallIndex + 1}/${COUNT})` }));
                                },
                                controller.signal
                            )
                        );
                    }
                }
                try {
                    const urls = await Promise.all(batchPromises);
                    setImageResults(prev => [...prev, ...urls]);
                } catch (e) {
                    if (cancelImageRef.current) {
                        setImageState({ status: GenerationStatus.Idle, progress: 0, message: 'Dihentikan.', imageUrl: undefined });
                        return;
                    }
                }
            }
            setImageState({ status: GenerationStatus.Completed, progress: 100, message: 'Selesai!', imageUrl: undefined });
        } catch (err: any) {
            const msg = (err?.message || 'Terjadi kesalahan.');
            setImageState({ status: GenerationStatus.Failed, progress: 0, message: 'Gagal', error: msg });
        }
    }, [currentUser]);

    const handleStopImageGeneration = useCallback(() => {
        cancelImageRef.current = true;
        try { imageAbortControllers.current.forEach(c => { try { c.abort(); } catch {} }); } catch {}
        imageAbortControllers.current = [];
        setImageState(s => ({ ...s, status: GenerationStatus.Idle, progress: 0, message: 'Dihentikan.', imageUrl: undefined }));
    }, []);

    const handleStopVideo = useCallback(() => {
        cancelVideoRef.current = true;
        try {
            Object.values(videoAbortControllers.current).forEach(c => { try { c.abort(); } catch {} });
        } catch {}
        videoAbortControllers.current = {};
        setJobs(prev => prev.map(j => {
            if (j.state.status === GenerationStatus.Uploading || j.state.status === GenerationStatus.Processing) {
                return { ...j, state: { ...j.state, status: GenerationStatus.Idle, progress: 0, message: 'Dihentikan.' } };
            }
            return j;
        }));
    }, []);

    const handleRegenerate = useCallback((options: GenerateOptions) => {
        if (!currentUser) return;
        const targetId = activeJobId || jobs[jobs.length - 1]?.id;
        if (!targetId) { handleGenerate([options]); return; }
        const pendingJobsCount = jobs.filter(j => j.state.status === GenerationStatus.Pending && j.id !== targetId).length;
        const totalRequested = 1 + pendingJobsCount;
        if (currentUser.remainingCredits < totalRequested) {
            alert(`Kredit tidak mencukupi. Sisa kredit: ${currentUser.remainingCredits}, Antrian: ${pendingJobsCount}.`);
            return;
        }
        setJobs(prev => prev.map(j => j.id === targetId
            ? {
                ...j,
                options: { ...options, extensionDepth: j.options.extensionDepth },
                state: { status: GenerationStatus.Pending, progress: 0, message: 'Menunggu Antrian...' }
              }
            : j
        ));
        setActiveJobId(targetId);
        if (window.innerWidth < 1024) {
            setTimeout(() => {
                document.getElementById('video-display-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
    }, [activeJobId, currentUser, jobs, handleGenerate]);

    const handleRegenerateForJob = useCallback((jobId: string) => {
        const job = jobs.find(j => j.id === jobId);
        if (!job || !currentUser) return;
        const pendingJobsCount = jobs.filter(j => j.state.status === GenerationStatus.Pending && j.id !== jobId).length;
        const totalRequested = 1 + pendingJobsCount;
        if (currentUser.remainingCredits < totalRequested) {
            alert(`Kredit tidak mencukupi. Sisa kredit: ${currentUser.remainingCredits}, Antrian: ${pendingJobsCount}.`);
            return;
        }
        setJobs(prev => prev.map(j => j.id === jobId
            ? {
                ...j,
                options: { ...job.options, extensionDepth: j.options.extensionDepth },
                state: { status: GenerationStatus.Pending, progress: 0, message: 'Menunggu Antrian...' }
              }
            : j
        ));
        setActiveJobId(jobId);
        if (window.innerWidth < 1024) {
            setTimeout(() => {
                document.getElementById('video-display-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
    }, [currentUser, jobs]);

    const handleDeleteJob = useCallback((jobId: string) => {
        const job = jobs.find(j => j.id === jobId);
        if (!job) return;
        if (job.state.status === GenerationStatus.Uploading || job.state.status === GenerationStatus.Processing) {
            alert('Tidak dapat menghapus saat proses berjalan. Hentikan terlebih dahulu.');
            return;
        }
        try {
            const ctrl = videoAbortControllers.current[jobId];
            if (ctrl) { try { ctrl.abort(); } catch {} }
            delete videoAbortControllers.current[jobId];
        } catch {}
        setJobs(prev => prev.filter(j => j.id !== jobId));
        if (activeJobId === jobId) {
            const remaining = jobs.filter(j => j.id !== jobId);
            setActiveJobId(remaining[remaining.length - 1]?.id || null);
        }
    }, [activeJobId, jobs]);

    const handleExtend = useCallback(async (promptOverride?: string) => {
        if (!isFeatureAllowed('video')) {
            alert('Fitur video belum diaktifkan untuk akun Anda.');
            return;
        }
        if (!currentUser) {
            alert('Silakan login terlebih dahulu.');
            return;
        }
        const job = jobs.find(j => j.id === activeJobId) || jobs[jobs.length - 1];
        const vurl = job?.state.videoUrl;
        if (!vurl || job?.state.status !== GenerationStatus.Completed) {
            alert('Video belum selesai untuk diperpanjang.');
            return;
        }
        const depth = (job?.options.extensionDepth || 0);
        if (depth >= 10) {
            alert('Batas perpanjang tercapai (maksimal 10x).');
            return;
        }
        const pendingJobsCount = jobs.filter(j => j.state.status === GenerationStatus.Pending).length;
        const totalRequested = 1 + pendingJobsCount;
        if (currentUser.remainingCredits < totalRequested) {
            alert(`Kredit tidak mencukupi. Sisa kredit: ${currentUser.remainingCredits}, Antrian: ${pendingJobsCount}.`);
            return;
        }
        try {
            const refImage = await extractLastFrameAsFile(vurl);
            const newJob: Job = {
                id: Math.random().toString(36).substring(7),
                options: {
                    prompt: (promptOverride && promptOverride.trim().length > 0)
                        ? promptOverride.trim()
                        : (job.options.prompt || 'Extend previous short video seamlessly using the last frame as reference.'),
                    aspectRatio: job.options.aspectRatio,
                    resolution: job.options.resolution,
                    image: refImage,
                    extensionDepth: depth + 1
                },
                state: { status: GenerationStatus.Pending, progress: 0, message: 'Menunggu Antrian...' }
            };
            setJobs(prev => [...prev, newJob]);
            setActiveJobId(newJob.id);
            setActiveFeature('video');
            setTimeout(() => { document.getElementById('video-display-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);
        } catch (err: any) {
            alert(toUserMessage(err?.message || 'Terjadi kesalahan.'));
        }
    }, [activeJobId, currentUser, jobs]);

    // Trigger pembuatan video dari gambar hasil Photoshoot/Studio Iklan
    // State inline per kartu gambar: status, progres, dan hasil video
    const [inlineVideoMap, setInlineVideoMap] = useState<Record<string, { state: GenerationState; aspect?: AspectRatio; retryCount?: number }>>({});

    const MAX_RETRY_COUNT = 10;

    const setInlineState = (key: string, partial: Partial<GenerationState>, aspect?: AspectRatio, retryCount?: number) => {
        setInlineVideoMap(prev => {
            const current = prev[key]?.state || { status: GenerationStatus.Idle, progress: 0, message: '' };
            const nextEntry = {
                state: { ...current, ...partial },
                aspect: aspect ?? prev[key]?.aspect,
                retryCount: retryCount ?? prev[key]?.retryCount ?? 0
            };
            try {
                const ev = new CustomEvent('inline-video-state', { detail: { url: key, state: nextEntry.state, aspect: nextEntry.aspect, retryCount: nextEntry.retryCount } });
                window.dispatchEvent(ev);
            } catch {}
            return { ...prev, [key]: nextEntry };
        });
    };

    // Fungsi internal untuk memproses satu video generation dengan retry
    const processVideoGeneration = useCallback(async (url: string, promptOverride?: string, currentRetry: number = 0): Promise<void> => {
        if (!currentUser) return;

        // Cek kredit terbaru sebelum mulai
        const freshUser = await AuthService.getCurrentUser();
        if (!freshUser || freshUser.remainingCredits <= 0) {
            setInlineState(url, { status: GenerationStatus.Failed, progress: 0, message: 'Gagal', error: 'Kredit harian habis. Coba lagi besok.' }, undefined, currentRetry);
            if (freshUser) setCurrentUser(freshUser);
            
            return;
        }

        try {
            const aspect = await estimateAspectFromUrl(url);
            const retryMsg = currentRetry > 0 ? ` (Percobaan ${currentRetry + 1}/${MAX_RETRY_COUNT})` : '';
            setInlineState(url, { status: GenerationStatus.Processing, progress: 1, message: `Menyiapkan...${retryMsg}` }, aspect, currentRetry);

            const token = '';

            const file = await urlToFile(url);
            const prompt = (promptOverride && promptOverride.trim().length > 0)
                ? promptOverride.trim()
                : 'Create a short cinematic product showcase video from this image. Maintain composition and style, smooth camera motion, premium commercial mood.';

            const videoUrl = await generateVeoVideo(
                prompt,
                aspect,
                Resolution.FHD,
                file,
                token,
                (progress, message) => {
                    let status = GenerationStatus.Processing;
                    if ((message || '').toLowerCase().includes('upload')) status = GenerationStatus.Uploading;
                    const retryInfo = currentRetry > 0 ? ` (Percobaan ${currentRetry + 1}/${MAX_RETRY_COUNT})` : '';
                    setInlineState(url, { status, progress, message: `${message}${retryInfo}` }, undefined, currentRetry);
                }
            );

            // Berhasil: kurangi kredit & catat laporan
            const updatedUser = await AuthService.deductCredit(currentUser.id);
            if (updatedUser) setCurrentUser(updatedUser);
            ReportingService.logGeneration(currentUser.id, currentUser.email);

            setInlineState(url, { status: GenerationStatus.Completed, progress: 100, message: 'Selesai!', videoUrl }, undefined, currentRetry);
        } catch (err: any) {
            const rawMessage = err?.message || 'Terjadi kesalahan tidak dikenal.';
            const errorMessage = toUserMessage(rawMessage);
            
            // Retry logic: jika belum mencapai MAX_RETRY_COUNT, coba lagi
            if (currentRetry < MAX_RETRY_COUNT - 1) {
                const nextRetry = currentRetry + 1;
                setInlineState(url, { 
                    status: GenerationStatus.Processing, 
                    progress: 0, 
                    message: `Gagal, mencoba ulang... (Percobaan ${nextRetry + 1}/${MAX_RETRY_COUNT})` 
                }, undefined, nextRetry);
                
                // Tunggu 15 detik sebelum retry
                await new Promise(resolve => setTimeout(resolve, 15000));
                
                // Recursive retry
                await processVideoGeneration(url, promptOverride, nextRetry);
                return;
            }
            
            // Sudah mencapai maksimal retry, set sebagai gagal
            setInlineState(url, { 
                status: GenerationStatus.Failed, 
                progress: 0, 
                message: 'Gagal', 
                error: `${errorMessage} (Sudah dicoba ${MAX_RETRY_COUNT} kali)` 
            }, undefined, currentRetry);
        } finally {}
    }, [currentUser]);


    // Trigger pembuatan video dari gambar hasil Photoshoot/Studio Iklan (inline)
    const handleCreateVideoFromImageUrl = useCallback(async (url: string, promptOverride?: string) => {
        if (!isFeatureAllowed('video')) {
            alert('Fitur video belum diaktifkan untuk akun Anda.');
            return;
        }
        if (!currentUser) {
            alert('Silakan login terlebih dahulu.');
            return;
        }
        const existing = inlineVideoMap[url]?.state.status;
        if (existing === GenerationStatus.Pending || existing === GenerationStatus.Uploading || existing === GenerationStatus.Processing) {
            return;
        }
        
        // Cek kredit terbaru sebelum mulai
        const freshUser = await AuthService.getCurrentUser();
        if (!freshUser || freshUser.remainingCredits <= 0) {
            setInlineState(url, { status: GenerationStatus.Failed, progress: 0, message: 'Gagal', error: 'Kredit harian habis. Coba lagi besok.' });
            if (freshUser) setCurrentUser(freshUser);
            return;
        }
        setInlineState(url, { status: GenerationStatus.Pending, progress: 0, message: 'Memulai proses...' }, undefined, 0);
        processVideoGeneration(url, promptOverride, 0);
    }, [currentUser, processVideoGeneration, inlineVideoMap]);

    useEffect(() => {
        const onCreateUgcVideo = (e: Event) => {
            try {
                const detail = (e as CustomEvent).detail as any;
                const base64 = typeof detail?.imageBase64 === 'string' ? detail.imageBase64 : '';
                const narrative = typeof detail?.narrative === 'string' ? detail.narrative : '';
                if (!base64 || base64.length < 10) return;
                const url = `data:image/png;base64,${base64}`;
                const prompt = narrative && narrative.trim().length > 0
                    ? `Buat Lypsing dalam Bahasa Indonesia: "${narrative.trim()}". Create a short vertical ad video (9:16) from this image. Use this Indonesian speaking line exactly. Keep premium commercial mood, dynamic camera motion, ~3 seconds.`
                    : undefined;
                handleCreateVideoFromImageUrl(url, prompt);
            } catch {}
        };
        window.addEventListener('create-ugc-video', onCreateUgcVideo as EventListener);
        return () => window.removeEventListener('create-ugc-video', onCreateUgcVideo as EventListener);
    }, [handleCreateVideoFromImageUrl]);

    useEffect(() => {
        const onCreateVeoVideo = (e: Event) => {
            try {
                const detail = (e as CustomEvent).detail as any;
                const imageUrl = typeof detail?.imageUrl === 'string' ? detail.imageUrl : '';
                const prompt = typeof detail?.prompt === 'string' ? detail.prompt : undefined;
                if (!imageUrl || imageUrl.length < 10) return;
                handleCreateVideoFromImageUrl(imageUrl, (prompt && prompt.trim()) ? prompt.trim() : undefined);
            } catch {}
        };
        window.addEventListener('create-veo-video', onCreateVeoVideo as EventListener);
        return () => window.removeEventListener('create-veo-video', onCreateVeoVideo as EventListener);
    }, [handleCreateVideoFromImageUrl]);

    // --- Merge All controls per feature ---
    const [mergeAudioPhotoshoot, setMergeAudioPhotoshoot] = useState<File | null>(null);
    const [useOriginalPhotoshoot, setUseOriginalPhotoshoot] = useState<boolean>(true);
    const [isMergingPhotoshoot, setIsMergingPhotoshoot] = useState<boolean>(false);
    const [mergeProgressPhotoshoot, setMergeProgressPhotoshoot] = useState<number>(0);
    const [mergeStatusPhotoshoot, setMergeStatusPhotoshoot] = useState<string>('');
    const [mergedUrlPhotoshoot, setMergedUrlPhotoshoot] = useState<string | null>(null);

    const [mergeAudioIklan, setMergeAudioIklan] = useState<File | null>(null);
    const [useOriginalIklan, setUseOriginalIklan] = useState<boolean>(true);
    const [isMergingIklan, setIsMergingIklan] = useState<boolean>(false);
    const [mergeProgressIklan, setMergeProgressIklan] = useState<number>(0);
    const [mergeStatusIklan, setMergeStatusIklan] = useState<string>('');
    const [mergedUrlIklan, setMergedUrlIklan] = useState<string | null>(null);

    const [mergeAudioLipsync, setMergeAudioLipsync] = useState<File | null>(null);
    const [useOriginalLipsync, setUseOriginalLipsync] = useState<boolean>(true);
    const [isMergingLipsync, setIsMergingLipsync] = useState<boolean>(false);
    const [mergeProgressLipsync, setMergeProgressLipsync] = useState<number>(0);
    const [mergeStatusLipsync, setMergeStatusLipsync] = useState<string>('');
    const [mergedUrlLipsync, setMergedUrlLipsync] = useState<string | null>(null);

    // Refs for regeneration
    const aiPhotoshootRef = useRef<AiPhotoshootRef>(null);
    const studioIklanRef = useRef<StudioIklanRef>(null);
    const [regeneratingIndices, setRegeneratingIndices] = useState<Set<string>>(new Set());

    const handleRegenerateImagePhotoshoot = useCallback(async (index: number, url: string) => {
        if (regeneratingIndices.has(url)) return;
        setRegeneratingIndices(prev => new Set(prev).add(url));
        try {
            await aiPhotoshootRef.current?.regenerate(index);
        } catch (e) {
            alert('Gagal regenerate gambar.');
        } finally {
            setRegeneratingIndices(prev => {
                const next = new Set(prev);
                next.delete(url);
                return next;
            });
        }
    }, [regeneratingIndices]);

    const handleRegenerateImageIklan = useCallback(async (index: number, url: string) => {
        if (regeneratingIndices.has(url)) return;
        setRegeneratingIndices(prev => new Set(prev).add(url));
        try {
            await studioIklanRef.current?.regenerate(index);
        } catch (e) {
            alert('Gagal regenerate gambar.');
        } finally {
            setRegeneratingIndices(prev => {
                const next = new Set(prev);
                next.delete(url);
                return next;
            });
        }
    }, [regeneratingIndices]);

    const videoUrlToFileOrdered = async (url: string, idx: number): Promise<File> => {
        const downloadBase = import.meta.env?.DEV ? '/download' : '/api/download';
        const proxied = `${downloadBase}?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(`merge-clip-${String(idx + 1).padStart(2, '0')}.mp4`)}`;
        let blob: Blob;
        try {
            const resp = await fetch(proxied);
            if (!resp.ok) throw new Error('Proxy fetch failed');
            blob = await resp.blob();
        } catch {
            const resp2 = await fetch(url);
            if (!resp2.ok) throw new Error('Gagal mengambil video sumber');
            blob = await resp2.blob();
        }
        const name = `clip_${String(idx + 1).padStart(2, '0')}.mp4`;
        return new File([blob], name, { type: blob.type || 'video/mp4' });
    };

    const handleMergeAllPhotoshoot = useCallback(async () => {
        const readyUrls = photoshootResults
            .map(u => inlineVideoMap[u]?.state.videoUrl)
            .filter(Boolean) as string[];
        if (readyUrls.length === 0) { setMergeStatusPhotoshoot('Belum ada video selesai.'); return; }
        const downloadBase = import.meta.env?.DEV ? '/download' : '/api/download';
        const urls = readyUrls.map((u, i) => `${downloadBase}?url=${encodeURIComponent(u)}&filename=${encodeURIComponent(`photoshoot-${String(i + 1).padStart(2, '0')}.mp4`)}`);
        try { sessionStorage.setItem('EDITOR_NARASI_URLS', JSON.stringify(urls)); } catch {}
        try { window.dispatchEvent(new CustomEvent('navigate-editor-narasi', { detail: { urls } })); } catch {}
    }, [photoshootResults, inlineVideoMap]);

    const handleMergeAllIklan = useCallback(async () => {
        const readyUrls = iklanResults
            .map(u => inlineVideoMap[u]?.state.videoUrl)
            .filter(Boolean) as string[];
        if (readyUrls.length === 0) { setMergeStatusIklan('Belum ada video selesai.'); return; }
        const downloadBase = import.meta.env?.DEV ? '/download' : '/api/download';
        const urls = readyUrls.map((u, i) => `${downloadBase}?url=${encodeURIComponent(u)}&filename=${encodeURIComponent(`iklan-${String(i + 1).padStart(2, '0')}.mp4`)}`);
        try { sessionStorage.setItem('EDITOR_NARASI_URLS', JSON.stringify(urls)); } catch {}
        try { window.dispatchEvent(new CustomEvent('navigate-editor-narasi', { detail: { urls } })); } catch {}
    }, [iklanResults, inlineVideoMap]);

    const handleMergeAllLipsync = useCallback(async () => {
        const readyUrls = lipsyncResults
            .map(item => inlineVideoMap[item.imageUrl]?.state.videoUrl)
            .filter(Boolean) as string[];
        if (readyUrls.length === 0) { setMergeStatusLipsync('Belum ada video selesai.'); return; }
        const downloadBase = import.meta.env?.DEV ? '/download' : '/api/download';
        const urls = readyUrls.map((u, i) => `${downloadBase}?url=${encodeURIComponent(u)}&filename=${encodeURIComponent(`lipsync-${String(i + 1).padStart(2, '0')}.mp4`)}`);
        try { sessionStorage.setItem('EDITOR_NARASI_URLS', JSON.stringify(urls)); } catch {}
        try { window.dispatchEvent(new CustomEvent('navigate-editor-narasi', { detail: { urls } })); } catch {}
    }, [lipsyncResults, inlineVideoMap]);

    // Download semua gambar
    const handleDownloadAllImages = useCallback((images: string[], prefix: string) => {
        if (images.length === 0) {
            alert('Tidak ada gambar untuk diunduh.');
            return;
        }
        images.forEach((url, idx) => {
            setTimeout(() => {
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = `${prefix}-${idx + 1}.png`;
                a.target = '_self';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { if (a.parentNode) a.parentNode.removeChild(a); }, 100);
            }, idx * 300);
        });
    }, []);

    // Download semua video dari inline video map
    const handleDownloadAllVideos = useCallback((imageUrls: string[], prefix: string) => {
        const videoUrls = imageUrls
            .map(u => inlineVideoMap[u]?.state.videoUrl)
            .filter(Boolean) as string[];
        
        if (videoUrls.length === 0) {
            alert('Tidak ada video selesai untuk diunduh.');
            return;
        }

        const downloadBase = import.meta.env?.DEV ? '/download' : '/api/download';
        videoUrls.forEach((url, idx) => {
            const filename = `${prefix}-video-${idx + 1}.mp4`;
            const proxied = `${downloadBase}?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
            setTimeout(() => {
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = proxied;
                a.download = filename;
                a.target = '_self';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { if (a.parentNode) a.parentNode.removeChild(a); }, 100);
            }, idx * 300);
        });
    }, [inlineVideoMap]);

    const handleLogout = () => {
        AuthService.logout();
        setCurrentUser(null);
        setJobs([]); // Clear jobs on logout
    };

    // --- RENDER LOGIN IF NO USER ---
    if (!currentUser) {
        return <LoginPage onLogin={setCurrentUser} />;
    }

    // --- RENDER MAIN APP ---
    const activeJob = jobs.find(j => j.id === activeJobId) || jobs[jobs.length - 1];
    const generationState = activeJob?.state || { status: GenerationStatus.Idle, progress: 0, message: '' };
    const currentAspectRatio = activeJob?.options.aspectRatio || AspectRatio.Landscape;

    const parseYMD = (s?: string) => {
        try {
            const [y, m, d] = (s || '').split('-').map(n => Number(n));
            if (!y || !m || !d) return null;
            return new Date(Date.UTC(y, m - 1, d));
        } catch {
            return null;
        }
    };
    const remainingDays = (() => {
        const expiry = parseYMD(currentUser?.expiryDate);
        const today = parseYMD(currentUser?.lastResetDate);
        if (!expiry || !today) return undefined;
        const ms = expiry.getTime() - today.getTime();
        const days = Math.ceil(ms / 86400000);
        return Math.max(days, 0);
    })();

    return (
        <div className="flex-1 flex flex-col font-sans text-base min-h-screen">
            {/* Animated Background (off for TTS to be pure white) */}
            <div className={`fixed inset-0 z-0 pointer-events-none ${activeFeature === 'tts' ? 'bg-white' : 'overflow-hidden bg-slate-50'}`}>
                {activeFeature === 'tts' ? null : (
                    <div
                        className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] opacity-40 animate-gradient-x"
                        style={{
                            backgroundImage:
                                'radial-gradient(circle at center, rgba(249,115,22,0.08) 0%, rgba(251,146,60,0.05) 30%, transparent 70%)',
                        }}
                    />
                )}
            </div>

            {/* Header */}
            <header className={`${isGlobalModalOpen ? 'hidden' : ''} relative z-20 py-4 px-4 md:px-8 border-b border-slate-200 bg-white/80 backdrop-blur-xl sticky top-0`}
            >
                <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-4">
                     <div className="flex flex-col">
                        <h1 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight text-slate-900 leading-none flex items-center gap-2">
                            <span>Vidgo</span> <span className="text-veo-primary">Max</span>
                        </h1>
                        <div className="flex items-center gap-2 mt-1">
                             <a href="https://www.azkazamdigital.com" target="_blank" rel="noopener noreferrer" className="text-veo-primary text-xs sm:text-sm font-bold hover:text-veo-primary transition-colors">
                                by azkazamdigital.com
                            </a>
                            <a
                                href="https://wa.me/6285240956744"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-50 border border-green-100 text-green-600 hover:bg-green-100 transition-colors"
                                title="Hubungi Admin via WhatsApp"
                            >
                                <WhatsAppIcon className="w-4 h-4" />
                            </a>
                            <a
                                href="https://wa.me/6285240956744"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-green-600 text-xs sm:text-sm font-bold hover:text-green-700 transition-colors"
                                title="Kontak Admin"
                            >
                                Kontak Admin
                            </a>
                        </div>
                     </div>

                     {/* User Controls */}
                     <div className="flex items-center gap-3 md:gap-6">
                        {currentUser.role === 'admin' && (
                            <button
                                onClick={() => setShowAdminModal(true)}
                                className="hidden sm:flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-veo-primary transition-colors shadow-sm"
                            >
                                <UsersIcon className="w-5 h-5" />
                                Kelola User
                            </button>
                        )}

                        {/* Credit Badge (hanya untuk fitur video) */}
                        {activeFeature === 'video' && (
                            <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-veo-primary/5 rounded-xl border border-veo-primary/10" title="Kredit Harian Anda">
                                <SparklesIcon className="w-5 h-5 text-veo-primary" />
                                <div className="flex flex-col leading-none">
                                    <span className="text-[10px] font-bold text-veo-primary uppercase tracking-wider">Sisa Kredit</span>
                                    <span className="font-black text-slate-900">{currentUser.remainingCredits} / {currentUser.dailyLimit}</span>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center gap-3 pl-4 sm:border-l border-slate-200">
                             <div className="hidden md:flex flex-col items-end">
                                 <span className="text-sm font-bold text-slate-700 truncate max-w-[150px]">{currentUser.email}</span>
                                 <span className={`text-xs font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${currentUser.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-500'}`}>{currentUser.role}</span>
                             </div>
                             <button
                                onClick={handleLogout}
                                className="p-2 md:px-4 md:py-2 flex items-center gap-2 rounded-xl text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all"
                                title="Keluar"
                             >
                                 <ArrowRightOnRectangleIcon className="w-6 h-6" />
                                 <span className="hidden md:inline font-bold text-sm">Keluar</span>
                             </button>
                        </div>
                     </div>
                </div>
                {sessionWarn && (
                    <div className="max-w-[1600px] mx-auto mt-3">
                        <div className="rounded-xl bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 text-sm font-bold">
                            Sesi akan berakhir dalam {Math.max(sessionRemainingMin, 1)} menit. Lanjutkan aktivitas untuk memperpanjang.
                        </div>
                    </div>
                )}

            </header>

            {/* Main Content */}
            <main className="relative z-10 flex-1 p-3 md:p-6 lg:p-8">
                <div className="max-w-[1600px] mx-auto">
                    {/* Mobile User Info & Credit (Visible only on small screens; kredit hanya untuk video) */}
                    <div className="md:hidden flex items-center justify-between mb-4 px-2">
                        {activeFeature === 'video' && isFeatureAllowed('video') && (
                            <div className="flex items-center gap-2 px-3 py-2 bg-white/50 rounded-lg border border-slate-200">
                                <SparklesIcon className="w-4 h-4 text-veo-primary" />
                                <span className="text-sm font-bold text-slate-700">Kredit: {currentUser.remainingCredits}/{currentUser.dailyLimit}</span>
                            </div>
                        )}
                        {currentUser.role === 'admin' && (
                            <button onClick={() => setShowAdminModal(true)} className="p-2 bg-slate-900 text-white rounded-lg">
                                <UsersIcon className="w-5 h-5" />
                            </button>
                        )}
                    </div>

                    <div className={`flex flex-col lg:grid ${['dashboard','tts','cinema','ugccaption','tanyabangvidgo','ugchand','editornarasi','kontenbelajaranak','nanobananapro','buatceritaanak'].includes(activeFeature) ? 'lg:grid-cols-[220px_1fr] xl:grid-cols-[240px_1fr]' : 'lg:grid-cols-[220px_450px_1fr] xl:grid-cols-[240px_500px_1fr]'} gap-6 lg:gap-8 items-start`}>
                        {/* Sidebar Menu */}
                        <aside className="glass-panel rounded-3xl p-4 md:p-6 space-y-3 h-fit self-center lg:self-start w-full max-w-[320px] lg:max-w-none">
                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Menu</h3>
                            <div className="flex flex-col gap-2">
                                <button
                                    className={`flex items-center gap-3 px-3 py-2 rounded-xl border text-sm font-bold transition-all ${activeFeature === 'dashboard' ? 'bg-veo-primary/10 border-veo-primary text-veo-primary' : 'bg-white border-slate-200 text-slate-700 hover:border-veo-primary/30'}`}
                                    onClick={() => setActiveFeature('dashboard')}
                                >
                                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border ${activeFeature === 'dashboard' ? 'bg-veo-primary/10 border-veo-primary/30 text-veo-primary' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                        <ChartBarIcon className="w-5 h-5" />
                                    </span>
                                    <span>Dashboard</span>
                                </button>
                                <button
                                    className={`flex items-center gap-3 px-3 py-2 rounded-xl border text-sm font-bold transition-all ${activeFeature === 'tanyabangvidgo' ? 'bg-veo-primary/10 border-veo-primary text-veo-primary' : 'bg-white border-slate-200 text-slate-700 hover:border-veo-primary/30'} ${!isFeatureAllowed('tanyabangvidgo') ? 'opacity-60 cursor-not-allowed' : ''}`}
                                    onClick={() => isFeatureAllowed('tanyabangvidgo') ? setActiveFeature('tanyabangvidgo') : alert('Fitur ini belum diaktifkan untuk akun Anda.')}
                                >
                                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border ${activeFeature === 'tanyabangvidgo' ? 'bg-veo-primary/10 border-veo-primary/30 text-veo-primary' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                        <SparklesIcon className="w-5 h-5" />
                                    </span>
                                    <span>Tanya Bang Vidgo</span>
                                    {!isFeatureAllowed('tanyabangvidgo') && <LockClosedIcon className="w-4 h-4 text-slate-400 ml-auto" />}
                                </button>
                                <button
                                    className={`flex items-center gap-3 px-3 py-2 rounded-xl border text-sm font-bold transition-all ${activeFeature === 'video' ? 'bg-veo-primary/10 border-veo-primary text-veo-primary' : 'bg-white border-slate-200 text-slate-700 hover:border-veo-primary/30'} ${!isFeatureAllowed('video') ? 'opacity-60 cursor-not-allowed' : ''}`}
                                    onClick={() => isFeatureAllowed('video') ? setActiveFeature('video') : alert('Fitur ini belum diaktifkan untuk akun Anda.')}
                                >
                                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border ${activeFeature === 'video' ? 'bg-veo-primary/10 border-veo-primary/30 text-veo-primary' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                        <VideoIcon className="w-5 h-5" />
                                    </span>
                                    <span>Generate Video (VEO 3.1)</span>
                                    {!isFeatureAllowed('video') && <LockClosedIcon className="w-4 h-4 text-slate-400 ml-auto" />}
                                </button>
                                <button
                                    className={`flex items-center gap-3 px-3 py-2 rounded-xl border text-sm font-bold transition-all ${activeFeature === 'image' ? 'bg-veo-primary/10 border-veo-primary text-veo-primary' : 'bg-white border-slate-200 text-slate-700 hover:border-veo-primary/30'} ${!isFeatureAllowed('image') ? 'opacity-60 cursor-not-allowed' : ''}`}
                                    onClick={() => isFeatureAllowed('image') ? setActiveFeature('image') : alert('Fitur ini belum diaktifkan untuk akun Anda.')}
                                >
                                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border ${activeFeature === 'image' ? 'bg-veo-primary/10 border-veo-primary/30 text-veo-primary' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                        <PhotoIcon className="w-5 h-5" />
                                    </span>
                                    <span>Hasilkan Gambar</span>
                                    {!isFeatureAllowed('image') && <LockClosedIcon className="w-4 h-4 text-slate-400 ml-auto" />}
                                </button>
                                <button
                                    className={`flex items-center gap-3 px-3 py-2 rounded-xl border text-sm font-bold transition-all ${activeFeature === 'cinema' ? 'bg-veo-primary/10 border-veo-primary text-veo-primary' : 'bg-white border-slate-200 text-slate-700 hover:border-veo-primary/30'} ${!isFeatureAllowed('cinema') ? 'opacity-60 cursor-not-allowed' : ''}`}
                                    onClick={() => isFeatureAllowed('cinema') ? setActiveFeature('cinema') : alert('Fitur ini belum diaktifkan untuk akun Anda.')}
                                >
                                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border ${activeFeature === 'cinema' ? 'bg-veo-primary/10 border-veo-primary/30 text-veo-primary' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                        <SparklesIcon className="w-5 h-5" />
                                    </span>
                                    <span>Cinema AI</span>
                                    {!isFeatureAllowed('cinema') && <LockClosedIcon className="w-4 h-4 text-slate-400 ml-auto" />}
                                </button>
                                <button
                                    className={`flex items-center gap-3 px-3 py-2 rounded-xl border text-sm font-bold transition-all ${activeFeature === 'photoshoot' ? 'bg-veo-primary/10 border-veo-primary text-veo-primary' : 'bg-white border-slate-200 text-slate-700 hover:border-veo-primary/30'} ${!isFeatureAllowed('photoshoot') ? 'opacity-60 cursor-not-allowed' : ''}`}
                                    onClick={() => isFeatureAllowed('photoshoot') ? setActiveFeature('photoshoot') : alert('Fitur ini belum diaktifkan untuk akun Anda.')}
                                >
                                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border ${activeFeature === 'photoshoot' ? 'bg-veo-primary/10 border-veo-primary/30 text-veo-primary' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                        <PhotoshootIcon className="w-5 h-5" />
                                    </span>
                                    <span>AI Photoshoot</span>
                                    {!isFeatureAllowed('photoshoot') && <LockClosedIcon className="w-4 h-4 text-slate-400 ml-auto" />}
                                </button>
                                <button
                                    className={`flex items-center gap-3 px-3 py-2 rounded-xl border text-sm font-bold transition-all ${activeFeature === 'iklan' ? 'bg-veo-primary/10 border-veo-primary text-veo-primary' : 'bg-white border-slate-200 text-slate-700 hover:border-veo-primary/30'} ${!isFeatureAllowed('iklan') ? 'opacity-60 cursor-not-allowed' : ''}`}
                                    onClick={() => isFeatureAllowed('iklan') ? setActiveFeature('iklan') : alert('Fitur ini belum diaktifkan untuk akun Anda.')}
                                >
                                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border ${activeFeature === 'iklan' ? 'bg-veo-primary/10 border-veo-primary/30 text-veo-primary' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                        <AdStudioIcon className="w-5 h-5" />
                                    </span>
                                    <span>Studio Iklan AI</span>
                                    {!isFeatureAllowed('iklan') && <LockClosedIcon className="w-4 h-4 text-slate-400 ml-auto" />}
                                </button>
                                <button
                                    className={`flex items-center gap-3 px-3 py-2 rounded-xl border text-sm font-bold transition-all ${activeFeature === 'banner' ? 'bg-veo-primary/10 border-veo-primary text-veo-primary' : 'bg-white border-slate-200 text-slate-700 hover:border-veo-primary/30'} ${!isFeatureAllowed('banner') ? 'opacity-60 cursor-not-allowed' : ''}`}
                                    onClick={() => isFeatureAllowed('banner') ? setActiveFeature('banner') : alert('Fitur ini belum diaktifkan untuk akun Anda.')}
                                >
                                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border ${activeFeature === 'banner' ? 'bg-veo-primary/10 border-veo-primary/30 text-veo-primary' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                        <AdStudioIcon className="w-5 h-5" />
                                    </span>
                                    <span>AI Banner Produk</span>
                                    {!isFeatureAllowed('banner') && <LockClosedIcon className="w-4 h-4 text-slate-400 ml-auto" />}
                                </button>
                                <button
                                    className={`flex items-center gap-3 px-3 py-2 rounded-xl border text-sm font-bold transition-all ${activeFeature === 'nanobananapro' ? 'bg-veo-primary/10 border-veo-primary text-veo-primary' : 'bg-white border-slate-200 text-slate-700 hover:border-veo-primary/30'} ${!isFeatureAllowed('nanobananapro') ? 'opacity-60 cursor-not-allowed' : ''}`}
                                    onClick={() => isFeatureAllowed('nanobananapro') ? setActiveFeature('nanobananapro') : alert('Fitur ini belum diaktifkan untuk akun Anda.')}
                                >
                                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border ${activeFeature === 'nanobananapro' ? 'bg-veo-primary/10 border-veo-primary/30 text-veo-primary' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                        <SparklesIcon className="w-5 h-5" />
                                    </span>
                                    <span>Nano Banana Pro</span>
                                    {!isFeatureAllowed('nanobananapro') && <LockClosedIcon className="w-4 h-4 text-slate-400 ml-auto" />}
                                </button>
                        <button
                            className={`flex items-center gap-3 px-3 py-2 rounded-xl border text-sm font-bold transition-all ${activeFeature === 'ugccaption' ? 'bg-veo-primary/10 border-veo-primary text-veo-primary' : 'bg-white border-slate-200 text-slate-700 hover:border-veo-primary/30'} ${!isFeatureAllowed('ugccaption') ? 'opacity-60 cursor-not-allowed' : ''}`}
                            onClick={() => isFeatureAllowed('ugccaption') ? setActiveFeature('ugccaption') : alert('Fitur ini belum diaktifkan untuk akun Anda.')}
                        >
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border ${activeFeature === 'ugccaption' ? 'bg-veo-primary/10 border-veo-primary/30 text-veo-primary' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                <SparklesIcon className="w-5 h-5" />
                            </span>
                            <span>Buat Caption & Scrip Lypsing</span>
                            {!isFeatureAllowed('ugccaption') && <LockClosedIcon className="w-4 h-4 text-slate-400 ml-auto" />}
                        </button>
                        <button
                            className={`flex items-center gap-3 px-3 py-2 rounded-xl border text-sm font-bold transition-all ${activeFeature === 'ugchand' ? 'bg-veo-primary/10 border-veo-primary text-veo-primary' : 'bg-white border-slate-200 text-slate-700 hover:border-veo-primary/30'} ${!isFeatureAllowed('ugchand') ? 'opacity-60 cursor-not-allowed' : ''}`}
                            onClick={() => isFeatureAllowed('ugchand') ? setActiveFeature('ugchand') : alert('Fitur ini belum diaktifkan untuk akun Anda.')}
                        >
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border ${activeFeature === 'ugchand' ? 'bg-veo-primary/10 border-veo-primary/30 text-veo-primary' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                <PhotoshootIcon className="w-5 h-5" />
                            </span>
                            <span>Studio Model Tangan UGC</span>
                            {!isFeatureAllowed('ugchand') && <LockClosedIcon className="w-4 h-4 text-slate-400 ml-auto" />}
                        </button>
                        <button
                            className={`flex items-center gap-3 px-3 py-2 rounded-xl border text-sm font-bold transition-all ${activeFeature === 'editornarasi' ? 'bg-veo-primary/10 border-veo-primary text-veo-primary' : 'bg-white border-slate-200 text-slate-700 hover:border-veo-primary/30'} ${!isFeatureAllowed('editornarasi') ? 'opacity-60 cursor-not-allowed' : ''}`}
                            onClick={() => isFeatureAllowed('editornarasi') ? setActiveFeature('editornarasi') : alert('Fitur ini belum diaktifkan untuk akun Anda.')}
                        >
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border ${activeFeature === 'editornarasi' ? 'bg-veo-primary/10 border-veo-primary/30 text-veo-primary' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                <VideoIcon className="w-5 h-5" />
                            </span>
                            <span>Editor Video & Narasi</span>
                            {!isFeatureAllowed('editornarasi') && <LockClosedIcon className="w-4 h-4 text-slate-400 ml-auto" />}
                        </button>
                                <button
                                    className={`flex items-center gap-3 px-3 py-2 rounded-xl border text-sm font-bold transition-all ${activeFeature === 'lipsync' ? 'bg-veo-primary/10 border-veo-primary text-veo-primary' : 'bg-white border-slate-200 text-slate-700 hover:border-veo-primary/30'} ${!isFeatureAllowed('lipsync') ? 'opacity-60 cursor-not-allowed' : ''}`}
                                    onClick={() => isFeatureAllowed('lipsync') ? setActiveFeature('lipsync') : alert('Fitur ini belum diaktifkan untuk akun Anda.')}
                                >
                                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border ${activeFeature === 'lipsync' ? 'bg-veo-primary/10 border-veo-primary/30 text-veo-primary' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                        <VideoIcon className="w-5 h-5" />
                                    </span>
                                    <span>Lipsync Script</span>
                                    {!isFeatureAllowed('lipsync') && <LockClosedIcon className="w-4 h-4 text-slate-400 ml-auto" />}
                                </button>
                                <button
                                    className={`flex items-center gap-3 px-3 py-2 rounded-xl border text-sm font-bold transition-all ${activeFeature === 'kontenbelajaranak' ? 'bg-veo-primary/10 border-veo-primary text-veo-primary' : 'bg-white border-slate-200 text-slate-700 hover:border-veo-primary/30'} ${!isFeatureAllowed('kontenbelajaranak') ? 'opacity-60 cursor-not-allowed' : ''}`}
                                    onClick={() => isFeatureAllowed('kontenbelajaranak') ? setActiveFeature('kontenbelajaranak') : alert('Fitur ini belum diaktifkan untuk akun Anda.')}
                                >
                                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border ${activeFeature === 'kontenbelajaranak' ? 'bg-veo-primary/10 border-veo-primary/30 text-veo-primary' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                        <SparklesIcon className="w-5 h-5" />
                                    </span>
                                    <span>Konten Belajar Anak</span>
                                    {!isFeatureAllowed('kontenbelajaranak') && <LockClosedIcon className="w-4 h-4 text-slate-400 ml-auto" />}
                                </button>
                                <button
                                    className={`flex items-center gap-3 px-3 py-2 rounded-xl border text-sm font-bold transition-all ${activeFeature === 'buatceritaanak' ? 'bg-veo-primary/10 border-veo-primary text-veo-primary' : 'bg-white border-slate-200 text-slate-700 hover:border-veo-primary/30'} ${!isFeatureAllowed('buatceritaanak') ? 'opacity-60 cursor-not-allowed' : ''}`}
                                    onClick={() => isFeatureAllowed('buatceritaanak') ? setActiveFeature('buatceritaanak') : alert('Fitur ini belum diaktifkan untuk akun Anda.')}
                                >
                                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border ${activeFeature === 'buatceritaanak' ? 'bg-veo-primary/10 border-veo-primary/30 text-veo-primary' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                        <SparklesIcon className="w-5 h-5" />
                                    </span>
                                    <span>Konten Cerita</span>
                                    {!isFeatureAllowed('buatceritaanak') && <LockClosedIcon className="w-4 h-4 text-slate-400 ml-auto" />}
                                </button>
                                <button
                                    className={`flex items-center gap-3 px-3 py-2 rounded-xl border text-sm font-bold transition-all ${activeFeature === 'tts' ? 'bg-veo-primary/10 border-veo-primary text-veo-primary' : 'bg-white border-slate-200 text-slate-700 hover:border-veo-primary/30'} ${!isFeatureAllowed('tts') ? 'opacity-60 cursor-not-allowed' : ''}`}
                                    onClick={() => isFeatureAllowed('tts') ? setActiveFeature('tts') : alert('Fitur ini belum diaktifkan untuk akun Anda.')}
                                >
                                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border ${activeFeature === 'tts' ? 'bg-veo-primary/10 border-veo-primary/30 text-veo-primary' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                        <SparklesIcon className="w-5 h-5" />
                                    </span>
                                    <span>Teks ke Suara</span>
                                    {!isFeatureAllowed('tts') && <LockClosedIcon className="w-4 h-4 text-slate-400 ml-auto" />}
                                </button>
                            </div>
                        </aside>
                        {/* Left Column (Form & Queue) */}
                        <div className="w-full space-y-6">
                            {/* Keep-alive: render Generate Video selalu, hanya disembunyikan saat tidak aktif */}
                            <div className={activeFeature === 'video' && isFeatureAllowed('video') ? '' : 'hidden'} aria-hidden={activeFeature !== 'video' || !isFeatureAllowed('video')}>
                                <GenerationForm
                                    status={activeJob?.state.status || GenerationStatus.Idle}
                                    onSubmit={handleGenerate}
                                    disabled={isGlobalBusy || currentUser.remainingCredits <= 0}
                                    onStop={handleStopVideo}
                                />

                                {jobs.length > 0 && (
                                    <div className="glass-panel rounded-3xl p-4 md:p-6 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-lg md:text-xl font-bold text-slate-900">Riwayat Sesi Ini ({jobs.length})</h3>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={handleMergeAll}
                                                    disabled={isMerging}
                                                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-xs md:text-sm transition-colors shadow-sm ${isMerging ? 'bg-slate-300 text-slate-600 cursor-not-allowed' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
                                                    title="Gabungkan Semua Video"
                                                >
                                                    <VideoIcon className="w-4 h-4" />
                                                    <span>{isMerging ? 'Menggabungkan...' : 'Gabungkan Semua'}</span>
                                                </button>
                                                <button
                                                    onClick={handleDownloadAll}
                                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-veo-primary text-white font-bold text-xs md:text-sm hover:bg-veo-primary/90 transition-colors shadow-sm"
                                                    title="Download Semua Video"
                                                >
                                                    <DownloadIcon className="w-4 h-4" />
                                                    <span>Download Semua</span>
                                                </button>
                                            </div>
                                        </div>
                                        {(isMerging || mergedVideoUrl) && (
                                            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-3">
                                                <div className="text-xs font-semibold text-slate-700">{mergeStatus || 'Siap'}</div>
                                                <div className="flex items-center gap-2">
                                                    <div className="h-2 w-24 bg-slate-200 rounded">
                                                        <div className="h-2 bg-veo-primary rounded" style={{ width: `${mergeProgress}%` }}></div>
                                                    </div>
                                                    {mergedVideoUrl && (
                                                        <a href={mergedVideoUrl} download={"veo3-merged.mp4"} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-green-600 text-white text-xs font-bold">
                                                            <DownloadIcon className="w-4 h-4" />
                                                            <span>Download Gabungan</span>
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                            {jobs.slice().reverse().map(job => (
                                                <div
                                                    key={job.id}
                                                    onClick={() => {
                                                        setActiveJobId(job.id);
                                                        if (window.innerWidth < 1024) {
                                                            document.getElementById('video-display-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                                        }
                                                    }}
                                                    className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                                                        activeJobId === job.id
                                                            ? 'border-veo-primary bg-veo-primary/5 shadow-sm'
                                                            : 'border-slate-200 bg-white hover:border-veo-primary/30'
                                                    }`}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-sm font-medium text-slate-900 line-clamp-2 mb-2">{job.options.prompt}</p>
                                                            <div className="flex flex-wrap items-center gap-1.5">
                                                                <span className={`text-xs font-bold px-2 py-0.5 rounded-md uppercase tracking-wider
                                                                    ${job.state.status === GenerationStatus.Completed ? 'bg-green-100 text-green-700' :
                                                                      job.state.status === GenerationStatus.Failed ? 'bg-red-100 text-red-700' :
                                                                      job.state.status === GenerationStatus.Pending ? 'bg-slate-100 text-slate-600' :
                                                                      'bg-veo-primary/10 text-veo-primary'}`}>
                                                                    {job.state.status === GenerationStatus.Processing || job.state.status === GenerationStatus.Uploading
                                                                        ? `${Math.round(job.state.progress)}%`
                                                                        : (job.state.status === GenerationStatus.Pending ? 'WAIT' :
                                                                           job.state.status === GenerationStatus.Completed ? 'DONE' :
                                                                           job.state.status === GenerationStatus.Failed ? 'FAIL' : job.state.status)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1 ml-auto">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleRegenerateForJob(job.id); }}
                                                                disabled={job.state.status === GenerationStatus.Uploading || job.state.status === GenerationStatus.Processing || job.state.status === GenerationStatus.Pending}
                                                                className={`inline-flex items-center justify-center w-9 h-9 rounded-xl border ${job.state.status === GenerationStatus.Uploading || job.state.status === GenerationStatus.Processing || job.state.status === GenerationStatus.Pending ? 'border-slate-200 text-slate-300 cursor-not-allowed' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                                                                title="Regenerate"
                                                            >
                                                                <ArrowPathIcon className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleDeleteJob(job.id); }}
                                                                disabled={job.state.status === GenerationStatus.Uploading || job.state.status === GenerationStatus.Processing}
                                                                className={`inline-flex items-center justify-center w-9 h-9 rounded-xl border ${job.state.status === GenerationStatus.Uploading || job.state.status === GenerationStatus.Processing ? 'border-slate-200 text-slate-300 cursor-not-allowed' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                                                                title="Hapus"
                                                            >
                                                                <XMarkIcon className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Keep-alive: render ImageGenerationForm selalu, hanya disembunyikan saat tidak aktif */}
                            <div className={activeFeature === 'image' && isFeatureAllowed('image') ? '' : 'hidden'} aria-hidden={activeFeature !== 'image' || !isFeatureAllowed('image')}>
                                <ImageGenerationForm
                                    status={imageState.status}
                                    disabled={isGlobalBusy}
                                    onSubmit={handleGenerateImage}
                                    onStop={handleStopImageGeneration}
                                />
                            </div>

                            {/* Keep-alive: render CinemaAI selalu, hanya disembunyikan saat tidak aktif */}
                            <div className={activeFeature === 'cinema' && isFeatureAllowed('cinema') ? '' : 'hidden'} aria-hidden={activeFeature !== 'cinema' || !isFeatureAllowed('cinema')}>
                                <CinemaAI inlineVideoMap={inlineVideoMap} onCreateInlineVideo={handleCreateVideoFromImageUrl} />
                            </div>

                            {/* Keep-alive: render Photoshoot & Iklan selalu, hanya disembunyikan saat tidak aktif */}
                            <div className={activeFeature === 'photoshoot' && isFeatureAllowed('photoshoot') ? '' : 'hidden'} aria-hidden={activeFeature !== 'photoshoot' || !isFeatureAllowed('photoshoot')}>
                                <AiPhotoshoot ref={aiPhotoshootRef} onResultsChange={setPhotoshootResults} />
                            </div>
                            <div className={activeFeature === 'iklan' && isFeatureAllowed('iklan') ? '' : 'hidden'} aria-hidden={activeFeature !== 'iklan' || !isFeatureAllowed('iklan')}>
                                <StudioIklan ref={studioIklanRef} onResultsChange={setIklanResults} />
                            </div>
                            <div className={activeFeature === 'banner' && isFeatureAllowed('banner') ? '' : 'hidden'} aria-hidden={activeFeature !== 'banner' || !isFeatureAllowed('banner')}>
                                <AiBannerProduk onResultsChange={setBannerResults} />
                            </div>
                            <div className={activeFeature === 'nanobananapro' && isFeatureAllowed('nanobananapro') ? '' : 'hidden'} aria-hidden={activeFeature !== 'nanobananapro' || !isFeatureAllowed('nanobananapro')}>
                                <NanoBananaPro 
                                    onResultsChange={(urls) => setImageResults(urls)} 
                                    onModalOpenChange={(open) => setIsGlobalModalOpen(open)} 
                                    onCreateVideo={(url, prompt) => handleCreateVideoFromImageUrl(url, prompt)}
                                    inlineVideoMap={inlineVideoMap}
                                />
                            </div>
                            <div className={activeFeature === 'ugccaption' && isFeatureAllowed('ugccaption') ? '' : 'hidden'} aria-hidden={activeFeature !== 'ugccaption' || !isFeatureAllowed('ugccaption')}>
                                <CaptionScriptLipsync />
                            </div>
                            <div className={activeFeature === 'tanyabangvidgo' && isFeatureAllowed('tanyabangvidgo') ? '' : 'hidden'} aria-hidden={activeFeature !== 'tanyabangvidgo' || !isFeatureAllowed('tanyabangvidgo')}>
                                <TanyaBangVidgoApp />
                            </div>
                            {/* Keep-alive: render UGC Hand */}
                            <div className={activeFeature === 'ugchand' && isFeatureAllowed('ugchand') ? '' : 'hidden'} aria-hidden={activeFeature !== 'ugchand' || !isFeatureAllowed('ugchand')}>
                                <UGCHandApp />
                            </div>
                            {/* Keep-alive: render Editor Video & Narasi */}
                            <div className={activeFeature === 'editornarasi' && isFeatureAllowed('editornarasi') ? '' : 'hidden'} aria-hidden={activeFeature !== 'editornarasi' || !isFeatureAllowed('editornarasi')}>
                                <EditorNarasiPage />
                            </div>
                            {/* Keep-alive: render Lipsync selalu, hanya disembunyikan saat tidak aktif */}
                            <div className={activeFeature === 'lipsync' && isFeatureAllowed('lipsync') ? '' : 'hidden'} aria-hidden={activeFeature !== 'lipsync' || !isFeatureAllowed('lipsync')}>
                                <Lipsync onResultsChange={setLipsyncResults} />
                            </div>
                            {/* Keep-alive: render TTS selalu, hanya disembunyikan saat tidak aktif */}
                            <div className={activeFeature === 'tts' && isFeatureAllowed('tts') ? '' : 'hidden'} aria-hidden={activeFeature !== 'tts' || !isFeatureAllowed('tts')}>
                                <TeksKeSuara />
                            </div>
                            <div className={activeFeature === 'kontenbelajaranak' && isFeatureAllowed('kontenbelajaranak') ? '' : 'hidden'} aria-hidden={activeFeature !== 'kontenbelajaranak' || !isFeatureAllowed('kontenbelajaranak')}>
                                <KontenBelajarAnak />
                            </div>
                            <div className={activeFeature === 'buatceritaanak' && isFeatureAllowed('buatceritaanak') ? '' : 'hidden'} aria-hidden={activeFeature !== 'buatceritaanak' || !isFeatureAllowed('buatceritaanak')}>
                                <BuatCeritaAnak />
                            </div>
                            <div className={activeFeature === 'dashboard' ? '' : 'hidden'} aria-hidden={activeFeature !== 'dashboard'}>
                                <div className="glass-panel rounded-3xl p-4 md:p-6 space-y-6">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-lg md:text-xl font-bold text-slate-900">Dashboard Akun</h3>
                                        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-veo-primary/10 border border-veo-primary/20 text-veo-primary font-bold text-xs md:text-sm">
                                            <ChartBarIcon className="w-4 h-4" /> Status
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Email</div>
                                            <div className="text-slate-900 font-black">{currentUser.email}</div>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Masa Aktif</div>
                                            <div className="text-slate-900 font-black">{currentUser.expiryDate ? `${currentUser.lastResetDate} — ${currentUser.expiryDate}` : 'Tidak ditentukan'}</div>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Sisa Hari</div>
                                            <div className={`font-black ${typeof remainingDays === 'number' && remainingDays <= 3 ? 'text-red-600' : 'text-slate-900'}`}>{typeof remainingDays === 'number' ? `${remainingDays} hari` : '-'}</div>
                                        </div>
                                                <div className="rounded-3xl bg-gradient-to-br from-green-50 to-green-100/70 border border-green-200/70 p-5 shadow-sm shadow-green-100">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <div className="flex items-center gap-3">
                                                            <span className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-white border border-green-200 text-green-600 ring-1 ring-green-200/60">
                                                                <WhatsAppIcon className="w-5 h-5" />
                                                            </span>
                                                            <div className="text-sm font-black text-green-800 uppercase tracking-wider">Kontak Admin</div>
                                                        </div>
                                                        <span className="text-[11px] font-bold text-green-700 bg-white/60 border border-green-200/70 rounded-md px-2 py-0.5">Online</span>
                                                    </div>
                                                    
                                                    <div className="mt-4">
                                                        <a
                                                            href={`https://wa.me/6285240956744?text=${encodeURIComponent('Halo Admin, saya ingin perpanjang Vidgo Max.')}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-green-600 text-white font-bold text-sm hover:bg-green-700 shadow-lg shadow-green-500/20 ring-1 ring-green-600/20 transition-all"
                                                        >
                                                            <WhatsAppIcon className="w-4 h-4" /> Hubungi Admin
                                                        </a>
                                                    </div>
                                                </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Column (Display) */}
                        {(() => {
                            if (activeFeature === 'video') {
                                return (
                                    <div id="video-display-section" className="w-full lg:sticky lg:top-24 transition-all scroll-mt-24">
                                        <VideoDisplay
                                            state={generationState}
                                            aspectRatio={currentAspectRatio}
                                            options={activeJob?.options}
                                            onRegenerate={handleRegenerate}
                                            onExtend={handleExtend}
                                            isBusy={isGlobalBusy}
                                        />
                                    </div>
                                );
                            } else if (activeFeature === 'dashboard') {
                                return null;
                            } else if (activeFeature === 'image') {
                                return (
                                    <div id="result-display-section" className="w-full lg:sticky lg:top-24 transition-all scroll-mt-24">
                                        <div className="glass-panel rounded-3xl p-4 md:p-6 space-y-4">
                                            <div className="flex items-center justify-between flex-wrap gap-2">
                                                <h3 className="text-lg font-bold">Hasil Generate Gambar ({imageResults.length})</h3>
                                                {imageResults.length > 0 && (
                                                    <div className="flex items-center gap-2">
                                                        <button onClick={() => handleDownloadAllImages(imageResults, 'gem-fix')} className="px-3 py-2 rounded-xl bg-veo-primary text-white font-bold text-xs hover:bg-veo-primary/90">
                                                            <span className="flex items-center gap-1">
                                                                <DownloadIcon className="w-4 h-4" />
                                                                Download Semua
                                                            </span>
                                                        </button>
                                                        <button onClick={() => setImageResults([])} className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-red-600 hover:bg-red-50">Bersihkan</button>
                                                    </div>
                                                )}
                                            </div>
                                            {imageResults.length === 0 ? (
                                                <p className="text-slate-500">Belum ada hasil. Setelah generate, gambar akan muncul di sini.</p>
                                            ) : (
                                                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                                                    {imageResults.map((url, idx) => {
                                                        const inline = inlineVideoMap[url];
                                                        const st = inline?.state.status;
                                                        const videoUrl = inline?.state.videoUrl;
                                                        const isVideoReady = st === GenerationStatus.Completed && !!videoUrl;
                                                        const isLoading = st === GenerationStatus.Uploading || st === GenerationStatus.Pending || st === GenerationStatus.Processing;
                                                        const aspectCls = inline?.aspect === AspectRatio.Portrait
                                                            ? 'aspect-[9/16]'
                                                            : inline?.aspect === AspectRatio.Square
                                                                ? 'aspect-square'
                                                                : 'aspect-video';
                                                        const promptVal = imagePromptInputs[url] || '';
                                                        return (
                                                            <div key={idx} className="group relative border border-slate-200 rounded-2xl overflow-hidden bg-white">
                                                                <div className={`relative ${inline?.aspect ? aspectCls : 'h-64 md:h-72'} bg-black transition-all duration-500`}>
                                                                    {isVideoReady && (
                                                                        <div className="absolute inset-0 animate-fadeIn">
                                                                            <video src={videoUrl as string} controls autoPlay loop playsInline className="w-full h-full object-contain" />
                                                                            <div className="absolute top-2 right-2 z-10">
                                                                                <a href={(import.meta.env?.DEV ? '/download' : '/api/download') + `?url=${encodeURIComponent(videoUrl as string)}&filename=${encodeURIComponent('veo3-video.mp4')}`} className="bg-black/50 hover:bg-veo-primary/90 backdrop-blur-md text-white p-2 rounded-lg shadow-lg border border-white/10 transition-all" title="Download Video">
                                                                                    <DownloadIcon className="w-4 h-4" />
                                                                                </a>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                    {isLoading && (
                                                                        <div className="absolute inset-0 flex items-center justify-center p-4 animate-fadeIn">
                                                                            <div className="space-y-3 w-full max-w-xs text-center">
                                                                                <div className="relative w-14 h-14 mx-auto">
                                                                                    <div className="absolute inset-0 rounded-full border-8 border-slate-200/40"></div>
                                                                                    <div className="absolute inset-0 rounded-full border-t-8 border-veo-primary animate-spin"></div>
                                                                                </div>
                                                                                <p className="text-xs font-medium text-white/90">{inline?.state.message || 'Membuat video...'}</p>
                                                                                <div className="h-2 w-full bg-white/20 rounded-full overflow-hidden">
                                                                                    <div className="h-full bg-veo-primary rounded-full transition-all duration-700" style={{ width: `${Math.max(5, inline?.state.progress || 0)}%` }}></div>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                    {st === GenerationStatus.Failed && (
                                                                        <div className="absolute inset-0 flex items-center justify-center p-4 bg-red-50 animate-fadeIn">
                                                                            <div className="text-center space-y-2">
                                                                                <p className="text-xs text-red-700 font-semibold">{inline?.state.error || 'Gagal membuat video.'}</p>
                                                                                <button type="button" onClick={() => handleCreateVideoFromImageUrl(url, promptVal.trim() || undefined)} className="px-3 py-1.5 text-xs rounded-lg bg-red-600 text-white hover:bg-red-700">Coba Lagi</button>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                    {!inline || st === GenerationStatus.Idle || st === undefined ? (
                                                                        <>
                                                                            <img src={url} alt={`Result ${idx+1}`} className="w-full h-full object-cover cursor-pointer" onClick={() => setResultViewUrl(url)} />
                                                                            <a href={url} download={`gem-fix-${idx+1}.png`} aria-label="Download" className="absolute top-2 right-2 p-2 rounded-lg bg-white/90 border border-slate-200 text-slate-700 shadow-sm hover:bg-white">
                                                                                <DownloadIcon className="w-4 h-4"/>
                                                                            </a>
                                                                        </>
                                                                    ) : null}
                                                                </div>
                                                                <div className="p-3 border-t border-slate-200 space-y-2">
                                                                    <input
                                                                        type="text"
                                                                        value={promptVal}
                                                                        onChange={(e) => setImagePromptInputs(prev => ({ ...prev, [url]: e.target.value }))}
                                                                        className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                                                                        placeholder="Tulis prompt video"
                                                                    />
                                                                    {isVideoReady ? (
                                                                        <button type="button" disabled={isLoading} onClick={() => handleCreateVideoFromImageUrl(url, promptVal.trim() || undefined)} className={`inline-flex items-center justify-center w-full px-3 py-2 rounded-xl font-bold text-xs md:text-sm transition-colors shadow-sm ${isLoading ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-veo-primary text-white hover:bg-veo-primary/90'}`}>Generate Ulang</button>
                                                                    ) : (
                                                                        <button type="button" disabled={isLoading} onClick={() => handleCreateVideoFromImageUrl(url, promptVal.trim() || undefined)} className={`inline-flex items-center justify-center w-full px-3 py-2 rounded-xl font-bold text-xs md:text-sm transition-colors shadow-sm ${isLoading ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-veo-primary text-white hover:bg-veo-primary/90'}`}>Buat Video</button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            } else if (activeFeature === 'banner') {
                                return (
                                    <div id="result-display-section" className="w-full lg:sticky lg:top-24 transition-all scroll-mt-24">
                                        <div className="glass-panel rounded-3xl p-4 md:p-6 space-y-4">
                                            <div className="flex items-center justify-between flex-wrap gap-2">
                                                <h3 className="text-lg font-bold">Hasil AI Banner Produk ({bannerResults.length})</h3>
                                                {bannerResults.length > 0 && (
                                                    <div className="flex items-center gap-2">
                                                        <button onClick={() => handleDownloadAllImages(bannerResults, 'banner')} className="px-3 py-2 rounded-xl bg-veo-primary text-white font-bold text-xs hover:bg-veo-primary/90">
                                                            <span className="flex items-center gap-1">
                                                                <DownloadIcon className="w-4 h-4" />
                                                                Download Semua
                                                            </span>
                                                        </button>
                                                        <button onClick={() => setBannerResults([])} className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-red-600 hover:bg-red-50">Bersihkan</button>
                                                    </div>
                                                )}
                                            </div>
                                            {bannerResults.length === 0 ? (
                                                <p className="text-slate-500">Belum ada hasil. Setelah dibuat, banner akan muncul di sini.</p>
                                            ) : (
                                                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                                                    {bannerResults.map((url, idx) => (
                                                        <div key={idx} className="group relative border border-slate-200 rounded-2xl overflow-hidden bg-slate-50">
                                                            <img src={url} alt={`Banner ${idx+1}`} className="w-full h-64 md:h-72 object-cover cursor-pointer" onClick={() => setResultViewUrl(url)} />
                                                            <a href={url} download={`banner-${idx+1}.jpg`} aria-label="Download" className="absolute top-2 right-2 p-2 rounded-lg bg-white/90 border border-slate-200 text-slate-700 shadow-sm hover:bg-white">
                                                                <DownloadIcon className="w-4 h-4"/>
                                                            </a>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            } else if (activeFeature === 'photoshoot') {
                                return (
                                    <div id="result-display-section" className="w-full lg:sticky lg:top-24 transition-all scroll-mt-24">
                                        <div className="glass-panel rounded-3xl p-4 md:p-6 space-y-4">
                                            <div className="flex items-center justify-between flex-wrap gap-2">
                                                <h3 className="text-lg font-bold">Hasil Photoshoot ({photoshootResults.length})</h3>
                                                {photoshootResults.length > 0 && (
                                                    <div className="flex items-center gap-2">
                                                        <button onClick={() => handleDownloadAllImages(photoshootResults, 'photoshoot')} className="px-3 py-2 rounded-xl bg-veo-primary text-white font-bold text-xs hover:bg-veo-primary/90">
                                                            <span className="flex items-center gap-1">
                                                                <DownloadIcon className="w-4 h-4" />
                                                                Download Semua Gambar
                                                            </span>
                                                        </button>
                                                        <button onClick={() => handleDownloadAllVideos(photoshootResults, 'photoshoot')} className="px-3 py-2 rounded-xl bg-slate-800 text-white font-bold text-xs hover:bg-slate-900">
                                                            <span className="flex items-center gap-1">
                                                                <DownloadIcon className="w-4 h-4" />
                                                                Download Semua Video
                                                            </span>
                                                        </button>
                                                        <button onClick={() => setPhotoshootResults([])} className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-red-600 hover:bg-red-50">Bersihkan</button>
                                                    </div>
                                                )}
                                            </div>
                                            {photoshootResults.length > 0 && (
                                                <div className="flex flex-wrap items-center gap-3">
                                                    <button type="button" onClick={handleMergeAllPhotoshoot} disabled={isMergingPhotoshoot}
                                                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-white font-bold hover:bg-slate-900 disabled:opacity-60">
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M4 6h16v12H4z"/><path d="M9 8h6v8H9z"/></svg>
                                                        {isMergingPhotoshoot ? `Menggabungkan... ${mergeProgressPhotoshoot}%` : 'Gabungkan Semua'}
                                                    </button>
                                                    {mergedUrlPhotoshoot && (
                                                        <a href={mergedUrlPhotoshoot} download className="px-4 py-2 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700">Download Gabungan</a>
                                                    )}
                                                    {mergeStatusPhotoshoot && !mergedUrlPhotoshoot && <span className="text-xs text-slate-500">{mergeStatusPhotoshoot}</span>}
                                                </div>
                                            )}
                                            {photoshootResults.length === 0 ? (
                                                <p className="text-slate-500">Belum ada hasil. Setelah generate, gambar akan muncul di sini.</p>
                                            ) : (
                                                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                                                    {photoshootResults.map((url, idx) => {
                                                        const inline = inlineVideoMap[url];
                                                        const st = inline?.state.status;
                                                        const videoUrl = inline?.state.videoUrl;
                                                        const isVideoReady = st === GenerationStatus.Completed && !!videoUrl;
                                                        const isLoading = st === GenerationStatus.Uploading || st === GenerationStatus.Pending || st === GenerationStatus.Processing;
                                                        const isRegenerating = regeneratingIndices.has(url);
                                                        const aspectCls = inline?.aspect === AspectRatio.Portrait
                                                            ? 'aspect-[9/16]'
                                                            : inline?.aspect === AspectRatio.Square
                                                                ? 'aspect-square'
                                                                : 'aspect-video';
                                                        return (
                                                            <div key={idx} className="group relative border border-slate-200 rounded-2xl overflow-hidden bg-white">
                                                                <div className={`relative ${inline?.aspect ? aspectCls : 'h-64 md:h-72'} bg-black transition-all duration-500`}>
                                                                    {/* SUCCESS: tampilkan video menggantikan gambar */}
                                                                    {isVideoReady && (
                                                                        <div className="absolute inset-0 animate-fadeIn">
                                                                            <video
                                                                                src={videoUrl as string}
                                                                                controls
                                                                                autoPlay
                                                                                loop
                                                                                playsInline
                                                                                className="w-full h-full object-contain"
                                                                            />
                                                                            <div className="absolute top-2 right-2 z-10">
                                                                                <a
                                                                                    href={(import.meta.env?.DEV ? '/download' : '/api/download') + `?url=${encodeURIComponent(videoUrl as string)}&filename=${encodeURIComponent('veo3-video.mp4')}`}
                                                                                    className="bg-black/50 hover:bg-veo-primary/90 backdrop-blur-md text-white p-2 rounded-lg shadow-lg border border-white/10 transition-all"
                                                                                    title="Download Video"
                                                                                >
                                                                                    <DownloadIcon className="w-4 h-4" />
                                                                                </a>
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {/* LOADING: spinner + progress */}
                                                                    {(isLoading || isRegenerating) && (
                                                                        <div className="absolute inset-0 flex items-center justify-center p-4 animate-fadeIn">
                                                                            <div className="space-y-3 w-full max-w-xs text-center">
                                                                                <div className="relative w-14 h-14 mx-auto">
                                                                                    <div className="absolute inset-0 rounded-full border-8 border-slate-200/40"></div>
                                                                                    <div className="absolute inset-0 rounded-full border-t-8 border-veo-primary animate-spin"></div>
                                                                                </div>
                                                                                <p className="text-xs font-medium text-white/90">{isRegenerating ? 'Regenerate...' : (inline?.state.message || 'Membuat video...')}</p>
                                                                                {!isRegenerating && (
                                                                                    <div className="h-2 w-full bg-white/20 rounded-full overflow-hidden">
                                                                                        <div className="h-full bg-veo-primary rounded-full transition-all duration-700" style={{ width: `${Math.max(5, inline?.state.progress || 0)}%` }}></div>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {/* ERROR: panel kesalahan */}
                                                                    {st === GenerationStatus.Failed && (
                                                                        <div className="absolute inset-0 flex items-center justify-center p-4 bg-red-50 animate-fadeIn">
                                                                            <div className="text-center space-y-2">
                                                                                <p className="text-xs text-red-700 font-semibold">{inline?.state.error || 'Gagal membuat video.'}</p>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => handleCreateVideoFromImageUrl(url)}
                                                                                    className="px-3 py-1.5 text-xs rounded-lg bg-red-600 text-white hover:bg-red-700"
                                                                                >
                                                                                    Coba Lagi
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {/* IDLE: tampilkan gambar asli */}
                                                                    {(!inline || st === GenerationStatus.Idle || st === undefined) && !isRegenerating ? (
                                                                        <>
                                                                            <img src={url} alt={`Result ${idx+1}`} className="w-full h-full object-cover cursor-pointer" onClick={() => setResultViewUrl(url)} />
                                                                            <a href={url} download={`ai-photoshoot-${idx+1}.png`} aria-label="Download" className="absolute top-2 right-2 p-2 rounded-lg bg-white/90 border border-slate-200 text-slate-700 shadow-sm hover:bg-white">
                                                                                <DownloadIcon className="w-4 h-4"/>
                                                                            </a>
                                                                        </>
                                                                    ) : null}
                                                                </div>
                                                                <div className="p-3 border-t border-slate-200 space-y-2">
                                                                    {/* Tombol Regenerate Image */}
                                                                    {!isVideoReady && (
                                                                         <button
                                                                             type="button"
                                                                             onClick={() => handleRegenerateImagePhotoshoot(idx, url)}
                                                                             disabled={isLoading || isRegenerating}
                                                                             className="w-full py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-bold hover:bg-slate-50 disabled:opacity-50 flex items-center justify-center gap-2 mb-2"
                                                                         >
                                                                             <ArrowPathIcon className={`w-3 h-3 ${isRegenerating ? 'animate-spin' : ''}`} />
                                                                             {isRegenerating ? 'Regenerating...' : 'Regenerate Gambar'}
                                                                         </button>
                                                                    )}
                                                                    
                                                                    <input
                                                                        type="text"
                                                                        value={photoshootLypsingInputs[url] || ''}
                                                                        onChange={(e) => setPhotoshootLypsingInputs(prev => ({ ...prev, [url]: e.target.value }))}
                                                                        className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                                                                        placeholder="Buat Lypsing dalam Bahasa Indonesia (Opsional)"
                                                                    />
                                                                    {isVideoReady ? (
                                                                        <div className="space-y-2">
                                                                            <span className="block text-center text-xs font-bold text-veo-primary">Video selesai • 1080p</span>
                                                                            <button
                                                                                type="button"
                                                                                disabled={isLoading}
                                                                            onClick={() => handleCreateVideoFromImageUrl(
                                                                                    url,
                                                                                    (photoshootLypsingInputs[url] && photoshootLypsingInputs[url].trim())
                                                                                        ? `Buat Lypsing dalam Bahasa Indonesia: "${photoshootLypsingInputs[url].trim()}". Create a short vertical ad video (9:16) from this image. Use this Indonesian speaking line exactly. Keep premium commercial mood, dynamic camera motion, ~3 seconds.`
                                                                                        : undefined
                                                                                )}
                                                                                className={`inline-flex items-center justify-center w-full px-3 py-2 rounded-xl font-bold text-xs md:text-sm transition-colors shadow-sm ${isLoading ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-veo-primary text-white hover:bg-veo-primary/90'}`}
                                                                            >
                                                                                {isLoading ? 'Sedang Membuat…' : 'Generate Ulang Video'}
                                                                            </button>
                                                                        </div>
                                                                    ) : (
                                                                        <button
                                                                            type="button"
                                                                            disabled={isLoading}
                                                                            onClick={() => handleCreateVideoFromImageUrl(
                                                                                url,
                                                                                (photoshootLypsingInputs[url] && photoshootLypsingInputs[url].trim())
                                                                                    ? `Buat Lypsing dalam Bahasa Indonesia: "${photoshootLypsingInputs[url].trim()}". Create a short vertical ad video (9:16) from this image. Use this Indonesian speaking line exactly. Keep premium commercial mood, dynamic camera motion, ~3 seconds.`
                                                                                    : undefined
                                                                            )}
                                                                            className={`inline-flex items-center justify-center w-full px-3 py-2 rounded-xl font-bold text-xs md:text-sm transition-colors shadow-sm ${isLoading ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-veo-primary text-white hover:bg-veo-primary/90'}`}
                                                                        >
                                                                            {isLoading ? 'Sedang Membuat…' : 'Buat Video'}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            } else if (activeFeature === 'iklan') {
                                return (
                                    <div id="result-display-section" className="w-full lg:sticky lg:top-24 transition-all scroll-mt-24">
                                        <div className="glass-panel rounded-3xl p-4 md:p-6 space-y-4">
                                            <div className="flex items-center justify-between flex-wrap gap-2">
                                                <h3 className="text-lg font-bold">Hasil Iklan ({iklanResults.length})</h3>
                                                {iklanResults.length > 0 && (
                                                    <div className="flex items-center gap-2">
                                                        <button onClick={() => handleDownloadAllImages(iklanResults, 'iklan')} className="px-3 py-2 rounded-xl bg-veo-primary text-white font-bold text-xs hover:bg-veo-primary/90">
                                                            <span className="flex items-center gap-1">
                                                                <DownloadIcon className="w-4 h-4" />
                                                                Download Semua Gambar
                                                            </span>
                                                        </button>
                                                        <button onClick={() => handleDownloadAllVideos(iklanResults, 'iklan')} className="px-3 py-2 rounded-xl bg-slate-800 text-white font-bold text-xs hover:bg-slate-900">
                                                            <span className="flex items-center gap-1">
                                                                <DownloadIcon className="w-4 h-4" />
                                                                Download Semua Video
                                                            </span>
                                                        </button>
                                                        <button onClick={() => setIklanResults([])} className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-red-600 hover:bg-red-50">Bersihkan</button>
                                                    </div>
                                                )}
                                            </div>
                                            {iklanResults.length > 0 && (
                                                <div className="flex flex-wrap items-center gap-3">
                                                    <button type="button" onClick={handleMergeAllIklan} disabled={isMergingIklan}
                                                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-white font-bold hover:bg-slate-900 disabled:opacity-60">
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M4 6h16v12H4z"/><path d="M9 8h6v8H9z"/></svg>
                                                        {isMergingIklan ? `Menggabungkan... ${mergeProgressIklan}%` : 'Gabungkan Semua'}
                                                    </button>
                                                    {mergedUrlIklan && (
                                                        <a href={mergedUrlIklan} download className="px-4 py-2 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700">Download Gabungan</a>
                                                    )}
                                                    {mergeStatusIklan && !mergedUrlIklan && <span className="text-xs text-slate-500">{mergeStatusIklan}</span>}
                                                </div>
                                            )}
                                            {iklanResults.length === 0 ? (
                                                <p className="text-slate-500">Belum ada hasil. Setelah generate, gambar akan muncul di sini.</p>
                                            ) : (
                                                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                                                    {iklanResults.map((url, idx) => {
                                                        const inline = inlineVideoMap[url];
                                                        const st = inline?.state.status;
                                                        const videoUrl = inline?.state.videoUrl;
                                                        const isVideoReady = st === GenerationStatus.Completed && !!videoUrl;
                                                        const isLoading = st === GenerationStatus.Uploading || st === GenerationStatus.Pending || st === GenerationStatus.Processing;
                                                        const isRegenerating = regeneratingIndices.has(url);
                                                        const aspectCls = inline?.aspect === AspectRatio.Portrait
                                                            ? 'aspect-[9/16]'
                                                            : inline?.aspect === AspectRatio.Square
                                                                ? 'aspect-square'
                                                                : 'aspect-video';
                                                        return (
                                                            <div key={idx} className="group relative border border-slate-200 rounded-2xl overflow-hidden bg-white">
                                                                <div className={`relative ${inline?.aspect ? aspectCls : 'h-64 md:h-72'} bg-black transition-all duration-500`}>
                                                                    {isVideoReady && (
                                                                        <div className="absolute inset-0 animate-fadeIn">
                                                                            <video
                                                                                src={videoUrl as string}
                                                                                controls
                                                                                autoPlay
                                                                                loop
                                                                                playsInline
                                                                                className="w-full h-full object-contain"
                                                                            />
                                                                            <div className="absolute top-2 right-2 z-10">
                                                                                <a
                                                                                    href={(import.meta.env?.DEV ? '/download' : '/api/download') + `?url=${encodeURIComponent(videoUrl as string)}&filename=${encodeURIComponent('veo3-video.mp4')}`}
                                                                                    className="bg-black/50 hover:bg-veo-primary/90 backdrop-blur-md text-white p-2 rounded-lg shadow-lg border border-white/10 transition-all"
                                                                                    title="Download Video"
                                                                                >
                                                                                    <DownloadIcon className="w-4 h-4" />
                                                                                </a>
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {(isLoading || isRegenerating) && (
                                                                        <div className="absolute inset-0 flex items-center justify-center p-4 animate-fadeIn">
                                                                            <div className="space-y-3 w-full max-w-xs text-center">
                                                                                <div className="relative w-14 h-14 mx-auto">
                                                                                    <div className="absolute inset-0 rounded-full border-8 border-slate-200/40"></div>
                                                                                    <div className="absolute inset-0 rounded-full border-t-8 border-veo-primary animate-spin"></div>
                                                                                </div>
                                                                                <p className="text-xs font-medium text-white/90">{isRegenerating ? 'Regenerate...' : (inline?.state.message || 'Membuat video...')}</p>
                                                                                {!isRegenerating && (
                                                                                    <div className="h-2 w-full bg-white/20 rounded-full overflow-hidden">
                                                                                        <div className="h-full bg-veo-primary rounded-full transition-all duration-700" style={{ width: `${Math.max(5, inline?.state.progress || 0)}%` }}></div>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {st === GenerationStatus.Failed && (
                                                                        <div className="absolute inset-0 flex items-center justify-center p-4 bg-red-50 animate-fadeIn">
                                                                            <div className="text-center space-y-2">
                                                                                <p className="text-xs text-red-700 font-semibold">{inline?.state.error || 'Gagal membuat video.'}</p>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => handleCreateVideoFromImageUrl(url)}
                                                                                    className="px-3 py-1.5 text-xs rounded-lg bg-red-600 text-white hover:bg-red-700"
                                                                                >
                                                                                    Coba Lagi
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {(!inline || st === GenerationStatus.Idle || st === undefined) && !isRegenerating ? (
                                                                        <>
                                                                            <img src={url} alt={`Result ${idx+1}`} className="w-full h-full object-cover cursor-pointer" onClick={() => setResultViewUrl(url)} />
                                                                            <a href={url} download={`ai-ad-${idx+1}.png`} aria-label="Download" className="absolute top-2 right-2 p-2 rounded-lg bg-white/90 border border-slate-200 text-slate-700 shadow-sm hover:bg-white">
                                                                                <DownloadIcon className="w-4 h-4"/>
                                                                            </a>
                                                                        </>
                                                                    ) : null}
                                                                </div>
                                                                <div className="p-3 border-t border-slate-200">
                                                                    {/* Tombol Regenerate Image */}
                                                                    {!isVideoReady && (
                                                                         <button
                                                                             type="button"
                                                                             onClick={() => handleRegenerateImageIklan(idx, url)}
                                                                             disabled={isLoading || isRegenerating}
                                                                             className="w-full py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-bold hover:bg-slate-50 disabled:opacity-50 flex items-center justify-center gap-2 mb-2"
                                                                         >
                                                                             <ArrowPathIcon className={`w-3 h-3 ${isRegenerating ? 'animate-spin' : ''}`} />
                                                                             {isRegenerating ? 'Regenerating...' : 'Regenerate Gambar'}
                                                                         </button>
                                                                    )}
                                                                    <div className="mb-2">
                                                                        <input
                                                                            type="text"
                                                                            value={iklanPromptInputs[url] || ''}
                                                                            onChange={(e) => setIklanPromptInputs(prev => ({ ...prev, [url]: e.target.value }))}
                                                                            className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                                                                            placeholder="Tulis prompt video (opsional)"
                                                                        />
                                                                    </div>
                                                                    {isVideoReady ? (
                                                                        <div className="space-y-2">
                                                                            <span className="block text-center text-xs font-bold text-veo-primary">Video selesai • 1080p</span>
                                                                            <button
                                                                                type="button"
                                                                                disabled={isLoading}
                                                                                onClick={() => handleCreateVideoFromImageUrl(url, (iklanPromptInputs[url] && iklanPromptInputs[url].trim()) ? iklanPromptInputs[url].trim() : undefined)}
                                                                                className={`inline-flex items-center justify-center w-full px-3 py-2 rounded-xl font-bold text-xs md:text-sm transition-colors shadow-sm ${isLoading ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-veo-primary text-white hover:bg-veo-primary/90'}`}
                                                                            >
                                                                                {isLoading ? 'Sedang Membuat…' : 'Generate Ulang'}
                                                                            </button>
                                                                        </div>
                                                                    ) : (
                                                                        <button
                                                                            type="button"
                                                                            disabled={isLoading}
                                                                            onClick={() => handleCreateVideoFromImageUrl(url, (iklanPromptInputs[url] && iklanPromptInputs[url].trim()) ? iklanPromptInputs[url].trim() : undefined)}
                                                                            className={`inline-flex items-center justify-center w-full px-3 py-2 rounded-xl font-bold text-xs md:text-sm transition-colors shadow-sm ${isLoading ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-veo-primary text-white hover:bg-veo-primary/90'}`}
                                                                        >
                                                                            {isLoading ? 'Sedang Membuat…' : 'Buat Video'}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            } else if (activeFeature === 'lipsync') {
                                return (
                                    <div id="result-display-section" className="w-full lg:sticky lg:top-24 transition-all scroll-mt-24">
                                        <div className="glass-panel rounded-3xl p-4 md:p-6 space-y-4">
                                            <div className="flex items-center justify-between flex-wrap gap-2">
                                                <h3 className="text-lg font-bold">Hasil Skrip Lipsync ({lipsyncResults.length})</h3>
                                                {lipsyncResults.length > 0 && (
                                                    <div className="flex items-center gap-2">
                                                        <button onClick={() => handleDownloadAllVideos(lipsyncResults.map(r => r.imageUrl), 'lipsync')} className="px-3 py-2 rounded-xl bg-slate-800 text-white font-bold text-xs hover:bg-slate-900">
                                                            <span className="flex items-center gap-1">
                                                                <DownloadIcon className="w-4 h-4" />
                                                                Download Semua Video
                                                            </span>
                                                        </button>
                                                        <button onClick={() => setLipsyncResults([])} className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-red-600 hover:bg-red-50">Bersihkan</button>
                                                    </div>
                                                )}
                                            </div>
                                            {lipsyncResults.length > 0 && (
                                                <div className="flex flex-wrap items-center gap-3">
                                                    <button type="button" onClick={handleMergeAllLipsync} disabled={isMergingLipsync}
                                                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-white font-bold hover:bg-slate-900 disabled:opacity-60">
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M4 6h16v12H4z"/><path d="M9 8h6v8H9z"/></svg>
                                                        {isMergingLipsync ? `Menggabungkan... ${mergeProgressLipsync}%` : 'Gabungkan Semua'}
                                                    </button>
                                                    {mergedUrlLipsync && (
                                                        <a href={mergedUrlLipsync} download className="px-4 py-2 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700">Download Gabungan</a>
                                                    )}
                                                    {mergeStatusLipsync && !mergedUrlLipsync && <span className="text-xs text-slate-500">{mergeStatusLipsync}</span>}
                                                </div>
                                            )}
                                            {lipsyncResults.length === 0 ? (
                                                <p className="text-slate-500">Belum ada hasil. Setelah generate, foto dan skrip akan muncul di sini.</p>
                                            ) : (
                                                <div className="grid grid-cols-2 gap-4">
                                                    {lipsyncResults.map((item, idx) => {
                                                        const inline = inlineVideoMap[item.imageUrl];
                                                        const st = inline?.state.status;
                                                        const videoUrl = inline?.state.videoUrl;
                                                        const isVideoReady = st === GenerationStatus.Completed && !!videoUrl;
                                                        const isLoading = st === GenerationStatus.Uploading || st === GenerationStatus.Pending || st === GenerationStatus.Processing;
                                                        const aspectCls = inline?.aspect === AspectRatio.Portrait
                                                            ? 'aspect-[9/16]'
                                                            : inline?.aspect === AspectRatio.Square
                                                                ? 'aspect-square'
                                                                : 'aspect-video';
                                                        const lipsyncPrompt = `Create a short vertical ad video (9:16) from this image. Use this Indonesian speaking line exactly: "${(item.script || '').trim()}". Keep premium commercial mood, dynamic camera motion, ~3 seconds.`;
                                                        return (
                                                            <div key={idx} className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                                                                <div className={`relative ${inline?.aspect ? aspectCls : 'h-64'} bg-black transition-all duration-500`}>
                                                                    {/* SUCCESS: tampilkan video */}
                                                                    {isVideoReady && (
                                                                        <div className="absolute inset-0 animate-fadeIn">
                                                                            <video
                                                                                src={videoUrl as string}
                                                                                controls
                                                                                autoPlay
                                                                                loop
                                                                                playsInline
                                                                                className="w-full h-full object-contain"
                                                                            />
                                                                            <div className="absolute top-2 right-2 z-10">
                                                                                <a
                                                                                    href={(import.meta.env?.DEV ? '/download' : '/api/download') + `?url=${encodeURIComponent(videoUrl as string)}&filename=${encodeURIComponent('veo3-video.mp4')}`}
                                                                                    className="bg-black/50 hover:bg-veo-primary/90 backdrop-blur-md text-white p-2 rounded-lg shadow-lg border border-white/10 transition-all"
                                                                                    title="Download Video"
                                                                                >
                                                                                    <DownloadIcon className="w-4 h-4" />
                                                                                </a>
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {/* LOADING */}
                                                                    {isLoading && (
                                                                        <div className="absolute inset-0 flex items-center justify-center p-4 animate-fadeIn">
                                                                            <div className="space-y-3 w-full max-w-xs text-center">
                                                                                <div className="relative w-14 h-14 mx-auto">
                                                                                    <div className="absolute inset-0 rounded-full border-8 border-slate-200/40"></div>
                                                                                    <div className="absolute inset-0 rounded-full border-t-8 border-veo-primary animate-spin"></div>
                                                                                </div>
                                                                                <p className="text-xs font-medium text-white/90">{inline?.state.message || 'Membuat video...'}</p>
                                                                                <div className="h-2 w-full bg-white/20 rounded-full overflow-hidden">
                                                                                    <div className="h-full bg-veo-primary rounded-full transition-all duration-700" style={{ width: `${Math.max(5, inline?.state.progress || 0)}%` }}></div>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {/* ERROR */}
                                                                    {st === GenerationStatus.Failed && (
                                                                        <div className="absolute inset-0 flex items-center justify-center p-4 bg-red-50 animate-fadeIn">
                                                                            <div className="text-center space-y-2">
                                                                                <p className="text-xs text-red-700 font-semibold">{inline?.state.error || 'Gagal membuat video.'}</p>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => handleCreateVideoFromImageUrl(item.imageUrl, lipsyncPrompt)}
                                                                                    className="px-3 py-1.5 text-xs rounded-lg bg-red-600 text-white hover:bg-red-700"
                                                                                >
                                                                                    Coba Lagi
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {/* IDLE: gambar */}
                                                                    {!inline || st === GenerationStatus.Idle || st === undefined ? (
                                                                        <>
                                                                            <img
                                                                                src={item.imageUrl}
                                                                                alt={`Lipsync ${idx + 1}`}
                                                                                className="w-full h-full object-cover cursor-zoom-in"
                                                                                onClick={() => setResultViewUrl(item.imageUrl)}
                                                                            />
                                                                            <a
                                                                                href={item.imageUrl}
                                                                                download
                                                                                className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-white/90 border border-slate-200 text-slate-700 shadow-sm hover:bg-white"
                                                                                title="Unduh"
                                                                            >
                                                                                <DownloadIcon className="w-4 h-4" /> Unduh
                                                                            </a>
                                                                        </>
                                                                    ) : null}
                                                                </div>
                                                                <div className="p-3 space-y-2">
                                                                    <div className="flex items-start justify-between gap-2">
                                                                        {editingLipsyncIndex === idx ? (
                                                                            <input
                                                                                type="text"
                                                                                value={editingLipsyncText}
                                                                                onChange={(e) => setEditingLipsyncText(e.target.value)}
                                                                                className="flex-1 bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                                                                                placeholder="Tulis skrip lypsing"
                                                                            />
                                                                        ) : (
                                                                            <p className="text-xs text-slate-800 whitespace-pre-line">
                                                                                {`Buat Lypsing dalam Bahasa Indonesia: '${(item.script || '').trim()}'`}
                                                                            </p>
                                                                        )}
                                                                        <div className="flex items-center gap-2">
                                                                            {editingLipsyncIndex === idx ? (
                                                                                <>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => {
                                                                                            setLipsyncResults(prev => {
                                                                                                const arr = [...prev];
                                                                                                arr[idx] = { ...arr[idx], script: editingLipsyncText };
                                                                                                return arr;
                                                                                            });
                                                                                            setEditingLipsyncIndex(null);
                                                                                            setEditingLipsyncText('');
                                                                                        }}
                                                                                        className="px-2 py-1 text-xs rounded-lg bg-veo-primary text-white hover:bg-veo-primary/90"
                                                                                    >
                                                                                        Simpan
                                                                                    </button>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => { setEditingLipsyncIndex(null); setEditingLipsyncText(''); }}
                                                                                        className="px-2 py-1 text-xs rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                                                                                    >
                                                                                        Batal
                                                                                    </button>
                                                                                </>
                                                                            ) : (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => { setEditingLipsyncIndex(idx); setEditingLipsyncText(item.script || ''); }}
                                                                                    className="px-2 py-1 text-xs rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                                                                                >
                                                                                    Edit
                                                                                </button>
                                                                            )}
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => navigator.clipboard.writeText(`Buat Lypsing dalam Bahasa Indonesia: '${(item.script || '').trim()}'`)}
                                                                                className="px-2 py-1 text-xs rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                                                                            >
                                                                                Salin
                                                                            </button>
                                                                        </div>
                                                                    </div>

                                                                    {isVideoReady ? (
                                                                        <button
                                                                            type="button"
                                                                            disabled={isLoading}
                                                                            onClick={() => handleCreateVideoFromImageUrl(item.imageUrl, lipsyncPrompt)}
                                                                            className={`inline-flex items-center justify-center w-full px-3 py-2 rounded-xl font-bold text-xs md:text-sm transition-colors shadow-sm ${isLoading ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-veo-primary text-white hover:bg-veo-primary/90'}`}
                                                                        >
                                                                            {isLoading ? 'Sedang Membuat…' : 'Generate Ulang'}
                                                                        </button>
                                                                    ) : (
                                                                        <button
                                                                            type="button"
                                                                            disabled={isLoading}
                                                                            onClick={() => handleCreateVideoFromImageUrl(item.imageUrl, lipsyncPrompt)}
                                                                            className={`inline-flex items-center justify-center w-full px-3 py-2 rounded-xl font-bold text-xs md:text-sm transition-colors shadow-sm ${isLoading ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-veo-primary text-white hover:bg-veo-primary/90'}`}
                                                                        >
                                                                            {isLoading ? 'Sedang Membuat…' : 'Buat Video'}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            } else if (activeFeature === 'tts' || activeFeature === 'cinema' || activeFeature === 'ugccaption' || activeFeature === 'tanyabangvidgo' || activeFeature === 'editornarasi' || activeFeature === 'ugchand' || activeFeature === 'kontenbelajaranak') {
                                // Untuk Merger/Editor/UGC Hand: tidak ada panel kanan, konten penuh di kolom tengah
                                return null;
                            } else {
                                return (
                                    <div className="w-full lg:sticky lg:top-24 transition-all scroll-mt-24">
                                        <div className="glass-panel rounded-3xl p-6 text-slate-500">
                                            Hasil generate ditampilkan pada panel kiri untuk fitur ini.
                                        </div>
                                    </div>
                                );
                            }
                        })()}

                        {/* Overlay viewer */}
                        {resultViewUrl && (
                            <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setResultViewUrl(null)}>
                                <div className="relative w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
                                    <img src={resultViewUrl} alt="Preview Besar" className="w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl" />
                                    <button
                                        onClick={() => setResultViewUrl(null)}
                                        aria-label="Tutup"
                                        className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 border border-slate-200 text-slate-800 shadow-md flex items-center justify-center hover:bg-white"
                                    >
                                        <XMarkIcon className="w-5 h-5" />
                                    </button>
                                    <a href={resultViewUrl} download className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-veo-primary text-white shadow-sm"><DownloadIcon className="w-4 h-4"/>Download</a>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* Admin Modal */}
            {currentUser && currentUser.role === 'admin' && (
                <AdminUserModal
                    isOpen={showAdminModal}
                    onClose={() => setShowAdminModal(false)}
                    currentUserEmail={currentUser.email}
                />
            )}

            {/* Admin Notification Overlay - Cannot be closed by user */}
            {adminNotification && adminNotification.enabled && currentUser?.role !== 'admin' && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
                    <div className="glass-panel w-full max-w-lg rounded-3xl p-8 relative z-10 bg-white shadow-2xl border-slate-200 animate-scaleIn">
                        <div className="flex flex-col items-center text-center">
                            {/* Bell Icon */}
                            <div className="w-16 h-16 bg-veo-primary/10 rounded-full flex items-center justify-center mb-6">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-veo-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
                                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
                                </svg>
                            </div>
                            
                            {/* Title */}
                            {adminNotification.title && (
                                <h2 className="text-2xl font-black text-slate-900 mb-4">{adminNotification.title}</h2>
                            )}
                            
                            {/* Image */}
                            {adminNotification.image && adminNotification.image.trim() !== '' && (
                                <div className="mb-6 w-full">
                                    <img 
                                        src={adminNotification.image} 
                                        alt="Notification" 
                                        className="w-full max-h-64 object-contain rounded-2xl border border-slate-200 bg-slate-50"
                                        onError={(e) => { 
                                            const target = e.target as HTMLImageElement;
                                            target.style.display = 'none';
                                        }}
                                        onLoad={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            target.style.display = 'block';
                                        }}
                                    />
                                </div>
                            )}
                            
                            {/* Message */}
                            {adminNotification.message && (
                                <p className="text-slate-600 text-base leading-relaxed whitespace-pre-wrap">{adminNotification.message}</p>
                            )}
                            
                            {/* Info */}
                            <div className="mt-8 pt-6 border-t border-slate-200 w-full">
                                <p className="text-sm text-slate-500">
                                    Notifikasi ini dari Admin. Silakan tunggu hingga admin menonaktifkan notifikasi ini.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;
