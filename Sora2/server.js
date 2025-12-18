import express from 'express';
import multer from 'multer';
import cors from 'cors';
import axios from 'axios';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { Solver } from '2captcha';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const uploadDir = path.join(os.tmpdir(), 'sora-react-uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

// Konfigurasi 2Captcha
const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY; 
const solver = new Solver(CAPTCHA_API_KEY);

// Konfigurasi API
const TOKENS_CSV_URL = process.env.BEARER_SHEET_CSV_URL || 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRPpeymfltC2Hv4uxJX1hubRSBC4-opcgqfvfspFVKYkTZCQDg7vzxeaQlFbjnme1XOXT3sTxYqFk4v/pub?output=csv';
const VIDEO_GEN_URL = 'https://api.geminigen.ai/api/video-gen/sora';
const HISTORY_URL_BASE = 'https://api.geminigen.ai/api/history/';
const SITE_KEY_CLOUDFLARE = process.env.CAPTCHA_SITE_KEY || '';
const SITE_URL_CLOUDFLARE = process.env.CAPTCHA_SITE_URL || '';
const CAPTCHA_ACTION = process.env.CAPTCHA_ACTION || '';
const CAPTCHA_DATA = process.env.CAPTCHA_DATA || '';
const CAPTCHA_PAGEDATA = process.env.CAPTCHA_PAGEDATA || '';

let TURNSTILE_OVERRIDES = {};

const ACTIVE_LIMIT = 2;
let activeCounts = [];
const uuidTokenMap = {};
const ensureCounts = (n) => { if (!Array.isArray(activeCounts) || activeCounts.length !== n) activeCounts = Array(n).fill(0); };

// Auto-reset jika semua slot penuh tapi tidak ada UUID yang di-track (tidak sinkron)
const autoResetIfNeeded = (n) => {
    ensureCounts(n);
    const allFull = activeCounts.every(c => c >= ACTIVE_LIMIT);
    const noTrackedUuids = Object.keys(uuidTokenMap).length === 0;
    if (allFull && noTrackedUuids) {
        console.log('Auto-reset: Semua slot penuh tapi tidak ada UUID di-track, reset activeCounts...');
        for (let i = 0; i < activeCounts.length; i++) activeCounts[i] = 0;
    }
};

const pickIndexByLoad = (n) => {
    ensureCounts(n);
    autoResetIfNeeded(n); // Auto-reset jika tidak sinkron
    const start = lastWorkingTokenIndex % n;
    const order = Array.from({ length: n }, (_, i) => (start + i) % n);
    for (const idx of order) {
        if ((activeCounts[idx] || 0) < ACTIVE_LIMIT) return idx;
    }
    return order[0];
};
const callApiWithExactToken = async (url, method, data, headers = {}, isMultipart = false, tokenIndex) => {
    const tokens = await getTokens();
    if (tokens.length === 0) throw new Error('Tidak ada token API yang tersedia.');
    ensureCounts(tokens.length);
    const token = tokens[tokenIndex % tokens.length];
    const config = {
        method,
        url,
        headers: {
            ...headers,
            'Authorization': `Bearer ${token}`,
            ...(isMultipart ? data.getHeaders() : {})
        },
        data,
        timeout: 180000
    };
    console.log(`Memakai token index ${tokenIndex} untuk ${method} ${url}`);
    const response = await axios(config);
    lastWorkingTokenIndex = tokenIndex;
    return response.data;
};

const extractTurnstileParams = async (url) => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const resp = await axios.get(url, { headers: { 'User-Agent': ua, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }, timeout: 20000 });
    const html = typeof resp.data === 'string' ? resp.data : '';
    const m = (r) => {
        const s = html.match(r);
        return s && s[1] ? s[1] : null;
    };
    const action =
        m(/data-action=["']([^"']+)["']/i) ||
        m(/"action"\s*:\s*"([^"]+)"/i) ||
        m(/action\s*:\s*["']([^"']+)["']/i) ||
        null;
    const cData =
        m(/data-cdata=["']([^"']+)["']/i) ||
        m(/data-cData=["']([^"']+)["']/i) ||
        m(/"cData"\s*:\s*"([^"]+)"/i) ||
        m(/cData\s*:\s*["']([^"']+)["']/i) ||
        m(/name=["']?cData["']?\s+value=["']([^"']+)["']/i) ||
        null;
    const chlPageData =
        m(/data-chlPageData=["']([^"']+)["']/i) ||
        m(/data-chl-page-data=["']([^"']+)["']/i) ||
        m(/"chlPageData"\s*:\s*"([^"]+)"/i) ||
        m(/chlPageData\s*:\s*["']([^"']+)["']/i) ||
        null;
    return { action, data: cData, pagedata: chlPageData };
};

// Helper: Solve Turnstile
const solveTurnstile = async (url) => {
    try {
        const targetUrl = url || TURNSTILE_OVERRIDES.url || SITE_URL_CLOUDFLARE;
        const payload = {
            sitekey: TURNSTILE_OVERRIDES.sitekey || SITE_KEY_CLOUDFLARE,
            url: targetUrl
        };
        if (TURNSTILE_OVERRIDES.action) payload.action = TURNSTILE_OVERRIDES.action;
        if (TURNSTILE_OVERRIDES.data) payload.data = TURNSTILE_OVERRIDES.data;
        if (TURNSTILE_OVERRIDES.pagedata) payload.pagedata = TURNSTILE_OVERRIDES.pagedata;
        if (CAPTCHA_ACTION) payload.action = CAPTCHA_ACTION;
        if (CAPTCHA_DATA) payload.data = CAPTCHA_DATA;
        if (CAPTCHA_PAGEDATA) payload.pagedata = CAPTCHA_PAGEDATA;
        const candidates = [];
        candidates.push({ ...payload });
        try {
            const u = new URL(targetUrl);
            const originUrl = `${u.origin}/`;
            if (originUrl && originUrl !== payload.url) {
                candidates.push({ ...payload, url: originUrl });
            }
        } catch {}
        for (const p of candidates) {
            const form = new URLSearchParams();
            form.append('key', CAPTCHA_API_KEY || '');
            form.append('method', 'turnstile');
            form.append('sitekey', p.sitekey || '');
            form.append('pageurl', p.url || '');
            if (p.action) form.append('action', p.action);
            if (p.data) form.append('data', p.data);
            if (p.pagedata) form.append('pagedata', p.pagedata);
            form.append('json', '1');
            console.log(`Submitting captcha to 2Captcha: sitekey=${p.sitekey}, url=${p.url}, action=${p.action || 'none'}`);
            const inRes = await axios.post('https://2captcha.com/in.php', form.toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 60000
            });
            console.log(`2Captcha in.php response:`, inRes.data);
            if (inRes.data && inRes.data.status === 1 && inRes.data.request) {
                const id = inRes.data.request;
                const wait = (ms) => new Promise(r => setTimeout(r, ms));
                for (let i = 0; i < 24; i++) {
                    await wait(5000);
                    const resRes = await axios.get(`https://2captcha.com/res.php?key=${encodeURIComponent(CAPTCHA_API_KEY || '')}&action=get&id=${encodeURIComponent(id)}&json=1`, { timeout: 30000 });
                    if (resRes.data && resRes.data.status === 1 && typeof resRes.data.request === 'string') {
                        const ua = resRes.data.useragent || null;
                        console.log(`2Captcha solved! Token length: ${resRes.data.request.length}`);
                        return { token: resRes.data.request, userAgent: ua };
                    }
                    if (resRes.data && resRes.data.request === 'CAPCHA_NOT_READY') {
                        continue;
                    }
                    break;
                }
            }
        }
        try {
            const result = await solver.turnstile(payload);
            const token = result?.data ?? result?.token ?? result?.solution?.token;
            const userAgent = result?.solution?.userAgent || null;
            if (token) return { token, userAgent };
        } catch {}
        return null;
    } catch {
        return null;
    }
};

