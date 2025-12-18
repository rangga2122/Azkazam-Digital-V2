import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import FormData from 'form-data';

// Konfigurasi API
const TOKENS_CSV_URL = process.env.SORA_BEARER_SHEET_CSV_URL || 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRPpeymfltC2Hv4uxJX1hubRSBC4-opcgqfvfspFVKYkTZCQDg7vzxeaQlFbjnme1XOXT3sTxYqFk4v/pub?output=csv';
const VIDEO_GEN_URL = 'https://api.geminigen.ai/api/video-gen/sora';
const CAPTCHA_API_KEY = process.env.SORA_CAPTCHA_API_KEY || '';
const SITE_KEY_CLOUDFLARE = process.env.SORA_CAPTCHA_SITE_KEY || '0x4AAAAAACDBydnKT0zYzh2H';
const SITE_URL_CLOUDFLARE = process.env.SORA_CAPTCHA_SITE_URL || 'https://geminigen.ai/app/video-gen/';

const ACTIVE_LIMIT = 2;
let activeCounts: number[] = [];
const uuidTokenMap: Record<string, number> = {};
let lastWorkingTokenIndex = 0;
let TOKENS_CACHE = { tokens: [] as string[], fetchedAt: 0 };

const parseTokenCsv = (csvText: string): string[] => {
    const text = typeof csvText === 'string' ? csvText : String(csvText ?? '');
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const tokens: string[] = [];
    const seen = new Set<string>();

    const readFirstCell = (line: string): string => {
        if (!line) return '';
        if (line[0] !== '"') {
            const idx = line.indexOf(',');
            return (idx === -1 ? line : line.slice(0, idx)).trim();
        }
        let i = 1;
        let out = '';
        while (i < line.length) {
            const ch = line[i];
            if (ch === '"') {
                const next = line[i + 1];
                if (next === '"') {
                    out += '"';
                    i += 2;
                    continue;
                }
                break;
            }
            out += ch;
            i += 1;
        }
        return out.trim();
    };

    for (const line of lines) {
        const cell = readFirstCell(line);
        const t = String(cell || '').trim();
        if (!t) continue;
        if (/^(token|bearer)$/i.test(t)) continue;
        if (seen.has(t)) continue;
        seen.add(t);
        tokens.push(t);
    }
    return tokens;
};


const fetchTokensFromSheet = async (): Promise<string[]> => {
    const resp = await axios.get(TOKENS_CSV_URL, {
        timeout: 20000,
        responseType: 'text',
        transformResponse: (r: any) => r
    });
    return parseTokenCsv(resp.data);
};

const getTokens = async ({ forceRefresh = false } = {}): Promise<string[]> => {
    const now = Date.now();
    if (!forceRefresh && TOKENS_CACHE.tokens.length > 0 && now - TOKENS_CACHE.fetchedAt < 15000) {
        return TOKENS_CACHE.tokens;
    }
    try {
        const tokens = await fetchTokensFromSheet();
        TOKENS_CACHE = { tokens, fetchedAt: now };
        return tokens;
    } catch (err: any) {
        const fallback = TOKENS_CACHE.tokens;
        if (fallback.length > 0) return fallback;
        console.error('Gagal mengambil token dari Google Sheet:', err?.message || err);
        return [];
    }
};

const ensureCounts = (n: number) => { 
    if (!Array.isArray(activeCounts) || activeCounts.length !== n) activeCounts = Array(n).fill(0); 
};

const solveTurnstile = async (): Promise<{ token: string; userAgent: string | null } | null> => {
    if (!CAPTCHA_API_KEY) return null;
    try {
        const form = new URLSearchParams();
        form.append('key', CAPTCHA_API_KEY);
        form.append('method', 'turnstile');
        form.append('sitekey', SITE_KEY_CLOUDFLARE);
        form.append('pageurl', SITE_URL_CLOUDFLARE);
        form.append('json', '1');

        const inRes = await axios.post('https://2captcha.com/in.php', form.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 60000
        });

        if (inRes.data && inRes.data.status === 1 && inRes.data.request) {
            const id = inRes.data.request;
            for (let i = 0; i < 24; i++) {
                await new Promise(r => setTimeout(r, 5000));
                const resRes = await axios.get(`https://2captcha.com/res.php?key=${encodeURIComponent(CAPTCHA_API_KEY)}&action=get&id=${encodeURIComponent(id)}&json=1`, { timeout: 30000 });
                if (resRes.data && resRes.data.status === 1 && typeof resRes.data.request === 'string') {
                    return { token: resRes.data.request, userAgent: resRes.data.useragent || null };
                }
                if (resRes.data && resRes.data.request === 'CAPCHA_NOT_READY') continue;
                break;
            }
        }
        return null;
    } catch {
        return null;
    }
};

