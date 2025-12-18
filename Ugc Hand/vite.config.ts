import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { Readable } from 'node:stream';
import { createClient } from '@supabase/supabase-js';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');

    // Helper to read JSON body from request
    async function readJson(req: any): Promise<any> {
      return new Promise((resolve) => {
        let data = '';
        req.on('data', (chunk: any) => (data += chunk));
        req.on('end', () => {
          try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
        });
      });
    }

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
                const safeName = (filenameParam || `image-${Date.now()}.png`).replace(/[^a-zA-Z0-9._-]+/g, '_');

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
          name: 'aisandbox-proxy',
          configureServer(server) {
            const SUPABASE_URL = env.SUPABASE_URL;
            const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
            const hasEnv = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

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