let TOKENS_CACHE = { tokens: [], fetchedAt: 0 };

const parseTokenCsv = (csvText) => {
    const text = typeof csvText === 'string' ? csvText : String(csvText ?? '');
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const tokens = [];
    const seen = new Set();

    const readFirstCell = (line) => {
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

const fetchTokensFromSheet = async () => {
    const resp = await axios.get(TOKENS_CSV_URL, {
        timeout: 20000,
        responseType: 'text',
        transformResponse: r => r
    });
    return parseTokenCsv(resp.data);
};

const getTokens = async ({ forceRefresh = false } = {}) => {
    const now = Date.now();
    if (!forceRefresh && TOKENS_CACHE.tokens.length > 0 && now - TOKENS_CACHE.fetchedAt < 15000) {
        return TOKENS_CACHE.tokens;
    }
    try {
        const tokens = await fetchTokensFromSheet();
        TOKENS_CACHE = { tokens, fetchedAt: now };
        return tokens;
    } catch (err) {
        const fallback = TOKENS_CACHE.tokens;
        if (fallback.length > 0) return fallback;
        console.error('Gagal mengambil token dari Google Sheet:', err?.message || err);
        return [];
    }
};

let lastWorkingTokenIndex = 0;

// Helper: Rotasi Token & Call API
const callApiWithRotation = async (url, method, data, headers = {}, isMultipart = false) => {
    const tokens = await getTokens();
    if (tokens.length === 0) throw new Error('Tidak ada token API yang tersedia.');
    ensureCounts(tokens.length);
    autoResetIfNeeded(tokens.length); // Auto-reset jika tidak sinkron

    const numTokens = tokens.length;
    console.log(`Rotasi token aktif: total ${numTokens}, startIndex ${lastWorkingTokenIndex}, method ${method}`);
    let lastError = null;
    let skippedAll = true; // Track jika semua token di-skip

    for (let i = 0; i < numTokens; i++) {
        const currentIndex = (lastWorkingTokenIndex + i) % numTokens;
        const token = tokens[currentIndex];
        if ((activeCounts[currentIndex] || 0) >= ACTIVE_LIMIT) {
            console.warn(`Lewati token index ${currentIndex} karena slot penuh (${activeCounts[currentIndex]}/${ACTIVE_LIMIT})`);
            continue;
        }
        skippedAll = false; // Ada token yang dicoba
        
        let config;
        let timer;
        const controller = new AbortController();
        try {
            timer = setTimeout(() => controller.abort(), 20000);
            config = {
                method,
                url,
                headers: {
                    ...headers,
                    'Authorization': `Bearer ${token}`,
                    ...(isMultipart ? data.getHeaders() : {})
                },
                data,
                timeout: 20000,
                signal: controller.signal
            };

            console.log(`Memakai token index ${currentIndex} untuk ${method} ${url}`);
            const response = await axios(config);
            clearTimeout(timer);
            const body = response.data;
            const errCode = body?.detail?.error_code || body?.error_code || null;
            const errMsg = body?.detail?.error_message || body?.error || '';
            const isConcurrency =
                response.status === 429 ||
                /concurr|too many|rate limit|already.*processing|max|limit.*video/i.test(String(errCode || '') + ' ' + String(errMsg || ''));
            if (isConcurrency) {
                console.warn(`Token index ${currentIndex} mencapai batas proses, lanjut token berikutnya...`);
                continue;
            }
            // Hanya solve captcha jika error_code SPESIFIK (bukan regex umum)
            const needCaptcha =
                errCode === 'TURNSTILE_REQUIRED' ||
                errCode === 'TURNSTILE_INVALID';
            if (needCaptcha) {
                console.log(`Response butuh captcha (${errCode}), solving...`);
                const solved = await solveTurnstile();
                if (solved?.token) {
                    if (isMultipart) {
                        data.append('turnstile_token', solved.token);
                    }
                    const retryConfig = { ...config, data, headers: { ...config.headers } };
                    if (solved.userAgent) retryConfig.headers['User-Agent'] = solved.userAgent;
                    const retryResponse = await axios(retryConfig);
                    lastWorkingTokenIndex = currentIndex;
                    console.log(`Sukses setelah captcha dengan token index ${currentIndex}`);
                    return retryResponse.data;
                }
            }
            lastWorkingTokenIndex = currentIndex;
            console.log(`Sukses dengan token index ${currentIndex}`);
            return body;

        } catch (error) {
            if (timer) clearTimeout(timer);
            lastError = error;
            const status = error.response?.status;
            const errorCode = error.response?.data?.detail?.error_code;
            const msgText = error.response?.data?.detail?.error_message || error.response?.data?.error || error.message || '';
            const isConcurrency =
                status === 429 ||
                /concurr|too many|rate limit|already.*processing|max|limit.*video/i.test(String(errorCode || '') + ' ' + String(msgText || ''));

            // Jika timeout, langsung skip ke token berikutnya
            if (
                error.code === 'ECONNABORTED' ||
                error.message?.includes('timeout') ||
                error.code === 'ERR_CANCELED' ||
                error.name === 'CanceledError'
            ) {
                console.warn(`Token index ${currentIndex} timeout, mencoba token berikutnya...`);
                continue;
            }

            // Jika error auth atau limit, lanjut ke token berikutnya
            if (status === 401 || status === 403 || errorCode === 'FREE_TRIAL_LIMIT_EXCEEDED' || isConcurrency) {
                console.warn(`Token index ${currentIndex} gagal (${status || errorCode}), mencoba token berikutnya...`);
                continue;
            }

            // Cek apakah error BENAR-BENAR terkait captcha (harus ada error_code spesifik)
            const isCaptchaError = 
                errorCode === 'TURNSTILE_REQUIRED' ||
                errorCode === 'TURNSTILE_INVALID';

            // Jika error 422, langsung skip ke token berikutnya (FAST) - jangan solve captcha
            if (status === 422) {
                console.warn(`Token index ${currentIndex} gagal (422), mencoba token berikutnya...`);
                continue;
            }

            // Hanya solve captcha jika error_code SPESIFIK menunjukkan butuh captcha
            if (isCaptchaError) {
                console.log(`Token index ${currentIndex} butuh captcha (${errorCode}), solving...`);
                const solved = await solveTurnstile();
                if (solved?.token) {
                    try {
                        if (isMultipart) {
                            data.append('turnstile_token', solved.token); 
                        }
                        const retryConfig = { ...config, data, headers: { ...config.headers } };
                        if (solved.userAgent) retryConfig.headers['User-Agent'] = solved.userAgent;
                        const retryResponse = await axios(retryConfig);
                        lastWorkingTokenIndex = currentIndex;
                        console.log(`Sukses setelah captcha dengan token index ${currentIndex}`);
                        return retryResponse.data;
                    } catch (retryErr) {
                        const retryStatus = retryErr.response?.status;
                        const retryErrCode = retryErr.response?.data?.detail?.error_code;
                        const retryMsg = retryErr.response?.data?.detail?.error_message || retryErr.message;
                        console.warn(`Retry setelah captcha gagal: ${retryStatus} - ${retryErrCode} - ${retryMsg}`);
                        continue;
                    }
                } else {
                    console.warn(`Solve captcha gagal (tidak dapat token dari 2Captcha)`);
                    continue;
                }
            }

            console.warn(`Token index ${currentIndex} gagal (${status || errorCode || error.code || 'unknown'}), coba token berikutnya...`);
            continue;
        }
    }

    // Jika semua token di-skip karena "penuh", force reset dan coba lagi sekali
    if (skippedAll) {
        console.log('Semua token di-skip, force reset dan coba ulang...');
        for (let i = 0; i < activeCounts.length; i++) activeCounts[i] = 0;
        // Coba sekali lagi dengan token pertama
        const token = tokens[0];
        try {
            const config = {
                method,
                url,
                headers: {
                    ...headers,
                    'Authorization': `Bearer ${token}`,
                    ...(isMultipart ? data.getHeaders() : {})
                },
                data,
                timeout: 20000
            };
            console.log(`Retry dengan token index 0 setelah force reset`);
            const response = await axios(config);
            lastWorkingTokenIndex = 0;
            return response.data;
        } catch (retryErr) {
            throw new Error('Semua token gagal setelah force reset.');
        }
    }

    throw new Error('Semua token gagal atau limit habis.');
};

// Endpoint: Generate Video
app.post('/api/generate', upload.single('files'), async (req, res) => {
    try {
        const { prompt, duration, aspect_ratio, resolution, model, provider, turnstile_token, user_agent } = req.body;

        if (!prompt) return res.status(400).json({ success: false, error: 'Prompt wajib diisi.' });

        const tks = await getTokens({ forceRefresh: true });
        if (tks.length === 0) return res.status(500).json({ success: false, error: 'Tidak ada token API yang tersedia.' });

        const formData = new axios.toFormData({
            prompt,
            model: model || 'sora-2',
            aspect_ratio: aspect_ratio || 'landscape',
            resolution: resolution || 'small',
            duration: duration || '10',
            provider: provider || 'openai',
            turnstile_token: turnstile_token || ''
        });

        // Jika ada file upload
        if (req.file) {
            const fileStream = fs.createReadStream(req.file.path);
            formData.append('files', fileStream, req.file.originalname);
        }

        const extraHeaders = {};
        if (typeof user_agent === 'string' && user_agent) {
            extraHeaders['User-Agent'] = user_agent;
        }
        ensureCounts(tks.length);
        const preferred = pickIndexByLoad(tks.length);
        lastWorkingTokenIndex = preferred;
        const data = await callApiWithRotation(VIDEO_GEN_URL, 'POST', formData, extraHeaders, true);

        // Hapus file temp
        if (req.file) fs.unlinkSync(req.file.path);

        // Cari UUID di response
        const uuid = data.uuid || data.data?.uuid || data.id;

        if (uuid) {
            console.log(`Generate berhasil dengan token index ${lastWorkingTokenIndex}, uuid ${uuid}`);
            uuidTokenMap[uuid] = lastWorkingTokenIndex;
            activeCounts[lastWorkingTokenIndex] = (activeCounts[lastWorkingTokenIndex] || 0) + 1;
            res.json({ success: true, uuid, token_index: lastWorkingTokenIndex });
        } else {
            res.status(500).json({ success: false, error: 'UUID tidak ditemukan di response API.', data });
        }

    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        
        const msg = error.response?.data?.detail?.error_message || error.message || 'Terjadi kesalahan server.';
        res.status(500).json({ success: false, error: msg, details: error.response?.data });
    }
});

// Endpoint: Check Status
app.get('/api/check-status', async (req, res) => {
    const { uuid } = req.query;
    if (!uuid) return res.status(400).json({ status: 'error', message: 'UUID wajib diisi.' });

    try {
        const url = `${HISTORY_URL_BASE}${encodeURIComponent(uuid)}`;
        let data;
        const idx = uuidTokenMap[uuid];
        if (typeof idx === 'number') {
            try {
                data = await callApiWithExactToken(url, 'GET', undefined, {}, false, idx);
            } catch {
                data = await callApiWithRotation(url, 'GET');
            }
        } else {
            data = await callApiWithRotation(url, 'GET');
        }

        // Analisa response
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
                if (typeof idx === 'number') {
                    activeCounts[idx] = Math.max(0, (activeCounts[idx] || 0) - 1);
                    delete uuidTokenMap[uuid];
                }
                return res.json({ status: 'complete', url: videoUrl });
            }
        }

        if (videoItem && videoItem.error_message) {
            if (typeof idx === 'number') {
                activeCounts[idx] = Math.max(0, (activeCounts[idx] || 0) - 1);
                delete uuidTokenMap[uuid];
            }
        }
        res.json({ status: 'processing' });

    } catch (error) {
        const msg = error.response?.data?.detail?.error_message || error.message || 'Gagal mengecek status.';
        res.status(500).json({ status: 'error', message: msg });
    }
});