const callApiWithRotation = async (url: string, method: string, data: any, headers: Record<string, string> = {}, isMultipart = false): Promise<any> => {
    const tokens = await getTokens();
    if (tokens.length === 0) throw new Error('Tidak ada token API yang tersedia.');
    ensureCounts(tokens.length);

    const numTokens = tokens.length;
    let lastError: any = null;

    for (let i = 0; i < numTokens; i++) {
        const currentIndex = (lastWorkingTokenIndex + i) % numTokens;
        const token = tokens[currentIndex];
        if ((activeCounts[currentIndex] || 0) >= ACTIVE_LIMIT) continue;

        try {
            const config: any = {
                method,
                url,
                headers: {
                    ...headers,
                    'Authorization': `Bearer ${token}`,
                    ...(isMultipart && data.getHeaders ? data.getHeaders() : {})
                },
                data,
                timeout: 60000
            };

            const response = await axios(config);
            lastWorkingTokenIndex = currentIndex;
            return response.data;
        } catch (error: any) {
            lastError = error;
            const status = error.response?.status;
            if (status === 401 || status === 403 || status === 429) continue;
            
            const errorCode = error.response?.data?.detail?.error_code;
            if (errorCode === 'TURNSTILE_REQUIRED' || errorCode === 'TURNSTILE_INVALID') {
                const solved = await solveTurnstile();
                if (solved?.token && isMultipart) {
                    data.append('turnstile_token', solved.token);
                    try {
                        const retryConfig = { ...config, data };
                        const retryResponse = await axios(retryConfig);
                        lastWorkingTokenIndex = currentIndex;
                        return retryResponse.data;
                    } catch { continue; }
                }
            }
            continue;
        }
    }
    throw lastError || new Error('Semua token gagal.');
};


export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { prompt, duration, aspect_ratio, resolution, model, provider, turnstile_token, user_agent } = req.body || {};

        if (!prompt) {
            return res.status(400).json({ success: false, error: 'Prompt wajib diisi.' });
        }

        const tks = await getTokens({ forceRefresh: true });
        if (tks.length === 0) {
            return res.status(500).json({ success: false, error: 'Tidak ada token API yang tersedia.' });
        }

        const formData = new FormData();
        formData.append('prompt', prompt);
        formData.append('model', model || 'sora-2');
        formData.append('aspect_ratio', aspect_ratio || 'landscape');
        formData.append('resolution', resolution || 'small');
        formData.append('duration', duration || '10');
        formData.append('provider', provider || 'openai');
        if (turnstile_token) formData.append('turnstile_token', turnstile_token);

        const extraHeaders: Record<string, string> = {};
        if (typeof user_agent === 'string' && user_agent) {
            extraHeaders['User-Agent'] = user_agent;
        }

        ensureCounts(tks.length);
        const data = await callApiWithRotation(VIDEO_GEN_URL, 'POST', formData, extraHeaders, true);

        const uuid = data.uuid || data.data?.uuid || data.id;

        if (uuid) {
            uuidTokenMap[uuid] = lastWorkingTokenIndex;
            activeCounts[lastWorkingTokenIndex] = (activeCounts[lastWorkingTokenIndex] || 0) + 1;
            return res.json({ success: true, uuid, token_index: lastWorkingTokenIndex });
        } else {
            return res.status(500).json({ success: false, error: 'UUID tidak ditemukan di response API.', data });
        }
    } catch (error: any) {
        const msg = error.response?.data?.detail?.error_message || error.message || 'Terjadi kesalahan server.';
        return res.status(500).json({ success: false, error: msg });
    }
}
