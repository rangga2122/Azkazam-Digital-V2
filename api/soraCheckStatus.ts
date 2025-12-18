import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

const TOKENS_CSV_URL = process.env.SORA_BEARER_SHEET_CSV_URL || 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRPpeymfltC2Hv4uxJX1hubRSBC4-opcgqfvfspFVKYkTZCQDg7vzxeaQlFbjnme1XOXT3sTxYqFk4v/pub?output=csv';
const HISTORY_URL_BASE = 'https://api.geminigen.ai/api/history/';

let TOKENS_CACHE = { tokens: [] as string[], fetchedAt: 0 };
let lastWorkingTokenIndex = 0;

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
                if (next === '"') { out += '"'; i += 2; continue; }
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
        if (!t || /^(token|bearer)$/i.test(t) || seen.has(t)) continue;
        seen.add(t);
        tokens.push(t);
    }
    return tokens;
};

const getTokens = async (): Promise<string[]> => {
    const now = Date.now();
    if (TOKENS_CACHE.tokens.length > 0 && now - TOKENS_CACHE.fetchedAt < 15000) {
        return TOKENS_CACHE.tokens;
    }
    try {
        const resp = await axios.get(TOKENS_CSV_URL, { timeout: 20000, responseType: 'text', transformResponse: (r: any) => r });
        const tokens = parseTokenCsv(resp.data);
        TOKENS_CACHE = { tokens, fetchedAt: now };
        return tokens;
    } catch {
        return TOKENS_CACHE.tokens;
    }
};

const callApiWithRotation = async (url: string): Promise<any> => {
    const tokens = await getTokens();
    if (tokens.length === 0) throw new Error('Tidak ada token API yang tersedia.');

    for (let i = 0; i < tokens.length; i++) {
        const currentIndex = (lastWorkingTokenIndex + i) % tokens.length;
        const token = tokens[currentIndex];
        try {
            const response = await axios.get(url, {
                headers: { 'Authorization': `Bearer ${token}` },
                timeout: 30000
            });
            lastWorkingTokenIndex = currentIndex;
            return response.data;
        } catch (error: any) {
            const status = error.response?.status;
            if (status === 401 || status === 403 || status === 429) continue;
            throw error;
        }
    }
    throw new Error('Semua token gagal.');
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ status: 'error', message: 'Method not allowed' });

    const { uuid } = req.query;
    if (!uuid || typeof uuid !== 'string') {
        return res.status(400).json({ status: 'error', message: 'UUID wajib diisi.' });
    }

    try {
        const url = `${HISTORY_URL_BASE}${encodeURIComponent(uuid)}`;
        const data = await callApiWithRotation(url);

        if (data.error_message) {
            return res.json({ status: 'error', message: data.error_message });
        }

        const videoItem = data.generated_video?.[0];
        if (videoItem) {
            if (videoItem.error_message) {
                return res.json({ status: 'error', message: videoItem.error_message });
            }
            const videoUrl = videoItem.video_url || videoItem.file_download_url || videoItem.video_uri || videoItem.sora_post_url;
            if (videoUrl) {
                return res.json({ status: 'complete', url: videoUrl });
            }
        }

        return res.json({ status: 'processing' });
    } catch (error: any) {
        const msg = error.response?.data?.detail?.error_message || error.message || 'Gagal mengecek status.';
        return res.status(500).json({ status: 'error', message: msg });
    }
}
