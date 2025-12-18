import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { Readable } from 'node:stream';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import os from 'os';
import multer from 'multer';
import axios from 'axios';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
  return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        {
          name: 'sora2-api',
          configureServer(server) {
            const envVars = env;
            const CAPTCHA_API_KEY = envVars.CAPTCHA_API_KEY || '';
            const TOKENS_CSV_URL = envVars.BEARER_SHEET_CSV_URL || 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRPpeymfltC2Hv4uxJX1hubRSBC4-opcgqfvfspFVKYkTZCQDg7vzxeaQlFbjnme1XOXT3sTxYqFk4v/pub?output=csv';
            const VIDEO_GEN_URL = 'https://api.geminigen.ai/api/video-gen/sora';
            const HISTORY_URL_BASE = 'https://api.geminigen.ai/api/history/';
            const SITE_KEY_CLOUDFLARE = envVars.CAPTCHA_SITE_KEY || '';
            const SITE_URL_CLOUDFLARE = envVars.CAPTCHA_SITE_URL || '';
            const CAPTCHA_ACTION = envVars.CAPTCHA_ACTION || '';
            const CAPTCHA_DATA = envVars.CAPTCHA_DATA || '';
            const CAPTCHA_PAGEDATA = envVars.CAPTCHA_PAGEDATA || '';

            const uploadDir = path.join(os.tmpdir(), 'sora-react-uploads');
            try { if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true }); } catch {}
            const upload = multer({ dest: uploadDir });

            let TURNSTILE_OVERRIDES: Record<string, any> = {};
            const ACTIVE_LIMIT = 2;
            let activeCounts: number[] = [];
            const uuidTokenMap: Record<string, number> = {};
            let TOKENS_CACHE: { tokens: string[]; fetchedAt: number } = { tokens: [], fetchedAt: 0 };
            let lastWorkingTokenIndex = 0;

            const ensureCounts = (n: number) => { if (!Array.isArray(activeCounts) || activeCounts.length !== n) activeCounts = Array(n).fill(0); };
            const autoResetIfNeeded = (n: number) => {
              ensureCounts(n);
              const allFull = activeCounts.every(c => c >= ACTIVE_LIMIT);
              const noTrackedUuids = Object.keys(uuidTokenMap).length === 0;
              if (allFull && noTrackedUuids) {
                for (let i = 0; i < activeCounts.length; i++) activeCounts[i] = 0;
              }
            };
            const pickIndexByLoad = (n: number) => {
              ensureCounts(n);
              autoResetIfNeeded(n);
              const start = lastWorkingTokenIndex % n;
              const order = Array.from({ length: n }, (_, i) => (start + i) % n);
              for (const idx of order) { if ((activeCounts[idx] || 0) < ACTIVE_LIMIT) return idx; }
              return order[0];
            };

            const parseTokenCsv = (csvText: string) => {
              const text = String(csvText || '');
              const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
              const tokens: string[] = [];
              const seen = new Set<string>();
              const readFirstCell = (line: string) => {
                if (!line) return '';
                if (line[0] !== '"') {
                  const idx = line.indexOf(',');
                  return (idx === -1 ? line : line.slice(0, idx)).trim();
                }
                let i = 1; let out = '';
                while (i < line.length) {
                  const ch = line[i];
                  if (ch === '"') { const next = line[i+1]; if (next === '"') { out += '"'; i += 2; continue; } break; }
                  out += ch; i += 1;
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
              const resp = await axios.get(TOKENS_CSV_URL, { timeout: 20000, responseType: 'text', transformResponse: r => r });
              return parseTokenCsv(resp.data as unknown as string);
            };
            const getTokens = async (opts: { forceRefresh?: boolean } = {}) => {
              const now = Date.now();
              if (!opts.forceRefresh && TOKENS_CACHE.tokens.length > 0 && now - TOKENS_CACHE.fetchedAt < 15000) return TOKENS_CACHE.tokens;
              try {
                const tokens = await fetchTokensFromSheet();
                TOKENS_CACHE = { tokens, fetchedAt: now };
                return tokens;
              } catch (err) {
                const fallback = TOKENS_CACHE.tokens;
                if (fallback.length > 0) return fallback;
                return [];
              }
            };

            const solveTurnstile = async (url?: string) => {
              try {
                const targetUrl = url || TURNSTILE_OVERRIDES.url || SITE_URL_CLOUDFLARE;
                const payload: Record<string, any> = { sitekey: TURNSTILE_OVERRIDES.sitekey || SITE_KEY_CLOUDFLARE, url: targetUrl };
                if (TURNSTILE_OVERRIDES.action) payload.action = TURNSTILE_OVERRIDES.action;
                if (TURNSTILE_OVERRIDES.data) payload.data = TURNSTILE_OVERRIDES.data;
                if (TURNSTILE_OVERRIDES.pagedata) payload.pagedata = TURNSTILE_OVERRIDES.pagedata;
                if (CAPTCHA_ACTION) payload.action = CAPTCHA_ACTION;
                if (CAPTCHA_DATA) payload.data = CAPTCHA_DATA;
                if (CAPTCHA_PAGEDATA) payload.pagedata = CAPTCHA_PAGEDATA;
                const form = new URLSearchParams();
                form.append('key', CAPTCHA_API_KEY || '');
                form.append('method', 'turnstile');
                form.append('sitekey', payload.sitekey || '');
                form.append('pageurl', payload.url || '');
                if (payload.action) form.append('action', payload.action);
                if (payload.data) form.append('data', payload.data);
                if (payload.pagedata) form.append('pagedata', payload.pagedata);
                form.append('json', '1');
                const inRes = await axios.post('https://2captcha.com/in.php', form.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 60000 });
                if (inRes.data && inRes.data.status === 1 && inRes.data.request) {
                  const id = inRes.data.request;
                  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
                  for (let i = 0; i < 24; i++) {
                    await wait(5000);
                    const resRes = await axios.get(`https://2captcha.com/res.php?key=${encodeURIComponent(CAPTCHA_API_KEY || '')}&action=get&id=${encodeURIComponent(id)}&json=1`, { timeout: 30000 });
                    if (resRes.data && resRes.data.status === 1 && typeof resRes.data.request === 'string') {
                      const ua = resRes.data.useragent || null;
                      return { token: resRes.data.request, userAgent: ua };
                    }
                    if (resRes.data && resRes.data.request === 'CAPCHA_NOT_READY') continue;
                    break;
                  }
                }
              } catch {}
              return null;
            };

            const callApiWithRotation = async (url: string, method: 'GET'|'POST', data?: any, headers: Record<string,string> = {}, isMultipart = false) => {
              const tokens = await getTokens();
              if (tokens.length === 0) throw new Error('Tidak ada token API yang tersedia.');
              ensureCounts(tokens.length);
              autoResetIfNeeded(tokens.length);
              const numTokens = tokens.length;
              let lastError: any = null;
              let skippedAll = true;
              for (let i = 0; i < numTokens; i++) {
                const currentIndex = (lastWorkingTokenIndex + i) % numTokens;
                const token = tokens[currentIndex];
                if ((activeCounts[currentIndex] || 0) >= ACTIVE_LIMIT) continue;
                skippedAll = false;
                let timer: any;
                const controller = new AbortController();
                try {
                  timer = setTimeout(() => controller.abort(), 20000);
                  const config: any = { method, url, headers: { ...headers, 'Authorization': `Bearer ${token}`, ...(isMultipart && data?.getHeaders ? data.getHeaders() : {}) }, data, timeout: 20000, signal: controller.signal };
                  const response = await axios(config);
                  clearTimeout(timer);
                  const body = response.data;
                  const errCode = body?.detail?.error_code || body?.error_code || null;
                  const errMsg = body?.detail?.error_message || body?.error || '';
                  const isConcurrency = response.status === 429 || /concurr|too many|rate limit|already.*processing|max|limit.*video/i.test(String(errCode || '') + ' ' + String(errMsg || ''));
                  if (isConcurrency) continue;
                  const needCaptcha = errCode === 'TURNSTILE_REQUIRED' || errCode === 'TURNSTILE_INVALID';
                  if (needCaptcha) {
                    const solved = await solveTurnstile();
                    if (solved?.token) {
                      if (isMultipart && data?.append) data.append('turnstile_token', solved.token);
                      const retryConfig: any = { ...config, data, headers: { ...config.headers } };
                      if (solved.userAgent) retryConfig.headers['User-Agent'] = solved.userAgent;
                      const retryResponse = await axios(retryConfig);
                      lastWorkingTokenIndex = currentIndex;
                      return retryResponse.data;
                    }
                  }
                  lastWorkingTokenIndex = currentIndex;
                  return body;
                } catch (error: any) {
                  if (timer) clearTimeout(timer);
                  lastError = error;
                  const status = error.response?.status;
                  const errorCode = error.response?.data?.detail?.error_code;
                  const msgText = error.response?.data?.detail?.error_message || error.response?.data?.error || error.message || '';
                  const isConcurrency = status === 429 || /concurr|too many|rate limit|already.*processing|max|limit.*video/i.test(String(errorCode || '') + ' ' + String(msgText || ''));
                  if (error.code === 'ECONNABORTED' || error.message?.includes('timeout') || error.code === 'ERR_CANCELED' || error.name === 'CanceledError') continue;
                  if (status === 401 || status === 403 || errorCode === 'FREE_TRIAL_LIMIT_EXCEEDED' || isConcurrency) continue;
                  const isCaptchaError = errorCode === 'TURNSTILE_REQUIRED' || errorCode === 'TURNSTILE_INVALID';
                  if (status === 422) continue;
                  if (isCaptchaError) {
                    const solved = await solveTurnstile();
                    if (solved?.token) {
                      try {
                        if (isMultipart && data?.append) data.append('turnstile_token', solved.token);
                        const retryConfig: any = { ...config, data, headers: { ...config.headers } };
                        if (solved.userAgent) retryConfig.headers['User-Agent'] = solved.userAgent;
                        const retryResponse = await axios(retryConfig);
                        lastWorkingTokenIndex = currentIndex;
                        return retryResponse.data;
                      } catch {}
                    }
                  }
                  continue;
                }
              }
              if (skippedAll) {
                for (let i = 0; i < activeCounts.length; i++) activeCounts[i] = 0;
                const token = (await getTokens())[0];
                const config: any = { method, url, headers: { ...headers, 'Authorization': `Bearer ${token}`, ...(isMultipart && data?.getHeaders ? data.getHeaders() : {}) }, data, timeout: 20000 };
                const response = await axios(config);
                lastWorkingTokenIndex = 0;
                return response.data;
              }
              throw new Error('Semua token gagal atau limit habis.');
            };

            server.middlewares.use('/api/generate', (req, res, next) => {
              upload.single('files')(req as any, res as any, async (err: any) => {
                if (err) { res.statusCode = 500; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ success:false, error: err.message || 'Upload gagal' })); return; }
                try {
                  const body: any = (req as any).body || {};
                  const { prompt, duration, aspect_ratio, resolution, model, provider, turnstile_token, user_agent } = body;
                  if (!prompt) { res.statusCode = 400; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ success:false, error:'Prompt wajib diisi.' })); return; }
                  const tks = await getTokens({ forceRefresh: true });
                  if (!tks.length) { res.statusCode = 500; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ success:false, error:'Tidak ada token API yang tersedia.' })); return; }
                  const formData: any = axios.toFormData({ prompt, model: model || 'sora-2', aspect_ratio: aspect_ratio || 'landscape', resolution: resolution || 'small', duration: duration || '10', provider: provider || 'openai', turnstile_token: turnstile_token || '' });
                  const fileObj: any = (req as any).file;
                  if (fileObj) { const fileStream = fs.createReadStream(fileObj.path); formData.append('files', fileStream, fileObj.originalname); }
                  const extraHeaders: Record<string,string> = {}; if (typeof user_agent === 'string' && user_agent) extraHeaders['User-Agent'] = user_agent;
                  ensureCounts(tks.length);
                  const preferred = pickIndexByLoad(tks.length);
                  lastWorkingTokenIndex = preferred;
                  const data = await callApiWithRotation(VIDEO_GEN_URL, 'POST', formData, extraHeaders, true);
                  if (fileObj) { try { fs.unlinkSync(fileObj.path); } catch {} }
                  const uuid = data.uuid || data.data?.uuid || data.id;
                  if (uuid) {
                    uuidTokenMap[uuid] = lastWorkingTokenIndex;
                    activeCounts[lastWorkingTokenIndex] = (activeCounts[lastWorkingTokenIndex] || 0) + 1;
                    res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ success:true, uuid, token_index: lastWorkingTokenIndex })); return;
                  }
                  res.statusCode = 500; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ success:false, error:'UUID tidak ditemukan di response API.', data }));
                } catch (error: any) {
                  const fileObj: any = (req as any).file; if (fileObj) { try { fs.existsSync(fileObj.path) && fs.unlinkSync(fileObj.path); } catch {} }
                  const msg = error.response?.data?.detail?.error_message || error.message || 'Terjadi kesalahan server.';
                  res.statusCode = 500; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ success:false, error: msg, details: error.response?.data }));
                }
              });
            });

            server.middlewares.use('/api/check-status', async (req, res) => {
              const reqUrl = new URL(req.url || '/', 'http://localhost');
              const uuid = reqUrl.searchParams.get('uuid');
              if (!uuid) { res.statusCode = 400; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ status:'error', message:'UUID wajib diisi.' })); return; }
              try {
                const url = `${HISTORY_URL_BASE}${encodeURIComponent(uuid)}`;
                let data: any;
                const idx = uuidTokenMap[uuid];
                if (typeof idx === 'number') {
                  try {
                    const tokens = await getTokens();
                    const token = tokens[idx % tokens.length];
                    const resp = await axios.get(url, { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 });
                    data = resp.data;
                  } catch {
                    data = await callApiWithRotation(url, 'GET');
                  }
                } else {
                  data = await callApiWithRotation(url, 'GET');
                }
                if (data.error_message) { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ status:'error', message: data.error_message })); return; }
                const videoItem = data.generated_video?.[0];
                if (videoItem) {
                  if (videoItem.error_message) { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ status:'error', message: videoItem.error_message })); return; }
                  const videoUrl = videoItem.video_url || videoItem.file_download_url || videoItem.video_uri || videoItem.sora_post_url;
                  if (videoUrl) {
                    if (typeof idx === 'number') { activeCounts[idx] = Math.max(0, (activeCounts[idx] || 0) - 1); delete uuidTokenMap[uuid]; }
                    res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ status:'complete', url: videoUrl })); return;
                  }
                }
                if (videoItem && videoItem.error_message) { if (typeof idx === 'number') { activeCounts[idx] = Math.max(0, (activeCounts[idx] || 0) - 1); delete uuidTokenMap[uuid]; } }
                res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ status:'processing' }));
              } catch (error: any) {
                const msg = error.response?.data?.detail?.error_message || error.message || 'Gagal mengecek status.';
                res.statusCode = 500; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ status:'error', message: msg }));
              }
            });

            server.middlewares.use('/api/test-solver', async (req, res) => {
              try {
                const reqUrl = new URL(req.url || '/', 'http://localhost');
                const url = reqUrl.searchParams.get('url') || SITE_URL_CLOUDFLARE;
                const solved = await solveTurnstile(url || undefined);
                if (!solved) { res.statusCode = 500; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ success:false, error:'Solver gagal atau parameter kurang.' })); return; }
                res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ success:true, token: solved.token, userAgent: solved.userAgent }));
              } catch (error: any) {
                res.statusCode = 500; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ success:false, error: error.message || 'Gagal memanggil solver.' }));
              }
            });

            server.middlewares.use('/api/turnstile-params', async (req, res) => {
              try {
                let dataStr = '';
                req.on('data', (chunk: any) => (dataStr += chunk));
                req.on('end', () => {
                  try {
                    const body = JSON.parse(dataStr || '{}');
                    const { action, data, pagedata, sitekey, url } = body || {};
                    TURNSTILE_OVERRIDES = { ...TURNSTILE_OVERRIDES, ...(typeof action === 'string' ? { action } : {}), ...(typeof data === 'string' ? { data } : {}), ...(typeof pagedata === 'string' ? { pagedata } : {}), ...(typeof sitekey === 'string' ? { sitekey } : {}), ...(typeof url === 'string' ? { url } : {}) };
                    res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ success:true, overrides: TURNSTILE_OVERRIDES }));
                  } catch (e: any) {
                    res.statusCode = 500; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ success:false, error: e?.message || 'Gagal set parameter.' }));
                  }
                });
              } catch (error: any) {
                res.statusCode = 500; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ success:false, error: error.message || 'Gagal set parameter.' }));
              }
            });

            server.middlewares.use('/api/reset-scheduler', async (req, res) => {
              try {
                const tokens = await getTokens({ forceRefresh: true });
                ensureCounts(tokens.length);
                for (let i = 0; i < activeCounts.length; i++) activeCounts[i] = 0;
                for (const k of Object.keys(uuidTokenMap)) delete uuidTokenMap[k];
                lastWorkingTokenIndex = 0;
                res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ success:true, counts: activeCounts, lastIndex: lastWorkingTokenIndex }));
              } catch (error: any) {
                res.statusCode = 500; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ success:false, error: error.message || 'Gagal reset scheduler.' }));
              }
            });
          }
        },
        {
          name: 'download-proxy',
          configureServer(server) {
            server.middlewares.use('/download', async (req, res) => {
              try {
                const reqUrl = new URL(req.url || '/', 'http://localhost');
                const target = reqUrl.searchParams.get('url');
                const filenameParam = reqUrl.searchParams.get('filename');
                if (!target) {
                  res.statusCode = 400;
                  res.end('Missing url parameter');
                  return;
                }

                const upstream = await fetch(target);
                if (!upstream.ok) {
                  res.statusCode = upstream.status;
                  res.end(`Upstream error: ${upstream.statusText}`);
                  return;
                }

                const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
                const contentLength = upstream.headers.get('content-length') || undefined;
                const safeName = (filenameParam || `veo3-video-${Date.now()}.mp4`).replace(/[^a-zA-Z0-9._-]+/g, '_');

                res.setHeader('Content-Type', contentType);
                if (contentLength) res.setHeader('Content-Length', contentLength);
                res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);

                if (upstream.body) {
                  const nodeStream = Readable.fromWeb(upstream.body as unknown as ReadableStream);
                  nodeStream.pipe(res);
                } else {
                  const buf = Buffer.from(await upstream.arrayBuffer());
                  res.end(buf);
                }
              } catch (err) {
                res.statusCode = 500;
                const msg = err instanceof Error ? err.message : String(err);
                res.end(`Proxy error: ${msg}`);
              }
            });
          }
        },
        {
          name: 'supabase-admin-api',
          configureServer(server) {
            const SUPABASE_URL = env.SUPABASE_URL;
            const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
            const RESET_TZ = env.RESET_TZ || 'Asia/Jakarta';
            const CRON_SECRET = env.CRON_SECRET || '';
            const hasEnv = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

            function today() {
              try {
                return new Intl.DateTimeFormat('en-CA', { timeZone: RESET_TZ }).format(new Date());
              } catch {
                const now = new Date();
                const yyyy = now.getFullYear();
                const mm = String(now.getMonth() + 1).padStart(2, '0');
                const dd = String(now.getDate()).padStart(2, '0');
                return `${yyyy}-${mm}-${dd}`;
              }
            }

            function isAuthorized(req: any): boolean {
              const auth = req.headers['authorization'] || req.headers['Authorization'];
              if (CRON_SECRET && typeof auth === 'string' && auth.startsWith('Bearer ') && auth.substring('Bearer '.length) === CRON_SECRET) return true;
              return false;
            }

            function toCamel(row: any) {
              if (!row) return null;
              return {
                id: row.id,
                email: row.email,
                role: row.role,
                dailyLimit: row.daily_limit ?? 5,
                remainingCredits: row.remaining_credits ?? row.daily_limit ?? 5,
                lastResetDate: row.last_reset_date ?? today(),
                expiryDate: row.expiry_date ?? undefined,
                allowedFeatures: Array.isArray(row.allowed_features) ? row.allowed_features : undefined,
                maxSessions: row.max_sessions != null ? Number(row.max_sessions) : 1,
              };
            }

            async function readJson(req: any): Promise<any> {
              return new Promise((resolve) => {
                let data = '';
                req.on('data', (chunk: any) => (data += chunk));
                req.on('end', () => {
                  try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
                });
              });
            }

            server.middlewares.use('/api/supabaseUsers', async (req, res) => {
              if (!hasEnv) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Supabase environment variables missing.' }));
                return;
              }

              const supabase = createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string);
              const method = (req.method || 'GET').toUpperCase();

              try {
                if (method === 'GET') {
                  const listAuthUsers = async () => {
                    let page = 1;
                    const perPage = 200;
                    const out: any[] = [];
                    while (true) {
                      const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage });
                      if (listErr) throw new Error(listErr.message);
                      const authUsers = listData?.users || [];
                      for (const u of authUsers) {
                        const uid = (u.id as string) || '';
                        let meta: any = null;
                        try {
                          const { data: row, error: rowErr } = await supabase
                            .from('users')
                            .select('*')
                            .eq('id', uid)
                            .single();
                          if (!rowErr && row) meta = row;
                        } catch {}
                        const base = {
                          id: uid,
                          email: u.email || '',
                          role: meta?.role || 'user',
                          daily_limit: meta?.daily_limit ?? 5,
                          remaining_credits: meta?.remaining_credits ?? (meta?.daily_limit ?? 5),
                          last_reset_date: meta?.last_reset_date ?? today(),
                          expiry_date: meta?.expiry_date ?? null,
                          max_sessions: meta?.max_sessions ?? 1,
                        };
                        out.push(toCamel(base));
                      }
                      if (authUsers.length < perPage) break;
                      page += 1;
                    }
                    return out;
                  };

                  const { data, error } = await supabase.from('users').select('*');
                  if (error) {
                    if ((error.message || '').includes("Could not find the table 'public.users'")) {
                      const users = await listAuthUsers();
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify(users));
                      return;
                    }
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: error.message }));
                    return;
                  }
                  let users = (data || []).map(toCamel);
                  if (!users.length) {
                    users = await listAuthUsers();
                  }
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(users));
                  return;
                }

                if (method === 'POST') {
                  const body = await readJson(req);
                  const { email, password, role = 'user', dailyLimit = 5, expiryDate, allowedFeatures, maxSessions } = body || {};
                  if (!email || !password) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'Email/password required' }));
                    return;
                  }
                  if (!['user', 'admin'].includes(role)) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'Invalid role' }));
                    return;
                  }

                  const normalizedLimit = Math.max(Number(dailyLimit) || 5, 1);
                  const lowerEmail = String(email).toLowerCase();

                  const findAuthUserByEmail = async (): Promise<string | null> => {
                    let page = 1;
                    const perPage = 200;
                    while (true) {
                      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
                      if (error) throw new Error(error.message);
                      const users = data?.users || [];
                      const match = users.find(u => (u.email || '').toLowerCase() === lowerEmail);
                      if (match) return match.id as string;
                      if (users.length < perPage) return null;
                      page += 1;
                    }
                  };

                  let uid: string | null = null;
                  const { data: createdUser, error: createErr } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
                  if (createErr) {
                    const isDuplicate = /exist|already|registered/i.test(createErr.message || '');
                    if (!isDuplicate) {
                      res.statusCode = 500;
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({ error: createErr.message }));
                      return;
                    }
                    uid = await findAuthUserByEmail();
                    if (!uid) {
                      res.statusCode = 500;
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({ error: 'Email sudah digunakan, dan user tidak ditemukan di Auth.' }));
                      return;
                    }
                    const { error: updErr } = await supabase.auth.admin.updateUserById(uid, { password });
                    if (updErr) {
                      console.warn('Password update failed for existing user:', updErr.message);
                    }
                  } else {
                    uid = createdUser.user?.id || null;
                  }
                  if (!uid) {
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'Failed to create or locate user' }));
                    return;
                  }

                  const row = {
                    id: uid,
                    email,
                    role,
                    daily_limit: normalizedLimit,
                    remaining_credits: normalizedLimit,
                    last_reset_date: today(),
                    expiry_date: expiryDate || null,
                    allowed_features: Array.isArray(allowedFeatures) ? allowedFeatures : undefined,
                    max_sessions: Math.max(Number(maxSessions ?? 1) || 1, 1),
                  };

                  const { error: upsertErr } = await supabase
                    .from('users')
                    .upsert(row, { onConflict: 'id' });
                  if (upsertErr) {
                    if ((upsertErr.message || '').includes("Could not find the table 'public.users'")) {
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({ ok: true, user: toCamel(row), warning: 'users table missing; metadata not persisted' }));
                      return;
                    }
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: upsertErr.message }));
                    return;
                  }

                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: true, user: toCamel(row) }));
                  return;
                }

                if (method === 'PUT') {
                  const body = await readJson(req);
                  const uid = String(body.uid || body.id || '');
                  if (!uid) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'uid required' }));
                    return;
                  }

                  const patch: any = {};
                  if (typeof body.role === 'string' && ['user','admin'].includes(body.role)) patch.role = body.role;
                  if (body.dailyLimit != null) patch.daily_limit = Math.max(Number(body.dailyLimit) || 1, 1);
                  if (body.remainingCredits != null) patch.remaining_credits = Math.max(Number(body.remainingCredits) || 0, 0);
                  if (body.expiryDate !== undefined) patch.expiry_date = body.expiryDate ? String(body.expiryDate) : null;
                  if (Array.isArray(body.allowedFeatures)) patch.allowed_features = body.allowedFeatures;
                  if (body.maxSessions !== undefined) patch.max_sessions = Math.max(Number(body.maxSessions || 1) || 1, 1);

                  if (Object.keys(patch).length === 0) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'No valid fields to update' }));
                    return;
                  }

                  const { data, error } = await supabase
                    .from('users')
                    .update(patch)
                    .eq('id', uid)
                    .select('*')
                    .single();
                  if (error) {
                    if ((error.message || '').includes("Could not find the table 'public.users'")) {
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({ ok: true, warning: 'users table missing; update not persisted' }));
                      return;
                    }
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: error.message }));
                    return;
                  }
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: true, user: toCamel(data) }));
                  return;
                }

                if (method === 'DELETE') {
                  const reqUrl = new URL(req.url || '/', 'http://localhost');
                  const uid = reqUrl.searchParams.get('uid');
                  if (!uid) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'uid required' }));
                    return;
                  }

                  let targetIsAdmin = false;
                  const { data: targetRow, error: targetErr } = await supabase
                    .from('users')
                    .select('role')
                    .eq('id', uid)
                    .single();
                  if (!targetErr && targetRow?.role === 'admin') targetIsAdmin = true;

                  if (targetIsAdmin) {
                    const { data: admins, error: adminsErr } = await supabase
                      .from('users')
                      .select('id')
                      .eq('role', 'admin');
                    if (adminsErr && !((adminsErr.message || '').includes("Could not find the table 'public.users'"))) {
                      res.statusCode = 500;
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({ error: adminsErr.message }));
                      return;
                    }
                    if (!adminsErr && (admins || []).length <= 1) {
                      res.statusCode = 400;
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({ error: 'Tidak bisa menghapus admin terakhir.' }));
                      return;
                    }
                  }

                  const { error: delRowErr } = await supabase.from('users').delete().eq('id', uid);
                  if (delRowErr && !((delRowErr.message || '').includes("Could not find the table 'public.users'"))) {
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: delRowErr.message }));
                    return;
                  }

                  const { error: delAuthErr } = await supabase.auth.admin.deleteUser(uid);
                  if (delAuthErr) {
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: delAuthErr.message }));
                    return;
                  }

                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: true, warning: delRowErr ? 'users table missing; only auth user deleted' : undefined }));
                  return;
                }

                res.statusCode = 405;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Method not allowed' }));
              } catch (e: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: e?.message || 'Unexpected error' }));
              }
            });

            // Centralized global settings (e.g., VEO bearer token)
            server.middlewares.use('/api/globalSettings', async (req, res) => {
              if (!hasEnv) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Supabase environment variables missing.' }));
                return;
              }

              const supabase = createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string);
              const method = (req.method || 'GET').toUpperCase();

              try {
                if (method === 'GET') {
                  const reqUrl = new URL(req.url || '/', 'http://localhost');
                  const key = reqUrl.searchParams.get('key') || 'VEO_BEARER_TOKEN';
                  const { data, error } = await supabase
                    .from('global_settings')
                    .select('key,value')
                    .eq('key', key)
                    .single();
                  if (error) {
                    const missing = (error.message || '').includes("Could not find the table 'public.global_settings'");
                    if (missing) {
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({ key, value: null, warning: 'global_settings table missing' }));
                      return;
                    }
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: error.message }));
                    return;
                  }
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ key: data?.key || key, value: data?.value || null }));
                  return;
                }

                if (method === 'POST' || method === 'PUT') {
                  const body = await readJson(req);
                  const key = String(body.key || 'VEO_BEARER_TOKEN');
                  const value = String(body.value || '').trim();
                  if (!value) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'value required' }));
                    return;
                  }
                  const row = { key, value, updated_at: new Date().toISOString() };
                  const { error } = await supabase
                    .from('global_settings')
                    .upsert(row, { onConflict: 'key' });
                  if (error) {
                    const missing = (error.message || '').includes("Could not find the table 'public.global_settings'");
                    if (missing) {
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({ ok: true, warning: 'global_settings table missing; value not persisted' }));
                      return;
                    }
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: error.message }));
                    return;
                  }
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: true }));
                  return;
                }

                res.statusCode = 405;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Method not allowed' }));
              } catch (e: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: e?.message || 'Unexpected error' }));
              }
            });

            // Proxy AISandbox API on server to keep bearer token hidden from browser
            server.middlewares.use('/api/aisandboxProxy', async (req, res) => {
              if (!hasEnv) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Supabase environment variables missing.' }));
                return;
              }

              const supabase = createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string);
              const method = (req.method || 'POST').toUpperCase();
              if (method !== 'POST') {
                res.statusCode = 405;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Method not allowed' }));
                return;
              }

              try {
                const body = await readJson(req);
                const path = String(body.path || '').trim();
                const payload = body.body ?? {};

                const allowed = new Set([
                  '/v1:uploadUserImage',
                  '/v1/whisk:runImageRecipe',
                  '/v1/whisk:generateImage',
                  '/v1/video:batchAsyncGenerateVideoStartImage',
                  '/v1/video:batchAsyncGenerateVideoText',
                  '/v1/video:batchCheckAsyncVideoGenerationStatus',
                ]);
                if (!path || !allowed.has(path)) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Invalid or disallowed path' }));
                  return;
                }

                const { data, error } = await supabase
                  .from('global_settings')
                  .select('value')
                  .eq('key', 'VEO_BEARER_TOKEN')
                  .single();
                if (error) {
                  const missing = (error.message || '').includes("Could not find the table 'public.global_settings'");
                  if (missing) {
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'global_settings table missing; cannot read token' }));
                    return;
                  }
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: error.message }));
                  return;
                }

                const token = (data?.value || '').trim();
                if (!token) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Bearer token not configured' }));
                  return;
                }

                const upstream = await fetch(`https://aisandbox-pa.googleapis.com${path}`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(payload),
                });

                const text = await upstream.text();
                res.statusCode = upstream.status;
                res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
                res.end(text);
              } catch (e: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: e?.message || 'Unexpected error' }));
              }
            });

            // Proxy Chutes AI to avoid CORS and keep token server-side
            server.middlewares.use('/api/chutesChat', async (req, res) => {
              if (!hasEnv) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Supabase environment variables missing.' }));
                return;
              }

              const supabase = createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string);
              const method = (req.method || 'POST').toUpperCase();
              if (method !== 'POST') {
                res.statusCode = 405;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Method not allowed' }));
                return;
              }

              try {
                const body = await readJson(req);
                const { data, error } = await supabase
                  .from('global_settings')
                  .select('value')
                  .eq('key', 'CHUTES_API_TOKEN')
                  .single();
                if (error) {
                  const missing = (error.message || '').includes("Could not find the table 'public.global_settings'");
                  if (missing) {
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'global_settings table missing; cannot read token' }));
                    return;
                  }
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: error.message }));
                  return;
                }

                const token = (data?.value || '').trim();
                if (!token) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'CHUTES_API_TOKEN not configured' }));
                  return;
                }

                const upstream = await fetch('https://llm.chutes.ai/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream,application/json'
                  },
                  body: JSON.stringify(body)
                });
 
                if (!upstream.body) {
                  const text = await upstream.text();
                  res.statusCode = upstream.status;
                  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
                  res.end(text);
                  return;
                }
 
                res.statusCode = upstream.status;
                res.setHeader('Content-Type', 'text/event-stream');
                const reader = upstream.body.getReader();
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  res.write(Buffer.from(value));
                }
                res.end();
              } catch (e: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: e?.message || 'Unexpected error' }));
              }
            });

            // Centralized generation logs (admin aggregation + write fallback)
            server.middlewares.use('/api/generationLogs', async (req, res) => {
              if (!hasEnv) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Supabase environment variables missing.' }));
                return;
              }

              const supabase = createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string);
              const method = (req.method || 'GET').toUpperCase();

              try {
                if (method === 'GET') {
                  const reqUrl = new URL(req.url || '/', 'http://localhost');
                  const period = (reqUrl.searchParams.get('period') || 'today') as 'today' | '7days' | '30days' | 'all';
                  console.log('[generationLogs][GET] period=', period);

                  const now = new Date();
                  let startDate: Date | null = null;
                  if (period === 'today') {
                    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                  } else if (period === '7days') {
                    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    startDate.setHours(0, 0, 0, 0);
                  } else if (period === '30days') {
                    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    startDate.setHours(0, 0, 0, 0);
                  }

                  let query = supabase.from('generation_logs').select('user_email,timestamp');
                  if (startDate) {
                    query = query.gte('timestamp', startDate.toISOString());
                  }
                  const { data, error } = await query;
                  if (error) {
                    const missing = (error.message || '').includes("Could not find the table 'public.generation_logs'");
                    if (missing) {
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({ total: 0, byUser: [], warning: 'generation_logs table missing' }));
                      return;
                    }
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: error.message }));
                    return;
                  }

                  const counts: Record<string, number> = {};
                  for (const row of (data || [])) {
                    const email = (row as any).user_email || 'unknown';
                    counts[email] = (counts[email] || 0) + 1;
                  }
                  const byUser = Object.entries(counts)
                    .map(([email, count]) => ({ email, count }))
                    .sort((a, b) => b.count - a.count);
                  console.log('[generationLogs][GET] total=', (data || []).length);

                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ total: (data || []).length, byUser }));
                  return;
                }

                if (method === 'POST') {
                  const body = await readJson(req);
                  const userId = body.userId;
                  const userEmail = body.userEmail;
                  const timestamp = body.timestamp || new Date().toISOString();
                  if (!userId || !userEmail) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'userId and userEmail required' }));
                    return;
                  }

                  const { error } = await supabase
                    .from('generation_logs')
                    .insert({ user_id: userId, user_email: userEmail, timestamp });
                  if (error) {
                    const missing = (error.message || '').includes("Could not find the table 'public.generation_logs'");
                    if (missing) {
                      console.warn('[generationLogs][POST] table missing; event not persisted');
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({ ok: true, warning: 'generation_logs table missing; event not persisted' }));
                      return;
                    }
                    console.error('[generationLogs][POST] insert error:', error.message);
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: error.message }));
                    return;
                  }
                  console.log('[generationLogs][POST] logged generation for', userEmail);
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: true }));
                  return;
                }

                res.statusCode = 405;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Method not allowed' }));
              } catch (e: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: e?.message || 'Unexpected error' }));
              }
            });

            // Server-side credit operations (uses Service Role, bypass RLS restrictions)
            server.middlewares.use('/api/userCredits', async (req, res) => {
              if (!hasEnv) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Supabase environment variables missing.' }));
                return;
              }
              const supabase = createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string);
              const method = (req.method || 'GET').toUpperCase();

              try {
                if (method !== 'POST') {
                  res.statusCode = 405;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Method not allowed' }));
                  return;
                }

                const body = await readJson(req);
                const action = String(body.action || '');

                const userId = String(body.userId || '');
                if (!userId) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'userId required' }));
                  return;
                }
                console.log('[userCredits][POST] action=', action, 'userId=', userId);

                // Helper: ensure metadata row exists for this Supabase Auth user
                const ensureUserRow = async (): Promise<any | null> => {
                  // Try to select existing row
                  const { data: existing, error: selectErr } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', userId)
                    .single();
                  // If table missing, surface error to caller
                  if (selectErr && (selectErr.message || '').includes("Could not find the table 'public.users'")) {
                    console.warn('[userCredits] users table missing');
                    return null;
                  }
                  if (!selectErr && existing) return existing;

                  // Otherwise, attempt to fetch email from Auth and upsert metadata
                  const { data: authUser, error: authErr } = await (supabase as any).auth.admin.getUserById(userId);
                  if (authErr || !authUser?.user) {
                    console.error('[userCredits] getUserById error:', authErr?.message);
                    return null;
                  }
                  const email = authUser.user.email || '';
                  const defaultLimit = 5;
                  const row = {
                    id: userId,
                    email,
                    role: 'user',
                    daily_limit: defaultLimit,
                    remaining_credits: defaultLimit,
                    last_reset_date: today(),
                    expiry_date: null
                  };
                  const { data: upserted, error: upsertErr } = await supabase
                    .from('users')
                    .upsert(row, { onConflict: 'id' })
                    .select('*')
                    .single();
                  if (upsertErr) {
                    console.error('[userCredits] upsert users error:', upsertErr.message);
                    return null;
                  }
                  return upserted;
                };

                if (action === 'ensure') {
                  const ensured = await ensureUserRow();
                  if (!ensured) {
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'Failed to ensure user metadata row' }));
                    return;
                  }
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: true, user: toCamel(ensured) }));
                  return;
                }

                if (action !== 'deduct') {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Invalid action' }));
                  return;
                }

                // Deduct credit: ensure row, cek expiry, lalu pengurangan atomik via RPC
                const row = await ensureUserRow();
                if (!row) {
                  res.statusCode = 404;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'User not found or table missing' }));
                  return;
                }
                const t = today();
                const expiry: string | null = row.expiry_date ?? null;
                if (expiry && typeof expiry === 'string' && expiry < t) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'User expired' }));
                  return;
                }

                const { data: decRows, error: decErr } = await (supabase as any).rpc('decrement_credit', { p_user_id: userId });
                if (decErr) {
                  const msg = decErr.message || '';
                  const missingFn = /Could not find the function/i.test(msg);
                  if (!missingFn) {
                    console.error('[userCredits] rpc decrement_credit error:', msg);
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: msg }));
                    return;
                  }
                  // Fallback non-atomik untuk development bila fungsi belum di-apply
                  const current = row.remaining_credits ?? row.daily_limit ?? 0;
                  if (current <= 0) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'No credits remaining' }));
                    return;
                  }
                  const { data: updatedRow, error: updErr } = await supabase
                    .from('users')
                    .update({ remaining_credits: (current - 1) })
                    .eq('id', userId)
                    .gt('remaining_credits', 0)
                    .select('*')
                    .single();
                  if (updErr || !updatedRow) {
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: updErr?.message || 'Update failed' }));
                    return;
                  }
                  try {
                    await supabase
                      .from('user_credit_events')
                      .insert({ user_id: userId, amount: -1, reason: 'generation', credits_after: updatedRow.remaining_credits });
                  } catch {}
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ ok: true, user: toCamel(updatedRow) }));
                  return;
                }
                const updatedRow = Array.isArray(decRows) ? decRows[0] : decRows;
                if (!updatedRow) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'No credits remaining' }));
                  return;
                }

                // Insert credit event for audit/history
                try {
                  await supabase
                    .from('user_credit_events')
                    .insert({
                      user_id: userId,
                      amount: -1,
                      reason: 'generation',
                      credits_after: (updatedRow.remaining_credits ?? undefined),
                    });
                } catch (evErr: any) {
                  const msg = evErr?.message || String(evErr);
                  const missing = msg.includes("Could not find the table 'public.user_credit_events'");
                  if (!missing) {
                    console.warn('[userCredits] failed to insert credit event:', msg);
                  }
                }

                console.log('[userCredits] deducted 1 credit for', userId);
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ok: true, user: toCamel(updatedRow) }));
              } catch (e: any) {
                console.error('[userCredits] unexpected error:', e?.message);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: e?.message || 'Unexpected error' }));
              }
            });

            // Daily credits reset (dev middleware mirror of serverless function)
            server.middlewares.use('/api/resetDailyCredits', async (req, res) => {
              if (!hasEnv) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Supabase environment variables missing.' }));
                return;
              }
              if (!isAuthorized(req)) {
                res.statusCode = 403;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Forbidden' }));
                return;
              }
              const supabase = createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string);
              const t = today();
              try {
                const { data: candidates, error: selErr } = await supabase
                  .from('users')
                  .select('id,daily_limit,last_reset_date')
                  .or(`last_reset_date.is.null,last_reset_date.neq.${t}`);
                if (selErr) {
                  const msg = selErr.message || '';
                  const missing = msg.includes("Could not find the table 'public.users'");
                  if (missing) {
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ ok: true, processed: 0, warning: 'users table missing; no rows reset' }));
                    return;
                  }
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: msg }));
                  return;
                }
                const rows = candidates || [];
                let processed = 0;
                for (const row of rows) {
                  const limit = (row as any).daily_limit ?? 5;
                  const id = (row as any).id as string;
                  const { error: updErr } = await supabase
                    .from('users')
                    .update({ remaining_credits: limit, last_reset_date: t })
                    .eq('id', id);
                  if (!updErr) {
                    processed += 1;
                    try {
                      await supabase
                        .from('user_credit_events')
                        .insert({ user_id: id, amount: 0, reason: 'daily_reset', credits_after: limit });
                    } catch (evErr: any) {
                      const msg = evErr?.message || String(evErr);
                      const missing = msg.includes("Could not find the table 'public.user_credit_events'");
                      if (!missing) console.warn('[resetDailyCredits][dev] insert event failed:', msg);
                    }
                  } else {
                    console.warn('[resetDailyCredits][dev] update failed for', id, updErr.message);
                  }
                }
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ok: true, processed, today: t }));
              } catch (e: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: e?.message || 'Unexpected error' }));
              }
            });

            const parseCookie = (cookieHeader?: string) => {
              const out: Record<string,string> = {};
              if (!cookieHeader) return out;
              cookieHeader.split(';').map(s => s.trim()).filter(Boolean).forEach(part => {
                const eq = part.indexOf('=');
                if (eq > 0) out[part.substring(0, eq)] = decodeURIComponent(part.substring(eq + 1));
              });
              return out;
            };

            server.middlewares.use((req, res, next) => {
              try {
                res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob: https://storage.googleapis.com; media-src 'self' blob: https://storage.googleapis.com; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co https://aisandbox-pa.googleapis.com https://generativelanguage.googleapis.com https://storage.googleapis.com ws:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
                res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
                res.setHeader('X-Frame-Options', 'DENY');
                res.setHeader('X-Content-Type-Options', 'nosniff');
                res.setHeader('Referrer-Policy', 'no-referrer');
              } catch {}
              next();
            });

            server.middlewares.use('/api/singleSession', async (req, res) => {
              if (!hasEnv) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Supabase environment variables missing.' }));
                return;
              }
              const supabase = createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string);
              const method = (req.method || 'GET').toUpperCase();
              if (method !== 'POST') {
                res.statusCode = 405;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Method not allowed' }));
                return;
              }
              try {
                const body = await readJson(req);
                const action = String(body.action || '');
                const userId = String(body.userId || '');
                const sessionId = String(body.sessionId || '');
                if (!userId || !sessionId) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'userId and sessionId required' }));
                  return;
                }

                const authHeader = (req.headers['authorization'] || req.headers['Authorization']) as string | undefined;
                const cookies = parseCookie(req.headers['cookie'] as string | undefined);
                const cookieSid = cookies['vidgo_sid'];
                const getJwtUserId = (auth?: string) => {
                  if (!auth || !auth.startsWith('Bearer ')) return null;
                  try {
                    const token = auth.substring(7);
                    const parts = token.split('.');
                    if (parts.length < 2) return null;
                    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
                    return (payload.sub || payload.user_id || payload.uid || null) as string | null;
                  } catch { return null; }
                };
                const uidFromJwt = getJwtUserId(authHeader);
                if (!cookieSid || cookieSid !== sessionId) {
                  const allowWithoutAuth = action === 'claim' || action === 'force_claim' || action === 'status';
                  if (!allowWithoutAuth) {
                    if (!uidFromJwt || uidFromJwt !== userId) {
                      res.statusCode = 401;
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({ error: 'Unauthorized' }));
                      return;
                    }
                  }
                }

                const readUsersRow = async () => {
                  const { data, error } = await supabase
                    .from('users')
                    .select('id,current_session_id,session_updated_at,max_sessions')
                    .eq('id', userId)
                    .single();
                  return { data, error };
                };
                const updateUsersRow = async (fields: any) => {
                  const { data, error } = await supabase
                    .from('users')
                    .update(fields)
                    .eq('id', userId)
                    .select('id,current_session_id,session_updated_at')
                    .single();
                  return { data, error };
                };
                const getGS = async (key: string) => {
                  const { data, error } = await supabase
                    .from('global_settings')
                    .select('key,value')
                    .eq('key', key)
                    .single();
                  return { data, error };
                };
                const setGS = async (key: string, value: string | null) => {
                  const row = { key, value: value ?? '', updated_at: new Date().toISOString() };
                  const { error } = await supabase
                    .from('global_settings')
                    .upsert(row, { onConflict: 'key' });
                  return { error };
                };

                const nowIso = new Date().toISOString();
                if (action === 'claim') {
                  const { data: row, error } = await readUsersRow();
                  const missingCol = error && /column "current_session_id"|Could not find the table/i.test(error.message || '');
                  const maxSessions = (!error && row && (row as any).max_sessions != null) ? Math.max(Number((row as any).max_sessions) || 1, 1) : 1;
                  if (maxSessions <= 1) {
                    if (!error && row) {
                      const cur = (row as any).current_session_id as string | null;
                      if (cur && cur !== sessionId) {
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ ok: false, reason: 'occupied', message: 'Silahkan logout dulu di akun sebelumnya' }));
                        return;
                      }
                      const { error: updErr } = await updateUsersRow({ current_session_id: sessionId, session_updated_at: nowIso });
                      if (updErr) {
                        res.statusCode = 500;
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ error: updErr.message }));
                        return;
                      }
                      res.setHeader('Set-Cookie', `vidgo_sid=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800`);
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({ ok: true }));
                      return;
                    }
                    if (missingCol) {
                      const keySess = `SESSION_USER_${userId}`;
                      const { data: gsRow } = await getGS(keySess);
                      const cur = (gsRow as any)?.value as string | undefined;
                      if (cur && cur !== sessionId) {
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ ok: false, reason: 'occupied', message: 'Silahkan logout dulu di akun sebelumnya' }));
                        return;
                      }
                      const { error: setErr } = await setGS(keySess, sessionId);
                      if (setErr) {
                        res.statusCode = 500;
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ error: setErr.message }));
                        return;
                      }
                      res.setHeader('Set-Cookie', `vidgo_sid=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800`);
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({ ok: true }));
                      return;
                    }
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: error?.message || 'Unexpected error' }));
                    return;
                  } else {
                    const keySessList = `SESSION_LIST_${userId}`;
                    const { data: gsRow } = await getGS(keySessList);
                    let arr: string[] = [];
                    try { arr = JSON.parse(((gsRow as any)?.value || '[]')); } catch { arr = []; }
                    if (!arr.includes(sessionId) && arr.length >= maxSessions) {
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({ ok: false, reason: 'occupied', message: 'Silahkan logout dulu di akun sebelumnya' }));
                      return;
                    }
                    if (!arr.includes(sessionId)) arr.push(sessionId);
                    const { error: setErr } = await setGS(keySessList, JSON.stringify(arr));
                    if (setErr) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: setErr.message })); return; }
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ ok: true }));
                    return;
                  }
                }

                if (action === 'force_claim') {
                  const { data: row, error } = await readUsersRow();
                  const missingCol = error && /column "current_session_id"|Could not find the table/i.test(error.message || '');
                  if (!error && row) {
                    const prev = (row as any).current_session_id as string | null;
                    const { error: updErr } = await updateUsersRow({ current_session_id: sessionId, session_updated_at: nowIso });
                    if (updErr) { res.statusCode = 500; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ error: updErr.message })); return; }
                    try {
                      await supabase.from('session_audit').insert({ user_id: userId, action: 'force_claim', previous_session_id: prev, new_session_id: sessionId, user_agent: String(body.userAgent||''), created_at: nowIso });
                    } catch {}
                    res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ ok: true, previous: prev || null })); return;
                  }
                  if (missingCol) {
                    const keySess = `SESSION_USER_${userId}`;
                    const { data: gsRow } = await getGS(keySess);
                    const prev = (gsRow as any)?.value as string | undefined;
                    await setGS(keySess, sessionId);
                    try { await supabase.from('session_audit').insert({ user_id: userId, action: 'force_claim', previous_session_id: prev, new_session_id: sessionId, user_agent: String(body.userAgent||''), created_at: nowIso }); } catch {}
                    res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ ok: true, previous: prev || null })); return;
                  }
                  res.statusCode = 500; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ error: error?.message || 'Unexpected error' })); return;
                }

                if (action === 'touch') {
                  const { data: row, error } = await readUsersRow();
                  const missingCol = error && /column "current_session_id"|Could not find the table/i.test(error.message || '');
                  if (!error && row) {
                    const cur = (row as any).current_session_id as string | null;
                    if (cur === sessionId) {
                      const { error: updErr } = await updateUsersRow({ session_updated_at: nowIso });
                      if (updErr) { res.statusCode = 500; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ error: updErr.message })); return; }
                    }
                    res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ ok: true })); return;
                  }
                  if (missingCol) {
                    const keySessTime = `SESSION_TIME_${userId}`;
                    await setGS(keySessTime, nowIso);
                    res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ ok: true })); return;
                  }
                  res.statusCode = 500; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ error: error?.message || 'Unexpected error' })); return;
                }

                if (action === 'release') {
                  const { data: row, error } = await readUsersRow();
                  const missingCol = error && /column "current_session_id"|Could not find the table/i.test(error.message || '');
                  const maxSessions = (!error && row && (row as any).max_sessions != null) ? Math.max(Number((row as any).max_sessions) || 1, 1) : 1;
                  if (maxSessions <= 1) {
                    if (!error && row) {
                      const cur = (row as any).current_session_id as string | null;
                      if (cur === sessionId) {
                        await updateUsersRow({ current_session_id: null, session_updated_at: nowIso });
                      }
                      res.setHeader('Set-Cookie', `vidgo_sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({ ok: true }));
                      return;
                    }
                    if (missingCol) {
                      const keySess = `SESSION_USER_${userId}`;
                      await setGS(keySess, null);
                      res.setHeader('Set-Cookie', `vidgo_sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({ ok: true }));
                      return;
                    }
                  } else {
                    const keySessList = `SESSION_LIST_${userId}`;
                    const { data: gsRow } = await getGS(keySessList);
                    let arr: string[] = [];
                    try { arr = JSON.parse(((gsRow as any)?.value || '[]')); } catch { arr = []; }
                    const next = arr.filter(x => x !== sessionId);
                    const { error: setErr } = await setGS(keySessList, JSON.stringify(next));
                    if (setErr) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: setErr.message })); return; }
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ ok: true }));
                    return;
                  }
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: error?.message || 'Unexpected error' }));
                  return;
                }

                if (action === 'status') {
                  const { data: row, error } = await readUsersRow();
                  const missingCol = error && /column "current_session_id"|Could not find the table/i.test(error.message || '');
                  const maxSessions = (!error && row && (row as any).max_sessions != null) ? Math.max(Number((row as any).max_sessions) || 1, 1) : 1;
                  if (maxSessions <= 1) {
                    if (!error && row) {
                      const cur = (row as any).current_session_id as string | null;
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({ ok: true, currentSessionId: cur }));
                      return;
                    }
                    if (missingCol) {
                      const keySess = `SESSION_USER_${userId}`;
                      const { data: gsRow } = await getGS(keySess);
                      const cur = (gsRow as any)?.value as string | undefined;
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({ ok: true, currentSessionId: cur || null }));
                      return;
                    }
                  } else {
                    const keySessList = `SESSION_LIST_${userId}`;
                    const { data: gsRow } = await getGS(keySessList);
                    let arr: string[] = [];
                    try { arr = JSON.parse(((gsRow as any)?.value || '[]')); } catch { arr = []; }
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ ok: true, sessionIds: arr }));
                    return;
                  }
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: error?.message || 'Unexpected error' }));
                  return;
                }

                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Invalid action' }));
              } catch (e: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: e?.message || 'Unexpected error' }));
              }
            });
          }
        }
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        },
        dedupe: ['react', 'react-dom']
      }
    };
});