app.get('/api/extract-turnstile', async (req, res) => {
    try {
        const url = req.query.url || SITE_URL_CLOUDFLARE;
        const params = await extractTurnstileParams(url);
        res.json({ success: true, url, ...params });
    } catch (error) {
        const msg = error.message || 'Gagal ekstrak parameter.';
        res.status(500).json({ success: false, error: msg });
    }
});

app.get('/api/test-solver', async (req, res) => {
    try {
        const url = req.query.url || SITE_URL_CLOUDFLARE;
        const solved = await solveTurnstile(url);
        if (!solved) return res.status(500).json({ success: false, error: 'Solver gagal atau parameter kurang.' });
        res.json({ success: true, token: solved.token, userAgent: solved.userAgent });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message || 'Gagal memanggil solver.' });
    }
});

app.get('/api/2captcha-balance', async (req, res) => {
    try {
        if (!CAPTCHA_API_KEY) {
            return res.status(400).json({ success: false, error: 'CAPTCHA_API_KEY kosong di .env' });
        }
        const r = await axios.get(`https://2captcha.com/res.php?key=${encodeURIComponent(CAPTCHA_API_KEY)}&action=getbalance&json=1`);
        res.json({ success: true, balance: r.data?.balance ?? r.data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message || 'Gagal mendapatkan saldo 2Captcha.' });
    }
});

