

import React, { useEffect, useState } from 'react';
import { AuthService, User, UserRole } from '../services/authService';
import { PlusIcon, UsersIcon, XMarkIcon, SparklesIcon, ChartBarIcon, LockClosedIcon } from './icons';
import { ReportingService, ReportPeriod, ReportData } from '../services/reportingService';
import { supabase, isSupabaseEnabled } from '../services/supabaseClient';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    currentUserEmail: string;
}

const AdminUserModal: React.FC<Props> = ({ isOpen, onClose, currentUserEmail }) => {
    const [users, setUsers] = useState<User[]>([]);
    const [userToDelete, setUserToDelete] = useState<User | null>(null); // State for confirmation modal
    const [editingUser, setEditingUser] = useState<User | null>(null);
    
    // Form State
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');
    const [newUserRole, setNewUserRole] = useState<UserRole>('user');
    const [newUserLimit, setNewUserLimit] = useState<number>(5);
    const [newUserMaxSessions, setNewUserMaxSessions] = useState<number>(1);
    const [newUserExpiry, setNewUserExpiry] = useState('');
    const FEATURES = ['video','image','cinema','photoshoot','iklan','banner','ugccaption','tanyabangvidgo','editornarasi','lipsync','tts','kontenbelajaranak'] as const;
    const [newUserFeatures, setNewUserFeatures] = useState<string[]>([...FEATURES]);
    
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    // Report State
    const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('today');
    const [reportData, setReportData] = useState<ReportData | null>(null);

    // VEO3 Token State (Admin-only)
    const [veoToken, setVeoToken] = useState('');
    const [tokenMsg, setTokenMsg] = useState('');
    const [tokenErr, setTokenErr] = useState('');
    const [search, setSearch] = useState('');

    // Notification State (Admin-only)
    const [notifEnabled, setNotifEnabled] = useState(false);
    const [notifTitle, setNotifTitle] = useState('');
    const [notifMessage, setNotifMessage] = useState('');
    const [notifImage, setNotifImage] = useState('');
    const [notifMsg, setNotifMsg] = useState('');
    const [notifErr, setNotifErr] = useState('');

    const [geminiKey, setGeminiKey] = useState('');
    const [geminiKeyMsg, setGeminiKeyMsg] = useState('');
    const [geminiKeyErr, setGeminiKeyErr] = useState('');
    const [geminiTextModel, setGeminiTextModel] = useState('');
    const [geminiTtsModel, setGeminiTtsModel] = useState('');
    const [geminiModelMsg, setGeminiModelMsg] = useState('');
    const [geminiModelErr, setGeminiModelErr] = useState('');
    const [veoVideoMode, setVeoVideoMode] = useState<'normal' | 'relaxed' | ''>('');
    const [veoVideoModelMsg, setVeoVideoModelMsg] = useState('');
    const [veoVideoModelErr, setVeoVideoModelErr] = useState('');
    const [chutesToken, setChutesToken] = useState('');
    const [chutesMsg, setChutesMsg] = useState('');
    const [chutesErr, setChutesErr] = useState('');

    useEffect(() => {
        if (isOpen) {
            (async () => {
                await loadUsers();
                const data = await ReportingService.getGenerationReport(reportPeriod);
                setReportData(data);
            })();

            // Polling ringan agar data kredit & laporan terasa real-time saat modal terbuka
            const interval = setInterval(async () => {
                await loadUsers();
                const fresh = await ReportingService.getGenerationReport(reportPeriod);
                setReportData(fresh);
            }, 5000); // setiap 5 detik

            // Supabase Realtime: dengarkan perubahan pada tabel users & generation_logs
            let channel: ReturnType<typeof supabase.channel> | null = null;
            if (isSupabaseEnabled && supabase) {
                channel = supabase.channel('admin-users-realtime');
                channel.on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, async () => {
                    await loadUsers();
                });
                channel.on('postgres_changes', { event: '*', schema: 'public', table: 'generation_logs' }, async () => {
                    const fresh = await ReportingService.getGenerationReport(reportPeriod);
                    setReportData(fresh);
                });
                channel.subscribe();
            }

            return () => {
                clearInterval(interval);
                if (channel) supabase.removeChannel(channel);
            };
        }
    }, [isOpen, reportPeriod]);

    useEffect(() => {
        if (isOpen) {
            setTokenMsg('');
            setTokenErr('');
            (async () => {
                try {
                    const resp = await fetch(`/api/globalSettings?key=VEO_BEARER_TOKEN&t=${Date.now()}`);
                    if (resp.ok) {
                        const json = await resp.json();
                        const remote = (json?.value || '').trim();
                        if (remote) {
                            setVeoToken(remote);
                            // Sinkronkan fallback lokal agar admin tidak perlu mengisi ulang saat offline
                            localStorage.setItem('VEO_BEARER_TOKEN', remote);
                            return;
                        }
                    }
                } catch {}
                // Fallback ke local storage jika Supabase belum siap
                const t = (localStorage.getItem('VEO_BEARER_TOKEN') || '').trim();
                setVeoToken(t);
            })();
        }
    }, [isOpen]);

    // Load notification settings
    useEffect(() => {
        if (isOpen) {
            setNotifMsg('');
            setNotifErr('');
            (async () => {
                try {
                    const resp = await fetch(`/api/globalSettings?key=ADMIN_NOTIFICATION&t=${Date.now()}`);
                    if (resp.ok) {
                        const json = await resp.json();
                        const raw = (json?.value || '').trim();
                        if (raw) {
                            try {
                                const data = JSON.parse(raw);
                                setNotifEnabled(data.enabled || false);
                                setNotifTitle(data.title || '');
                                setNotifMessage(data.message || '');
                                setNotifImage(data.image || '');
                            } catch {}
                        }
                    }
                } catch {}
            })();
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            setGeminiKeyMsg('');
            setGeminiKeyErr('');
            setGeminiModelMsg('');
            setGeminiModelErr('');
            (async () => {
                try {
                    const k = await fetch(`/api/globalSettings?key=GEMINI_API_KEY&t=${Date.now()}`);
                    if (k.ok) {
                        const json = await k.json();
                        const remote = (json?.value || '').trim();
                        if (remote) {
                            setGeminiKey(remote);
                            localStorage.setItem('GEMINI_API_KEY', remote);
                        }
                    }
                } catch {}
                if (!geminiKey) {
                    const local = (localStorage.getItem('GEMINI_API_KEY') || '').trim();
                    setGeminiKey(local);
                }
                try {
                    const tm = await fetch(`/api/globalSettings?key=GEMINI_TEXT_MODEL&t=${Date.now()}`);
                    if (tm.ok) {
                        const json = await tm.json();
                        const val = (json?.value || '').trim();
                        if (val) setGeminiTextModel(val);
                    }
                } catch {}
                try {
                    const ck = await fetch(`/api/globalSettings?key=CHUTES_API_TOKEN&t=${Date.now()}`);
                    if (ck.ok) {
                        const json = await ck.json();
                        const remote = (json?.value || '').trim();
                        if (remote) {
                            setChutesToken(remote);
                            localStorage.setItem('CHUTES_API_TOKEN', remote);
                        }
                    }
                } catch {}
                if (!chutesToken) {
                    const localC = (localStorage.getItem('CHUTES_API_TOKEN') || '').trim();
                    setChutesToken(localC);
                }
                try {
                    const tt = await fetch(`/api/globalSettings?key=GEMINI_TTS_MODEL&t=${Date.now()}`);
                    if (tt.ok) {
                        const json = await tt.json();
                        const val = (json?.value || '').trim();
                        if (val) setGeminiTtsModel(val);
                    }
                } catch {}
                try {
                    const vm1 = await fetch(`/api/globalSettings?key=VEO_VIDEO_MODE&t=${Date.now()}`);
                    if (vm1.ok) {
                        const json = await vm1.json();
                        const val = (json?.value || '').trim().toLowerCase();
                        if (val === 'relaxed' || val === 'normal') setVeoVideoMode(val as 'relaxed' | 'normal');
                    }
                } catch {}
                try {
                    if (!veoVideoMode) {
                        const vm2 = await fetch(`/api/globalSettings?key=VEO_VIDEO_MODEL&t=${Date.now()}`);
                        if (vm2.ok) {
                            const json = await vm2.json();
                            const val = (json?.value || '').trim().toLowerCase();
                            if (val === 'relaxed' || val === 'normal') setVeoVideoMode(val as 'relaxed' | 'normal');
                        }
                    }
                } catch {}
            })();
        }
    }, [isOpen]);

    const loadUsers = async () => {
        const list = await AuthService.getAllUsers();
        setUsers(list);
    };

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMsg('');

        if (newUserPassword.length < 6) {
            setError('Password minimal 6 karakter.');
            return;
        }

        const success = await AuthService.addUser(newUserEmail, newUserPassword, newUserRole, newUserLimit, newUserExpiry || undefined, newUserFeatures, newUserMaxSessions);
        if (success) {
            setSuccessMsg(`User ${newUserEmail} berhasil ditambahkan.`);
            // Reset form
            setNewUserEmail('');
            setNewUserPassword('');
            setNewUserRole('user');
            setNewUserLimit(5);
            setNewUserExpiry('');
            setNewUserFeatures([...FEATURES]);
            setNewUserMaxSessions(1);
            loadUsers();
            setTimeout(() => setSuccessMsg(''), 3000);
        } else {
            setError('Gagal menambahkan user. Email mungkin sudah digunakan.');
        }
    };

    const confirmDeleteUser = async () => {
        if (!userToDelete) return;

        const success = await AuthService.deleteUser(userToDelete.id);
        if (success) {
            await loadUsers();
        }
        setUserToDelete(null); // Close the modal
    }

    const handleSaveToken = async (e: React.FormEvent) => {
        e.preventDefault();
        setTokenErr('');
        setTokenMsg('');
        const trimmed = veoToken.trim();
        if (!trimmed) {
            setTokenErr('Token tidak boleh kosong.');
            return;
        }
        try {
            const resp = await fetch('/api/globalSettings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'VEO_BEARER_TOKEN', value: trimmed })
            });
            if (!resp.ok) {
                const j = await resp.json().catch(() => ({}));
                throw new Error(j?.error || `Gagal menyimpan: ${resp.status}`);
            }
            setTokenMsg('Token VEO3 berhasil disimpan di pusat (Supabase).');
            setTimeout(() => setTokenMsg(''), 3000);
        } catch (err: any) {
            setTokenErr(`Gagal menyimpan ke pusat. ${err?.message || ''}`);
        }
    };

    const handleSaveNotification = async (e: React.FormEvent) => {
        e.preventDefault();
        setNotifErr('');
        setNotifMsg('');
        const data = {
            enabled: notifEnabled,
            title: notifTitle.trim(),
            message: notifMessage.trim(),
            image: notifImage.trim()
        };
        try {
            const resp = await fetch('/api/globalSettings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'ADMIN_NOTIFICATION', value: JSON.stringify(data) })
            });
            if (!resp.ok) {
                const j = await resp.json().catch(() => ({}));
                throw new Error(j?.error || `Gagal menyimpan: ${resp.status}`);
            }
            setNotifMsg('Notifikasi berhasil disimpan.');
            setTimeout(() => setNotifMsg(''), 3000);
        } catch (err: any) {
            setNotifErr(`Gagal menyimpan notifikasi. ${err?.message || ''}`);
        }
    };

    const handleSaveGeminiKey = async (e: React.FormEvent) => {
        e.preventDefault();
        setGeminiKeyErr('');
        setGeminiKeyMsg('');
        const trimmed = geminiKey.trim();
        if (!trimmed) {
            setGeminiKeyErr('API key tidak boleh kosong.');
            return;
        }
        try {
            const resp = await fetch('/api/globalSettings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'GEMINI_API_KEY', value: trimmed })
            });
            if (!resp.ok) {
                const j = await resp.json().catch(() => ({}));
                throw new Error(j?.error || `Gagal menyimpan: ${resp.status}`);
            }
            localStorage.setItem('GEMINI_API_KEY', trimmed);
            setGeminiKeyMsg('Gemini API key berhasil disimpan di pusat.');
            setTimeout(() => setGeminiKeyMsg(''), 3000);
        } catch (err: any) {
            setGeminiKeyErr(`Gagal menyimpan ke pusat. ${err?.message || ''}`);
        }
    };

    const handleSaveGeminiModels = async (e: React.FormEvent) => {
        e.preventDefault();
        setGeminiModelErr('');
        setGeminiModelMsg('');
        const textModel = (geminiTextModel || '').trim() || 'gemini-2.5-flash';
        const ttsModel = (geminiTtsModel || '').trim() || 'gemini-2.5-flash-preview-tts';
        try {
            const a = await fetch('/api/globalSettings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'GEMINI_TEXT_MODEL', value: textModel })
            });
            if (!a.ok) {
                const j = await a.json().catch(() => ({}));
                throw new Error(j?.error || `Gagal menyimpan model teks: ${a.status}`);
            }
            const b = await fetch('/api/globalSettings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'GEMINI_TTS_MODEL', value: ttsModel })
            });
            if (!b.ok) {
                const j = await b.json().catch(() => ({}));
                throw new Error(j?.error || `Gagal menyimpan model TTS: ${b.status}`);
            }
            setGeminiModelMsg('Model Gemini berhasil disimpan.');
            setTimeout(() => setGeminiModelMsg(''), 3000);
        } catch (err: any) {
            setGeminiModelErr(`Gagal menyimpan model. ${err?.message || ''}`);
        }
    };

    const handleSaveChutesToken = async (e: React.FormEvent) => {
        e.preventDefault();
        setChutesErr('');
        setChutesMsg('');
        const trimmed = chutesToken.trim();
        if (!trimmed) {
            setChutesErr('API token tidak boleh kosong.');
            return;
        }
        try {
            const resp = await fetch('/api/globalSettings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'CHUTES_API_TOKEN', value: trimmed })
            });
            if (!resp.ok) {
                const j = await resp.json().catch(() => ({}));
                throw new Error(j?.error || `Gagal menyimpan: ${resp.status}`);
            }
            localStorage.setItem('CHUTES_API_TOKEN', trimmed);
            setChutesMsg('Chutes API Token berhasil disimpan di pusat.');
            setTimeout(() => setChutesMsg(''), 3000);
        } catch (err: any) {
            setChutesErr(`Gagal menyimpan ke pusat. ${err?.message || ''}`);
        }
    };

    const handleSaveVeoVideoModel = async (e: React.FormEvent) => {
        e.preventDefault();
        setVeoVideoModelErr('');
        setVeoVideoModelMsg('');
        const mode = (veoVideoMode || '').trim();
        try {
            const r = await fetch('/api/globalSettings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'VEO_VIDEO_MODE', value: mode })
            });
            if (!r.ok) {
                const j = await r.json().catch(() => ({}));
                throw new Error(j?.error || `Gagal menyimpan mode video: ${r.status}`);
            }
            setVeoVideoModelMsg('Mode video berhasil disimpan.');
            setTimeout(() => setVeoVideoModelMsg(''), 3000);
        } catch (err: any) {
            setVeoVideoModelErr(`Gagal menyimpan mode video. ${err?.message || ''}`);
        }
    };

    if (!isOpen) return null;

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn">
                <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-md" onClick={() => !userToDelete && onClose()}></div>
                <div className="glass-panel w-full max-w-4xl rounded-[2rem] p-6 md:p-8 relative z-10 animate-scaleIn bg-white shadow-2xl flex flex-col max-h-[90vh] border-slate-200/80">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-8 flex-shrink-0">
                        <div>
                            <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                                <div className="p-2.5 bg-veo-primary/10 rounded-xl">
                                    <UsersIcon className="w-7 h-7 text-veo-primary" />
                                </div>
                                Manajemen User
                            </h2>
                            <p className="text-slate-500 text-sm mt-2 ml-1">Tambah user, atur batas penggunaan, dan masa aktif.</p>
                        </div>
                        <button onClick={onClose} className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors text-slate-500 hover:text-slate-800">
                            <XMarkIcon className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-8">
                        {/* Token VEO3 (Admin-only) */}
                        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200/80 shadow-sm">
                            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2.5 pb-4 border-b border-slate-200">
                                <SparklesIcon className="w-5 h-5 text-veo-primary" /> Token VEO3
                            </h3>
                            {tokenErr && (
                                <div className="text-red-600 text-sm mb-4 bg-red-50 p-3 rounded-xl border border-red-100 font-medium">
                                    {tokenErr}
                                </div>
                            )}
                            {tokenMsg && (
                                <div className="text-green-600 text-sm mb-4 bg-green-50 p-3 rounded-xl border border-green-100 font-medium">
                                    {tokenMsg}
                                </div>
                            )}
                            <form onSubmit={handleSaveToken} className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Token Bearer Google Labs</label>
                                    <input
                                        type="text"
                                        placeholder="ya29.a0..."
                                        value={veoToken}
                                        onChange={e => setVeoToken(e.target.value)}
                                        className="input-base font-mono text-base py-3 bg-white"
                                        autoComplete="off"
                                    />
                                    <p className="text-sm text-slate-500 leading-relaxed">
                                        Token untuk akses VEO 3.1 Sandbox. Disimpan terpusat di Supabase dan tidak dikirim dari browser saat penggunaan.
                                    </p>
                                </div>
                                <div className="flex justify-end">
                                    <button type="submit" className="px-6 py-3 rounded-xl font-bold text-base bg-veo-primary text-white shadow-lg shadow-veo-primary/20 hover:bg-veo-primary/90">
                                        Simpan Token
                                    </button>
                                </div>
                            </form>
                        </div>

                        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200/80 shadow-sm">
                            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2.5 pb-4 border-b border-slate-200">
                                <LockClosedIcon className="w-5 h-5 text-veo-primary" /> Gemini API & Model
                            </h3>
                            {geminiKeyErr && (
                                <div className="text-red-600 text-sm mb-4 bg-red-50 p-3 rounded-xl border border-red-100 font-medium">{geminiKeyErr}</div>
                            )}
                            {geminiKeyMsg && (
                                <div className="text-green-600 text-sm mb-4 bg-green-50 p-3 rounded-xl border border-green-100 font-medium">{geminiKeyMsg}</div>
                            )}
                            <form onSubmit={handleSaveGeminiKey} className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Gemini API Key</label>
                                    <input
                                        type="text"
                                        placeholder="AIza..."
                                        value={geminiKey}
                                        onChange={e => setGeminiKey(e.target.value)}
                                        className="input-base font-mono text-base py-3 bg-white"
                                        autoComplete="off"
                                    />
                                    <p className="text-sm text-slate-500 leading-relaxed">Disimpan terpusat di Supabase dan digunakan oleh semua fitur teks.</p>
                                </div>
                                <div className="flex justify-end">
                                    <button type="submit" className="px-6 py-3 rounded-xl font-bold text-base bg-veo-primary text-white shadow-lg shadow-veo-primary/20 hover:bg-veo-primary/90">Simpan API Key</button>
                                </div>
                            </form>
                            {geminiModelErr && (
                                <div className="text-red-600 text-sm mb-4 bg-red-50 p-3 rounded-xl border border-red-100 font-medium">{geminiModelErr}</div>
                            )}
                            {geminiModelMsg && (
                                <div className="text-green-600 text-sm mb-4 bg-green-50 p-3 rounded-xl border border-green-100 font-medium">{geminiModelMsg}</div>
                            )}
                            <form onSubmit={handleSaveGeminiModels} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-slate-500 uppercase ml-1">Model Teks</label>
                                        <input
                                            list="gemini-text-models"
                                            type="text"
                                            placeholder="gemini-2.5-flash"
                                            value={geminiTextModel}
                                            onChange={e => setGeminiTextModel(e.target.value)}
                                            className="input-base bg-white"
                                        />
                                        <datalist id="gemini-text-models">
                                            <option value="gemini-2.5-flash" />
                                            <option value="gemini-2.5-pro" />
                                            <option value="gemini-2.0-flash" />
                                            <option value="gemini-1.5-pro" />
                                        </datalist>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-slate-500 uppercase ml-1">Model TTS</label>
                                        <input
                                            list="gemini-tts-models"
                                            type="text"
                                            placeholder="gemini-2.5-flash-preview-tts"
                                            value={geminiTtsModel}
                                            onChange={e => setGeminiTtsModel(e.target.value)}
                                            className="input-base bg-white"
                                        />
                                        <datalist id="gemini-tts-models">
                                            <option value="gemini-2.5-flash-preview-tts" />
                                        </datalist>
                                    </div>
                                </div>
                                <div className="flex justify-end">
                                    <button type="submit" className="px-6 py-3 rounded-xl font-bold text-base bg-veo-primary text-white shadow-lg shadow-veo-primary/20 hover:bg-veo-primary/90">Simpan Model</button>
                                </div>
                            </form>
                        </div>

                        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200/80 shadow-sm">
                            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2.5 pb-4 border-b border-slate-200">
                                <LockClosedIcon className="w-5 h-5 text-veo-primary" /> Chutes API Token
                            </h3>
                            {chutesErr && (
                                <div className="text-red-600 text-sm mb-4 bg-red-50 p-3 rounded-xl border border-red-100 font-medium">{chutesErr}</div>
                            )}
                            {chutesMsg && (
                                <div className="text-green-600 text-sm mb-4 bg-green-50 p-3 rounded-xl border border-green-100 font-medium">{chutesMsg}</div>
                            )}
                            <form onSubmit={handleSaveChutesToken} className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Chutes API Token</label>
                                    <input
                                        type="text"
                                        placeholder="cpk_..."
                                        value={chutesToken}
                                        onChange={e => setChutesToken(e.target.value)}
                                        className="input-base font-mono text-base py-3 bg-white"
                                        autoComplete="off"
                                    />
                                    <p className="text-sm text-slate-500 leading-relaxed">Digunakan untuk LLM caption DeepSeek via Chutes. Disimpan terpusat di Supabase.</p>
                                </div>
                                <div className="flex justify-end">
                                    <button type="submit" className="px-6 py-3 rounded-xl font-bold text-base bg-veo-primary text-white shadow-lg shadow-veo-primary/20 hover:bg-veo-primary/90">Simpan Token</button>
                                </div>
                            </form>
                        </div>

                        {/* VEO Video Model */}
                        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200/80 shadow-sm">
                            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2.5 pb-4 border-b border-slate-200">
                                <SparklesIcon className="w-5 h-5 text-veo-primary" /> Model Video (VEO 3.1)
                            </h3>
                            {veoVideoModelErr && (
                                <div className="text-red-600 text-sm mb-4 bg-red-50 p-3 rounded-xl border border-red-100 font-medium">{veoVideoModelErr}</div>
                            )}
                            {veoVideoModelMsg && (
                                <div className="text-green-600 text-sm mb-4 bg-green-50 p-3 rounded-xl border border-green-100 font-medium">{veoVideoModelMsg}</div>
                            )}
                            <form onSubmit={handleSaveVeoVideoModel} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-slate-500 uppercase ml-1">Mode</label>
                                        <select
                                            value={veoVideoMode || ''}
                                            onChange={e => setVeoVideoMode((e.target.value || '') as 'normal' | 'relaxed' | '')}
                                            className="input-base bg-white"
                                        >
                                            <option value="">Otomatis</option>
                                            <option value="normal">Normal</option>
                                            <option value="relaxed">Relaxed</option>
                                        </select>
                                        <p className="text-sm text-slate-500 leading-relaxed">
                                            Pilih mode Normal atau Relaxed. Sistem otomatis menyesuaikan model (I2V/T2V, Portrait/Landscape, Ultra) saat runtime.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex justify-end">
                                    <button type="submit" className="px-6 py-3 rounded-xl font-bold text-base bg-veo-primary text-white shadow-lg shadow-veo-primary/20 hover:bg-veo-primary/90">Simpan Mode</button>
                                </div>
                            </form>
                        </div>

                        {/* Notification Section */}
                        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200/80 shadow-sm">
                            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2.5 pb-4 border-b border-slate-200">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-veo-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
                                Notifikasi Update
                            </h3>
                            {notifErr && (
                                <div className="text-red-600 text-sm mb-4 bg-red-50 p-3 rounded-xl border border-red-100 font-medium">
                                    {notifErr}
                                </div>
                            )}
                            {notifMsg && (
                                <div className="text-green-600 text-sm mb-4 bg-green-50 p-3 rounded-xl border border-green-100 font-medium">
                                    {notifMsg}
                                </div>
                            )}
                            <form onSubmit={handleSaveNotification} className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={notifEnabled}
                                            onChange={e => setNotifEnabled(e.target.checked)}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-veo-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-veo-primary"></div>
                                    </label>
                                    <span className="text-sm font-bold text-slate-700">Aktifkan Notifikasi</span>
                                    {notifEnabled && <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">AKTIF</span>}
                                </div>
                                <p className="text-xs text-slate-500">Jika aktif, semua user akan melihat overlay notifikasi yang tidak bisa ditutup sampai admin menonaktifkan.</p>
                                
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Judul Notifikasi</label>
                                    <input
                                        type="text"
                                        placeholder="Contoh: Update Terbaru!"
                                        value={notifTitle}
                                        onChange={e => setNotifTitle(e.target.value)}
                                        className="input-base bg-white"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Pesan Notifikasi</label>
                                    <textarea
                                        placeholder="Tulis pesan notifikasi untuk user..."
                                        value={notifMessage}
                                        onChange={e => setNotifMessage(e.target.value)}
                                        rows={3}
                                        className="input-base bg-white resize-none"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Gambar Notifikasi (Opsional)</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="https://example.com/image.png atau upload file"
                                            value={notifImage}
                                            onChange={e => setNotifImage(e.target.value)}
                                            className="input-base bg-white flex-1"
                                        />
                                        <label className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-sm text-slate-700 cursor-pointer flex items-center gap-2 border border-slate-200">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                            Upload
                                            <input
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={async (e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) {
                                                        const reader = new FileReader();
                                                        reader.onload = (ev) => {
                                                            const dataUrl = ev.target?.result as string;
                                                            setNotifImage(dataUrl);
                                                        };
                                                        reader.readAsDataURL(file);
                                                    }
                                                }}
                                            />
                                        </label>
                                    </div>
                                    <p className="text-xs text-slate-500">Masukkan URL gambar atau upload file gambar langsung.</p>
                                    {notifImage && notifImage.trim() !== '' && (
                                        <div className="mt-3 p-3 bg-white rounded-xl border border-slate-200">
                                            <div className="flex items-center justify-between mb-2">
                                                <p className="text-xs font-bold text-slate-500">Preview Gambar:</p>
                                                <button 
                                                    type="button" 
                                                    onClick={() => setNotifImage('')}
                                                    className="text-xs text-red-500 hover:text-red-700 font-bold"
                                                >
                                                    Hapus
                                                </button>
                                            </div>
                                            <img 
                                                src={notifImage} 
                                                alt="Preview Notifikasi" 
                                                className="max-h-48 w-full rounded-lg object-contain bg-slate-50 border border-slate-100" 
                                                onError={(e) => { 
                                                    const target = e.target as HTMLImageElement;
                                                    target.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMTAwIiB2aWV3Qm94PSIwIDAgMjAwIDEwMCI+PHJlY3QgZmlsbD0iI2YxZjVmOSIgd2lkdGg9IjIwMCIgaGVpZ2h0PSIxMDAiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzk0YTNiOCIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTIiPkdhbWJhciB0aWRhayB2YWxpZDwvdGV4dD48L3N2Zz4=';
                                                }} 
                                            />
                                        </div>
                                    )}
                                </div>
                                <div className="flex justify-end">
                                    <button type="submit" className="px-6 py-3 rounded-xl font-bold text-base bg-veo-primary text-white shadow-lg shadow-veo-primary/20 hover:bg-veo-primary/90">
                                        Simpan Notifikasi
                                    </button>
                                </div>
                            </form>
                        </div>

                        {/* Report Section */}
                        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200/80 shadow-sm">
                            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2.5 pb-4 border-b border-slate-200">
                                <ChartBarIcon className="w-5 h-5 text-veo-primary" /> Laporan Penggunaan
                            </h3>
                            
                            {/* Period Selector */}
                            <div className="flex flex-wrap gap-2 mb-6">
                                {(['today', '7days', '30days', 'all'] as ReportPeriod[]).map(period => (
                                    <button
                                        key={period}
                                        onClick={() => setReportPeriod(period)}
                                        className={`px-4 py-2 rounded-full font-bold text-sm transition-all ${
                                            reportPeriod === period 
                                            ? 'bg-veo-primary text-white shadow-sm' 
                                            : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                                        }`}
                                    >
                                        {
                                            {
                                                'today': 'Hari Ini',
                                                '7days': '7 Hari Terakhir',
                                                '30days': '30 Hari Terakhir',
                                                'all': 'Semua Waktu'
                                            }[period]
                                        }
                                    </button>
                                ))}
                            </div>

                            {/* Report Data */}
                            {reportData && (
                                <div className="space-y-4">
                                    <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between">
                                        <span className="text-base font-bold text-slate-600">Total Video Dihasilkan</span>
                                        <span className="text-3xl font-black text-veo-primary">{reportData.total}</span>
                                    </div>

                                    {reportData.byUser.length > 0 ? (
                                        <div className="space-y-2 pt-2">
                                            <h4 className="font-bold text-slate-500 text-sm px-1">Rincian per User:</h4>
                                            {reportData.byUser.map(item => (
                                                <div key={item.email} className="flex justify-between items-center bg-white p-3 rounded-xl border border-slate-100">
                                                    <span className="font-medium text-slate-700">{item.email}</span>
                                                    <span className="font-bold text-slate-900 bg-slate-100 px-3 py-1 rounded-lg text-sm">{item.count} video</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-6 text-slate-500 bg-white rounded-2xl border border-slate-200/80">
                                            Belum ada data untuk periode ini.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        
                        {/* Add User Form */}
                        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200/80 shadow-sm">
                            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2.5 pb-4 border-b border-slate-200">
                                <PlusIcon className="w-5 h-5 text-veo-primary" /> Tambah User Baru
                            </h3>
                            
                            {error && <div className="text-red-600 text-sm mb-4 bg-red-50 p-3 rounded-xl border border-red-100 font-medium flex items-center gap-2"><XMarkIcon className="w-5 h-5"/> {error}</div>}
                            {successMsg && <div className="text-green-600 text-sm mb-4 bg-green-50 p-3 rounded-xl border border-green-100 font-medium flex items-center gap-2"><SparklesIcon className="w-5 h-5"/> {successMsg}</div>}

                            <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Email</label>
                                    <input type="email" placeholder="user@veo.com" required value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} className="input-base" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Password</label>
                                    <input type="text" placeholder="Min. 6 karakter" required value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} className="input-base" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Limit Harian</label>
                                    <input type="number" min="1" placeholder="Contoh: 5" required value={newUserLimit} onChange={e => setNewUserLimit(parseInt(e.target.value) || 5)} className="input-base" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Maksimal Perangkat Login</label>
                                    <input type="number" min="1" placeholder="Contoh: 1" required value={newUserMaxSessions} onChange={e => setNewUserMaxSessions(parseInt(e.target.value) || 1)} className="input-base" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Role (Peran)</label>
                                    <select value={newUserRole} onChange={e => setNewUserRole(e.target.value as UserRole)} className="input-base pr-8 appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23CBD5E1%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-13%205.4-3.7%203.7-5.4%208-5.4%2013%200%205%201.8%209.3%205.4%2013l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.7%205.4-8%205.4-13%200-5-1.8-9.3-5.4-13z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px_12px] bg-[right_1rem_center] bg-no-repeat">
                                        <option value="user">User Biasa</option>
                                        <option value="admin">Administrator</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Masa Aktif (Opsional)</label>
                                    <input type="date" value={newUserExpiry} onChange={e => setNewUserExpiry(e.target.value)} className="input-base" />
                                </div>
                                <div className="md:col-span-2 lg:col-span-3">
                                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Akses Menu</label>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-1.5">
                                        {FEATURES.map(f => {
                                            const checked = newUserFeatures.includes(f);
                                            return (
                                                <label key={f} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-bold ${checked ? 'bg-white border-veo-primary/40 text-slate-800' : 'bg-white border-slate-200 text-slate-600'}`}>
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={e => {
                                                            setNewUserFeatures(prev => {
                                                                const next = new Set(prev);
                                                                if (e.target.checked) next.add(f); else next.delete(f);
                                                                return Array.from(next);
                                                            });
                                                        }}
                                                    />
                                                    <span className="capitalize">{f === 'tts' ? 'Teks ke Suara' : (f === 'banner' ? 'AI Banner Produk' : (f === 'ugccaption' ? 'Buat Caption & Scrip Lypsing' : (f === 'tanyabangvidgo' ? 'Tanya Bang Vidgo' : f)))}</span>
                                                    {!checked && <LockClosedIcon className="w-4 h-4 text-slate-400 ml-auto" />}
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                                
                                <div className="md:col-span-2 lg:col-span-3 mt-2">
                                    <button type="submit" className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold text-base hover:bg-veo-primary transition-all shadow-lg shadow-slate-200 hover:shadow-veo-primary/30">
                                        <PlusIcon className="w-5 h-5 inline-block mr-2 -mt-1" />
                                        Tambahkan User
                                    </button>
                                </div>
                            </form>
                        </div>

                        {/* User List */}
                        <div>
                            <h3 className="text-lg font-bold text-slate-800 mb-4 px-1 flex justify-between items-center">
                                <span>Daftar User Aktif</span>
                                <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-sm">{users.length} User</span>
                            </h3>
                            <div className="mb-4">
                                <input
                                    type="text"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Cari user berdasarkan email atau peran..."
                                    className="input-base bg-white"
                                />
                            </div>
                            <div className="space-y-3">
                                {(users.filter(u => {
                                    const q = search.trim().toLowerCase();
                                    if (!q) return true;
                                    const fields = [u.email, u.role, u.expiryDate || '', String(u.maxSessions || ''), String(u.dailyLimit || ''), String(u.remainingCredits || '')];
                                    return fields.some(v => String(v).toLowerCase().includes(q));
                                })).map(user => (
                                    <div key={user.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 bg-white border border-slate-200 rounded-2xl hover:border-veo-primary/30 transition-colors shadow-sm gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <p className="font-bold text-slate-900 truncate text-base">
                                                    {user.email}
                                                </p>
                                                {user.email === currentUserEmail && <span className="text-[10px] font-bold bg-veo-primary/10 text-veo-primary px-2 py-0.5 rounded-full uppercase tracking-wider">Anda</span>}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                                                <span className={`font-bold uppercase tracking-wider text-[11px] px-2 py-0.5 rounded-md ${user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>
                                                    {user.role}
                                                </span>
                                                <span className="text-slate-400 hidden sm:inline">•</span>
                                                <span className="text-slate-500 font-medium flex items-center gap-1.5">
                                                    <SparklesIcon className="w-4 h-4 text-veo-secondary" />
                                                    Sisa Kredit: <strong className={(user.remainingCredits || 0) > 0 ? 'text-slate-700' : 'text-red-500'}>{user.remainingCredits ?? user.dailyLimit}</strong> / {user.dailyLimit}
                                                </span>
                                            <span className="text-slate-400 hidden sm:inline">•</span>
                                            <span className="text-slate-500 font-medium">
                                                Masa Aktif: {user.expiryDate ? <strong className="text-slate-700">{new Date(user.expiryDate).toLocaleDateString('id-ID')}</strong> : <strong className="text-green-600">Selamanya</strong>}
                                            </span>
                                            <span className="text-slate-400 hidden sm:inline">•</span>
                                            <span className="text-slate-500 font-medium flex items-center gap-1.5">
                                                <ChartBarIcon className="w-4 h-4 text-slate-600" />
                                                Maks Login: <strong className="text-slate-700">{user.maxSessions ?? 1}</strong>
                                            </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 self-end sm:self-center">
                                            {user.email !== currentUserEmail && (
                                                <button 
                                                    onClick={() => setUserToDelete(user)} 
                                                    className="px-3 py-2 text-sm font-bold text-red-500 bg-red-50 hover:bg-red-100 rounded-xl transition-all" 
                                                    title="Hapus User Permanen"
                                                >
                                                    Hapus
                                                </button>
                                            )}
                                            <button
                                                onClick={() => setEditingUser(user)}
                                                className="px-3 py-2 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
                                                title="Edit Akses & Kredit"
                                            >
                                                Edit
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Confirmation Modal */}
            {userToDelete && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fadeIn bg-slate-900/60 backdrop-blur-sm">
                    <div className="glass-panel w-full max-w-md rounded-3xl p-8 relative z-10 animate-scaleIn bg-white shadow-2xl border-slate-200">
                        <h3 className="text-xl font-black text-slate-900 text-center">Konfirmasi Hapus</h3>
                        <p className="text-center text-slate-600 mt-4 mb-8 leading-relaxed">
                            Apakah Anda yakin ingin menghapus user <strong className="text-slate-800">{userToDelete.email}</strong> secara permanen? Tindakan ini tidak dapat dibatalkan.
                        </p>
                        <div className="flex justify-center gap-4">
                            <button
                                onClick={() => setUserToDelete(null)}
                                className="px-8 py-3.5 rounded-xl font-bold text-base text-slate-600 hover:bg-slate-100 transition-colors w-full"
                            >
                                Batal
                            </button>
                            <button
                                onClick={confirmDeleteUser}
                                className="px-8 py-3.5 rounded-xl font-bold text-base bg-red-500 text-white shadow-lg shadow-red-500/20 hover:bg-red-600 hover:scale-[1.02] active:scale-[0.98] transition-all w-full"
                            >
                                Ya, Hapus
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editingUser && (
                <EditUserModal
                    user={editingUser}
                    onClose={() => setEditingUser(null)}
                    onUpdated={async () => { await loadUsers(); }}
                    FEATURES={FEATURES}
                />
            )}
        </>
    );
};

export default AdminUserModal;

// Sub-komponen: Modal edit user (akses fitur, masa aktif, kredit, role)
interface EditProps {
    user: User;
    onClose: () => void;
    onUpdated: () => Promise<void> | void;
    FEATURES: readonly string[];
}

const EditUserModal: React.FC<EditProps> = ({ user, onClose, onUpdated, FEATURES }) => {
    const [role, setRole] = useState<UserRole>(user.role);
    const [dailyLimit, setDailyLimit] = useState<number>(user.dailyLimit);
    const [remainingCredits, setRemainingCredits] = useState<number>(user.remainingCredits);
    const [maxSessions, setMaxSessions] = useState<number>(user.maxSessions || 1);
    const [expiryDate, setExpiryDate] = useState<string>(user.expiryDate || '');
    const [features, setFeatures] = useState<string[]>(Array.isArray(user.allowedFeatures) ? user.allowedFeatures! : [...FEATURES]);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');

    const toggleFeature = (f: string, checked: boolean) => {
        setFeatures(prev => {
            const next = new Set(prev);
            if (checked) next.add(f); else next.delete(f);
            return Array.from(next);
        });
    };

    const handleSave = async () => {
        setErr('');
        setSaving(true);
        const patch = {
            role,
            dailyLimit: Math.max(dailyLimit || 1, 1),
            remainingCredits: Math.max(remainingCredits || 0, 0),
            expiryDate: expiryDate ? expiryDate : null,
            allowedFeatures: features.length > 0 ? features : [],
            maxSessions: Math.max(maxSessions || 1, 1)
        };
        const updated = await AuthService.updateUser(user.id, patch);
        setSaving(false);
        if (!updated) {
            setErr('Gagal menyimpan perubahan user.');
            return;
        }
        await onUpdated();
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 animate-fadeIn bg-slate-900/60 backdrop-blur-sm">
            <div className="glass-panel w-full max-w-2xl rounded-3xl p-6 relative z-10 animate-scaleIn bg-white shadow-2xl border-slate-200">
                <h3 className="text-xl font-black text-slate-900">Edit User</h3>
                <p className="text-slate-600 mb-4">{user.email}</p>
                {err && <div className="text-red-600 text-sm mb-4 bg-red-50 p-3 rounded-xl border border-red-100 font-medium">{err}</div>}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase ml-1">Role</label>
                        <select value={role} onChange={e => setRole(e.target.value as UserRole)} className="input-base">
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase ml-1">Limit Harian</label>
                        <input type="number" min="1" value={dailyLimit} onChange={e => setDailyLimit(parseInt(e.target.value) || 1)} className="input-base" />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase ml-1">Sisa Kredit</label>
                        <input type="number" min="0" value={remainingCredits} onChange={e => setRemainingCredits(parseInt(e.target.value) || 0)} className="input-base" />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase ml-1">Maksimal Perangkat Login</label>
                        <input type="number" min="1" value={maxSessions} onChange={e => setMaxSessions(parseInt(e.target.value) || 1)} className="input-base" />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase ml-1">Masa Aktif</label>
                        <input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} className="input-base" />
                        <p className="text-xs text-slate-500">Kosongkan untuk tidak terbatas.</p>
                    </div>
                    <div className="md:col-span-2">
                        <label className="text-xs font-bold text-slate-500 uppercase ml-1">Akses Menu</label>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-1.5">
                            {FEATURES.map(f => {
                                const checked = features.includes(f);
                                return (
                                    <label key={f} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-bold ${checked ? 'bg-white border-veo-primary/40 text-slate-800' : 'bg-white border-slate-200 text-slate-600'}`}>
                                        <input type="checkbox" checked={checked} onChange={e => toggleFeature(f, e.target.checked)} />
                                        <span className="capitalize">{f === 'tts' ? 'Teks ke Suara' : (f === 'banner' ? 'AI Banner Produk' : (f === 'tanyabangvidgo' ? 'Tanya Bang Vidgo' : f))}</span>
                                        {!checked && <LockClosedIcon className="w-4 h-4 text-slate-400 ml-auto" />}
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                    <button onClick={onClose} className="px-5 py-3 rounded-xl font-bold text-base text-slate-600 hover:bg-slate-100">Batal</button>
                    <button onClick={handleSave} disabled={saving} className="px-5 py-3 rounded-xl font-bold text-base bg-veo-primary text-white hover:bg-veo-primary/90 disabled:opacity-60">Simpan Perubahan</button>
                </div>
            </div>
        </div>
    );
}
