
export type UserRole = 'admin' | 'user';

export interface User {
    id: string;
    email: string;
    password?: string; // Frontend-demo only. NOT SECURE for real prod.
    role: UserRole;
    dailyLimit: number;
    remainingCredits: number;
    lastResetDate: string; // Format: YYYY-MM-DD
    expiryDate?: string; // Format: YYYY-MM-DD. User kedaluwarsa setelah tanggal ini.
    maxSessions?: number;
}

const USERS_KEY = 'veo_users';
const SESSION_KEY = 'veo_session_user';
const SESSION_ID_KEY = 'veo_session_id';
// Waktu kedaluwarsa sesi login (timestamp ms). Digunakan untuk auto-logout.
const SESSION_TIMEOUT_KEY = 'veo_session_timeout_at';
const SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 jam
const DEFAULT_DAILY_LIMIT = 5;

// Helper untuk mendapatkan tanggal hari ini format YYYY-MM-DD
const RESET_TZ = (import.meta.env.VITE_RESET_TZ as string) || 'Asia/Jakarta';
const getTodayDateString = () => {
    try {
        // Gunakan timezone yang konsisten (default Asia/Jakarta) agar reset tepat jam 00:00 lokal
        return new Intl.DateTimeFormat('en-CA', { timeZone: RESET_TZ }).format(new Date());
    } catch {
        // Fallback ke tanggal lokal tanpa timezone spesifik
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }
};

// Initial setup (local demo only)
const initializeUsers = () => {
    const usersStr = localStorage.getItem(USERS_KEY);
    if (!usersStr || JSON.parse(usersStr).length === 0) {
        const today = getTodayDateString();
        const defaultAdmin: User = {
            id: '1',
            email: 'admin@veo.com',
            password: btoa('admin123'),
            role: 'admin',
            dailyLimit: 999, // Admin gets lots of credits by default
            remainingCredits: 999,
            lastResetDate: today
            // No expiryDate for default admin
        };
        localStorage.setItem(USERS_KEY, JSON.stringify([defaultAdmin]));
    }
};
// Only initialize local demo when Supabase is not enabled
if (!isSupabaseEnabled) {
    initializeUsers();
}

