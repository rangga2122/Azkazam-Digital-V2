// services/reportingService.ts
import { supabase, isSupabaseEnabled } from './supabaseClient';

export interface GenerationLogEntry {
    userId: string;
    userEmail: string;
    timestamp: string; // ISO 8601 format
}

export interface UserReport {
    email: string;
    count: number;
}

export interface ReportData {
    total: number;
    byUser: UserReport[];
}

export type ReportPeriod = 'today' | '7days' | '30days' | 'all';

const LOG_KEY = 'veo_generation_log';

export const ReportingService = {
    // Fire & forget: simpan lokal dan coba sync ke Supabase
    logGeneration: (userId: string, userEmail: string): void => {
        try {
            const logStr = localStorage.getItem(LOG_KEY);
            const log: GenerationLogEntry[] = logStr ? JSON.parse(logStr) : [];

            const newEntry: GenerationLogEntry = {
                userId,
                userEmail,
                timestamp: new Date().toISOString()
            };

            log.push(newEntry);
            localStorage.setItem(LOG_KEY, JSON.stringify(log));

            if (isSupabaseEnabled) {
                (async () => {
                    try {
                        if (supabase) {
                            const { error } = await supabase
                                .from('generation_logs')
                                .insert({ user_id: userId, user_email: userEmail, timestamp: newEntry.timestamp });
                            if (error) throw error;
                        }
                    } catch (e: any) {
                        try {
                            await fetch('/api/generationLogs', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ userId, userEmail, timestamp: newEntry.timestamp })
                            });
                        } catch (e2) {
                            console.warn('failed to sync generation log to Supabase:', e?.message || e);
                        }
                    }
                })();
            }
        } catch (error) {
            console.error('Failed to log generation event:', error);
        }
    },

    // Ambil laporan terpusat dari Supabase bila tersedia; fallback ke lokal
    getGenerationReport: async (period: ReportPeriod): Promise<ReportData> => {
        if (isSupabaseEnabled) {
            try {
                const res = await fetch(`/api/generationLogs?period=${encodeURIComponent(period)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (typeof data?.total === 'number' && Array.isArray(data?.byUser)) {
                        return { total: data.total, byUser: data.byUser as UserReport[] };
                    }
                }
            } catch (e) {
                console.warn('Failed to fetch centralized report, falling back to local:', (e as any)?.message || e);
            }
        }

        // Fallback: gunakan log lokal di browser ini
        try {
            const logStr = localStorage.getItem(LOG_KEY);
            if (!logStr) return { total: 0, byUser: [] };

            const log: GenerationLogEntry[] = JSON.parse(logStr);
            const now = new Date();
            let startDate = new Date(0); // For 'all'

            switch (period) {
                case 'today':
                    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    break;
                case '7days':
                    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    startDate.setHours(0, 0, 0, 0);
                    break;
                case '30days':
                    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    startDate.setHours(0, 0, 0, 0);
                    break;
            }

            const filteredLog = period === 'all'
                ? log
                : log.filter(entry => new Date(entry.timestamp) >= startDate);

            const userCounts = filteredLog.reduce((acc, entry) => {
                acc[entry.userEmail] = (acc[entry.userEmail] || 0) + 1;
                return acc;
            }, {} as { [email: string]: number });

            const byUser: UserReport[] = Object.entries(userCounts)
                .map(([email, count]) => ({ email, count }))
                .sort((a, b) => b.count - a.count);

            return { total: filteredLog.length, byUser };
        } catch (error) {
            console.error('Failed to generate report (local fallback):', error);
            return { total: 0, byUser: [] };
        }
    }
};
