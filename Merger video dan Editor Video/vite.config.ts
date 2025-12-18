import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { Readable } from 'node:stream';
import { createClient } from '@supabase/supabase-js';

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
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({ ok: true }));
                      return;
                    }
                    if (missingCol) {
                      const keySess = `SESSION_USER_${userId}`;
                      await setGS(keySess, null);
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
        }
      }
    };
});