export const AuthService = {
    login: async (email: string, password: string): Promise<User | null> => {
        // Supabase mode
        if (isSupabaseEnabled && supabase) {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error || !data?.user) return null;

            const uid = data.user.id;
            const { data: row, error: selErr } = await supabase
                .from('users')
                .select('*')
                .eq('id', uid)
                .single();

            const today = getTodayDateString();

            let user: User;
            if (!row) {
                // Metadata missing: ensure via service-role endpoint to bypass RLS
                try {
                    const res = await fetch('/api/userCredits', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'ensure', userId: uid })
                    });
                    if (res.ok) {
                        const data = await res.json();
                        const ensured = data?.user as User | null;
                        if (ensured) {
                            user = ensured;
                        } else {
                            throw new Error('Ensure user metadata failed');
                        }
                    } else {
                        throw new Error('Ensure user metadata request failed');
                    }
                } catch {
                    // Fallback: create default local session (non-persistent if RLS blocks)
                    const defaultRole: UserRole = email.toLowerCase() === 'admin@veo.com' ? 'admin' : 'user';
                    const defaultLimit = defaultRole === 'admin' ? 999 : DEFAULT_DAILY_LIMIT;
                    user = {
                        id: uid,
                        email: email,
                        role: defaultRole,
                        dailyLimit: defaultLimit,
                        remainingCredits: defaultLimit,
                        lastResetDate: today
                    };
                    // Best-effort insert (may be blocked by RLS); ignore errors
                    supabase.from('users').insert({
                        id: uid,
                        email,
                        role: defaultRole,
                        daily_limit: defaultLimit,
                        remaining_credits: defaultLimit,
                        last_reset_date: today,
                        expiry_date: null
                    }).then(() => {}).catch(() => {});
                }
            } else {
                user = {
                    id: row.id,
                    email: row.email,
                    role: row.role,
                    dailyLimit: row.daily_limit ?? DEFAULT_DAILY_LIMIT,
                    remainingCredits: row.remaining_credits ?? (row.daily_limit ?? DEFAULT_DAILY_LIMIT),
                    lastResetDate: row.last_reset_date ?? today,
                    expiryDate: row.expiry_date ?? undefined,
                    maxSessions: (row.max_sessions != null ? Number(row.max_sessions) : 1)
                };
            }

            // Expiry check
            if (user.expiryDate) {
                const expiry = new Date(user.expiryDate);
                const todayDate = new Date(today);
                if (todayDate > expiry) {
                    return null;
                }
            }

            // Daily reset if needed
            if (user.lastResetDate !== today) {
                user.lastResetDate = today;
                user.remainingCredits = user.dailyLimit || DEFAULT_DAILY_LIMIT;
                await supabase.from('users')
                    .update({ last_reset_date: today, remaining_credits: user.remainingCredits })
                    .eq('id', user.id);
            }

            const sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
            localStorage.setItem(SESSION_ID_KEY, sid);
            const claimRes = await fetch('/api/singleSession', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'claim', userId: user.id, sessionId: sid })
            });
            if (claimRes.ok) {
                const j = await claimRes.json();
                if (j?.ok === false && j?.reason === 'occupied') {
                    await supabase.auth.signOut();
                    throw new Error(j?.message || 'Akun sedang aktif di perangkat lain');
                }
            }
            localStorage.setItem(SESSION_KEY, JSON.stringify(user));
            // Mulai pelacakan aktivitas dan set timeout pertama
            try { AuthService.installActivityHooks(); AuthService.bumpActivity(); } catch {}
            return user;
        }

        // Local demo mode
        const usersStr = localStorage.getItem(USERS_KEY);
        if (!usersStr) return null;

        let users: User[] = JSON.parse(usersStr);
        const userIndex = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase() && u.password === btoa(password));

        if (userIndex !== -1) {
            const user = users[userIndex];
            const today = getTodayDateString();

            // CEK MASA AKTIF: Jika user punya expiryDate, cek apakah sudah lewat.
            if (user.expiryDate) {
                const expiry = new Date(user.expiryDate);
                const todayDate = new Date(today);
                // Jika hari ini sudah melewati tanggal kedaluwarsa, tolak login.
                if (todayDate > expiry) {
                    console.warn(`Login failed for ${email}: Account expired on ${user.expiryDate}`);
                    return null;
                }
            }

            // CEK RESET HARIAN: Jika tanggal terakhir reset bukan hari ini, reset kredit.
            if (user.lastResetDate !== today) {
                user.lastResetDate = today;
                user.remainingCredits = user.dailyLimit || DEFAULT_DAILY_LIMIT;
                // Simpan perubahan reset ke database lokal
                users[userIndex] = user;
                localStorage.setItem(USERS_KEY, JSON.stringify(users));
            }

            // Buat sesi (tanpa password)
            const { password: _, ...sessionUser } = user;
            localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
            // Mulai pelacakan aktivitas dan set timeout pertama (mode demo)
            try { AuthService.installActivityHooks(); AuthService.bumpActivity(); } catch {}
            return sessionUser as User;
        }
        return null;
    },

    logout: () => {
        if (isSupabaseEnabled && supabase) {
            // Fire and forget
            supabase.auth.signOut();
            try {
                const sid = localStorage.getItem(SESSION_ID_KEY);
                const sessionStr = localStorage.getItem(SESSION_KEY);
                const u = sessionStr ? JSON.parse(sessionStr) as User : null;
                if (sid && u?.id) {
                    fetch('/api/singleSession', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'release', userId: u.id, sessionId: sid })
                    }).catch(() => {});
                }
            } catch {}
        }
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(SESSION_ID_KEY);
        localStorage.removeItem(SESSION_TIMEOUT_KEY);
        try {
            const timerId = (window as any).__vidgoLogoutTimerId as number | undefined;
            if (timerId) clearTimeout(timerId);
            (window as any).__vidgoLogoutTimerId = undefined;
            AuthService.removeActivityHooks();
        } catch {}
    },

    getCurrentUser: async (): Promise<User | null> => {
        const sessionStr = localStorage.getItem(SESSION_KEY);
        if (!sessionStr) return null;
        
        let sessionUser: User = JSON.parse(sessionStr);
        // Guard: jika melewati batas 2 jam tanpa aktivitas, paksa logout
        const timeoutAtStr = localStorage.getItem(SESSION_TIMEOUT_KEY);
        const timeoutAt = timeoutAtStr ? Number(timeoutAtStr) : undefined;
        if (timeoutAt && Date.now() > timeoutAt) {
            AuthService.logout();
            return null;
        } else {
            // Pastikan timer jalan meski tidak ada aktivitas
            try { AuthService.installActivityHooks(); AuthService.startSessionTimeout(); } catch {}
        }
        const today = getTodayDateString();

        // Supabase mode: pastikan reset harian terjadi saat hari berganti
        if (isSupabaseEnabled && supabase) {
            try {
                try {
                    const sid = localStorage.getItem(SESSION_ID_KEY);
                    if (sid) {
                        const statusRes = await fetch('/api/singleSession', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'status', userId: sessionUser.id, sessionId: sid })
                        });
                        if (statusRes.ok) {
                            const sj = await statusRes.json();
                            const cur = sj?.currentSessionId || null;
                            const list: string[] = Array.isArray(sj?.sessionIds) ? sj.sessionIds : [];
                            if ((list.length && !list.includes(sid)) || (cur && cur !== sid)) {
                                AuthService.logout();
                                return null;
                            }
                        }
                    }
                } catch {}
                const { data: row, error } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', sessionUser.id)
                    .single();

                // Jika tabel users belum ada atau baris tidak ditemukan, lewati tanpa error
                const tableMissing = error && (error.message || '').includes("Could not find the table 'public.users'");
                if (!tableMissing && row) {
                    // Cek kedaluwarsa akun
                    const latestExpiry: string | undefined = row.expiry_date ?? sessionUser.expiryDate;
                    if (latestExpiry) {
                        const expiry = new Date(latestExpiry);
                        const todayDate = new Date(today);
                        if (todayDate > expiry) {
                            AuthService.logout();
                            return null;
                        }
                    }

                    const lastResetDate = row.last_reset_date ?? sessionUser.lastResetDate ?? today;
                    const dailyLimit = row.daily_limit ?? sessionUser.dailyLimit ?? DEFAULT_DAILY_LIMIT;
                    let remainingCredits = row.remaining_credits ?? sessionUser.remainingCredits ?? dailyLimit;

                    if (lastResetDate !== today) {
                        remainingCredits = dailyLimit;
                        const { error: updErr } = await supabase
                            .from('users')
                            .update({ last_reset_date: today, remaining_credits: remainingCredits })
                            .eq('id', sessionUser.id);
                        if (updErr) {
                            console.warn('Failed to update daily reset for user', updErr.message);
                        }
                    }

                    // Sinkronkan sesi lokal dengan data terbaru
                    sessionUser = {
                        id: row.id,
                        email: row.email,
                        role: row.role,
                        dailyLimit,
                        remainingCredits,
                        lastResetDate: today,
                        expiryDate: latestExpiry,
                    };
                    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
                }
            } catch (e) {
                console.warn('getCurrentUser supabase sync failed:', (e as any)?.message || e);
            }
        }
        
        // Cek masa aktif saat mengambil sesi juga
        if (sessionUser.expiryDate) {
            const expiry = new Date(sessionUser.expiryDate);
            const todayDate = new Date(today);
            if (todayDate > expiry) {
                AuthService.logout(); // Logout paksa jika sesi masih ada tapi sudah expired
                return null;
            }
        }
        
        if (sessionUser.lastResetDate !== today) {
            const usersStr = localStorage.getItem(USERS_KEY);
            if (usersStr) {
                const users: User[] = JSON.parse(usersStr);
                const freshUser = users.find(u => u.id === sessionUser.id);
                if (freshUser) {
                    const relog = await AuthService.login(freshUser.email, atob(freshUser.password || ''));
                    return relog || sessionUser;
                }
            }
        }
        
        return sessionUser;
    },

    // --- SESSION TIMEOUT GUARD ---
    startSessionTimeout: () => {
        try {
            const timeoutAtStr = localStorage.getItem(SESSION_TIMEOUT_KEY);
            const timeoutAt = timeoutAtStr ? Number(timeoutAtStr) : undefined;
            if (!timeoutAt) return;
            const remaining = timeoutAt - Date.now();
            if (remaining <= 0) {
                AuthService.logout();
                try { location.reload(); } catch {}
                return;
            }
            const prev = (window as any).__vidgoLogoutTimerId as number | undefined;
            if (prev) clearTimeout(prev);
            (window as any).__vidgoLogoutTimerId = window.setTimeout(() => {
                AuthService.logout();
                try { location.reload(); } catch {}
            }, remaining);
        } catch {}
    },
    bumpActivity: () => {
        try {
            localStorage.setItem(SESSION_TIMEOUT_KEY, String(Date.now() + SESSION_MAX_AGE_MS));
            AuthService.startSessionTimeout();
        } catch {}
    },
    installActivityHooks: () => {
        try {
            const w = window as any;
            if (w.__vidgoActivityInstalled) return;

            const handler = () => AuthService.bumpActivity();
            const visHandler = () => { if (document.visibilityState === 'visible') AuthService.bumpActivity(); };
            const storageHandler = (e: StorageEvent) => { if (e.key === SESSION_TIMEOUT_KEY) AuthService.startSessionTimeout(); };

            ['mousemove','mousedown','keydown','scroll','touchstart'].forEach(ev =>
                window.addEventListener(ev, handler, { passive: true })
            );
            document.addEventListener('visibilitychange', visHandler);
            window.addEventListener('storage', storageHandler);

            w.__vidgoActivityInstalled = true;
            w.__vidgoActivityHandler = handler;
            w.__vidgoVisHandler = visHandler;
            w.__vidgoStorageHandler = storageHandler;
        } catch {}
    },
    removeActivityHooks: () => {
        try {
            const w = window as any;
            if (!w.__vidgoActivityInstalled) return;
            const handler = w.__vidgoActivityHandler as (e: Event) => void;
            const visHandler = w.__vidgoVisHandler as (e: Event) => void;
            const storageHandler = w.__vidgoStorageHandler as (e: StorageEvent) => void;
            ['mousemove','mousedown','keydown','scroll','touchstart'].forEach(ev =>
                window.removeEventListener(ev, handler)
            );
            document.removeEventListener('visibilitychange', visHandler);
            window.removeEventListener('storage', storageHandler);
            w.__vidgoActivityInstalled = false;
            w.__vidgoActivityHandler = undefined;
            w.__vidgoVisHandler = undefined;
            w.__vidgoStorageHandler = undefined;
        } catch {}
    },

    // --- CREDIT SYSTEM ---
    deductCredit: async (userId: string): Promise<User | null> => {
        // Supabase mode
        if (isSupabaseEnabled && supabase) {
            try {
                const { data: row, error: selErr } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', userId)
                    .single();
                if (!selErr && row) {
                    const current = row.remaining_credits ?? row.daily_limit ?? DEFAULT_DAILY_LIMIT;
                    if (current <= 0) return null;
                    const newRemaining = current - 1;

                    const { data: updatedRow, error: updErr } = await supabase
                        .from('users')
                        .update({ remaining_credits: newRemaining })
                        .eq('id', userId)
                        .select('*')
                        .single();
                    if (!updErr && updatedRow) {
                        const updatedUser: User = {
                            id: updatedRow.id,
                            email: updatedRow.email,
                            role: updatedRow.role,
                            dailyLimit: updatedRow.daily_limit ?? DEFAULT_DAILY_LIMIT,
                            remainingCredits: updatedRow.remaining_credits ?? newRemaining,
                            lastResetDate: updatedRow.last_reset_date ?? getTodayDateString(),
                            expiryDate: updatedRow.expiry_date ?? undefined
                        };
                        const sessionUser = await AuthService.getCurrentUser();
                        if (sessionUser && sessionUser.id === userId) {
                            localStorage.setItem(SESSION_KEY, JSON.stringify(updatedUser));
                        }
                        return updatedUser;
                    }
                }
            } catch (e) {
                // fallthrough to service-role route
            }

            // Fallback: gunakan endpoint service-role agar tidak terblokir RLS
            try {
                const res = await fetch('/api/userCredits', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'deduct', userId })
                });
                if (res.ok) {
                    const data = await res.json();
                    const updatedUser = data?.user as User | null;
                    if (updatedUser) {
                        const sessionUser = await AuthService.getCurrentUser();
                        if (sessionUser && sessionUser.id === userId) {
                            localStorage.setItem(SESSION_KEY, JSON.stringify(updatedUser));
                        }
                        return updatedUser;
                    }
                }
            } catch (e) {
                console.warn('deductCredit fallback failed:', (e as any)?.message || e);
            }
            // Last resort: optimistik update sesi lokal agar UI tetap sinkron
            try {
                const sessionUser = await AuthService.getCurrentUser();
                if (sessionUser && sessionUser.id === userId && (sessionUser.remainingCredits ?? 0) > 0) {
                    const optimistic: User = {
                        ...sessionUser,
                        remainingCredits: (sessionUser.remainingCredits || 1) - 1,
                    };
                    localStorage.setItem(SESSION_KEY, JSON.stringify(optimistic));
                    return optimistic;
                }
            } catch {}
            return null;
        }

        // Local demo mode
        const usersStr = localStorage.getItem(USERS_KEY);
        if (!usersStr) return null;

        let users: User[] = JSON.parse(usersStr);
        const userIndex = users.findIndex(u => u.id === userId);

        if (userIndex !== -1) {
            if (users[userIndex].remainingCredits > 0) {
                users[userIndex].remainingCredits--;
                localStorage.setItem(USERS_KEY, JSON.stringify(users));

                // Update session juga jika user yang login sama
                const sessionUser = await AuthService.getCurrentUser();
                if (sessionUser && sessionUser.id === userId) {
                    const { password: _, ...updatedSessionUser } = users[userIndex];
                    localStorage.setItem(SESSION_KEY, JSON.stringify(updatedSessionUser));
                    return updatedSessionUser as User;
                }
                return users[userIndex];
            }
        }
        return null;
    },

    // --- ADMIN FUNCTIONS ---
    getAllUsers: async (): Promise<User[]> => {
        if (isSupabaseEnabled) {
            try {
                const res = await fetch('/api/supabaseUsers');
                const data = await res.json();
                return Array.isArray(data) ? data as User[] : [];
            } catch (e) {
                console.error('Failed to fetch users from Supabase API', e);
                return [];
            }
        }
        const usersStr = localStorage.getItem(USERS_KEY);
        const users: User[] = usersStr ? JSON.parse(usersStr) : [];
        return users.map(({ password, ...u }) => ({
            ...u,
            dailyLimit: u.dailyLimit ?? DEFAULT_DAILY_LIMIT,
            remainingCredits: u.remainingCredits ?? DEFAULT_DAILY_LIMIT,
            lastResetDate: u.lastResetDate ?? getTodayDateString()
        }));
    },

    addUser: async (email: string, password: string, role: UserRole, dailyLimit: number = DEFAULT_DAILY_LIMIT, expiryDate?: string, maxSessions?: number): Promise<boolean> => {
        if (isSupabaseEnabled) {
            try {
                const res = await fetch('/api/supabaseUsers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password, role, dailyLimit, expiryDate, maxSessions })
                });
                return res.ok;
            } catch (e) {
                console.error('Failed to add user via Supabase API', e);
                return false;
            }
        }
        const usersStr = localStorage.getItem(USERS_KEY);
        let users: User[] = usersStr ? JSON.parse(usersStr) : [];

        if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
            return false;
        }

        const today = getTodayDateString();
        const newUser: User = {
            id: Math.random().toString(36).substring(2, 9),
            email,
            password: btoa(password),
            role,
            dailyLimit,
            remainingCredits: dailyLimit,
            lastResetDate: today,
            ...(expiryDate && { expiryDate }),
            maxSessions: Math.max(Number(maxSessions ?? 1) || 1, 1)
        };

        users.push(newUser);
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
        return true;
    },

    deleteUser: async (id: string): Promise<boolean> => {
        if (isSupabaseEnabled) {
            try {
                const res = await fetch(`/api/supabaseUsers?uid=${encodeURIComponent(id)}`, { method: 'DELETE' });
                return res.ok;
            } catch (e) {
                console.error('Failed to delete user via Supabase API', e);
                return false;
            }
        }
        const usersStr = localStorage.getItem(USERS_KEY);
        if (!usersStr) return false;

        let users: User[] = JSON.parse(usersStr);
        const userToDelete = users.find(u => u.id === id);
        if (userToDelete?.role === 'admin' && users.filter(u => u.role === 'admin').length <= 1) {
             alert('Tidak bisa menghapus admin terakhir.');
             return false;
        }

        const newUsers = users.filter(u => u.id !== id);
        localStorage.setItem(USERS_KEY, JSON.stringify(newUsers));
        return true;
    }
};
import { supabase, isSupabaseEnabled } from './supabaseClient';