app.post('/api/turnstile-params', async (req, res) => {
    try {
        const { action, data, pagedata, sitekey, url } = req.body || {};
        TURNSTILE_OVERRIDES = {
            ...TURNSTILE_OVERRIDES,
            ...(typeof action === 'string' ? { action } : {}),
            ...(typeof data === 'string' ? { data } : {}),
            ...(typeof pagedata === 'string' ? { pagedata } : {}),
            ...(typeof sitekey === 'string' ? { sitekey } : {}),
            ...(typeof url === 'string' ? { url } : {})
        };
        res.json({ success: true, overrides: TURNSTILE_OVERRIDES });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message || 'Gagal set parameter.' });
    }
});

app.get('/api/turnstile-params', (req, res) => {
    const { action, data, pagedata, sitekey, url } = req.query || {};
    if (typeof action === 'string') TURNSTILE_OVERRIDES.action = action;
    if (typeof data === 'string') TURNSTILE_OVERRIDES.data = data;
    if (typeof pagedata === 'string') TURNSTILE_OVERRIDES.pagedata = pagedata;
    if (typeof sitekey === 'string') TURNSTILE_OVERRIDES.sitekey = sitekey;
    if (typeof url === 'string') TURNSTILE_OVERRIDES.url = url;
    res.json({ success: true, overrides: TURNSTILE_OVERRIDES });
});

app.get('/__routes', (req, res) => {
    try {
        const stack = app._router && app._router.stack ? app._router.stack : [];
        const routes = stack
            .filter(r => r.route && r.route.path)
            .map(r => ({ method: Object.keys(r.route.methods)[0], path: r.route.path }));
        res.json(routes);
    } catch {
        res.json([]);
    }
});

app.post('/api/reset-scheduler', (req, res) => {
    try {
        Promise.resolve()
            .then(async () => {
                const tokens = await getTokens({ forceRefresh: true });
                ensureCounts(tokens.length);
                for (let i = 0; i < activeCounts.length; i++) activeCounts[i] = 0;
                for (const k of Object.keys(uuidTokenMap)) delete uuidTokenMap[k];
                lastWorkingTokenIndex = 0;
                res.json({ success: true, counts: activeCounts, lastIndex: lastWorkingTokenIndex });
            })
            .catch((error) => {
                res.status(500).json({ success: false, error: error.message || 'Gagal reset scheduler.' });
            });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message || 'Gagal reset scheduler.' });
    }
});

if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server berjalan di http://localhost:${PORT}`);
    });
}

export default app;
