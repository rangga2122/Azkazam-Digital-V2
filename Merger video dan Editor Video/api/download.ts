import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Readable } from 'stream';
import type { ReadableStream as WebReadableStream } from 'stream/web';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const url = typeof req.query?.url === 'string' ? req.query.url : null;
    const filenameParam = typeof req.query?.filename === 'string' ? req.query.filename : null;

    if (!url) {
      res.status(400).send('Missing url parameter');
      return;
    }

    const upstream = await fetch(url);
    if (!upstream.ok) {
      res.status(upstream.status).send(`Upstream error: ${upstream.statusText}`);
      return;
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const contentLength = upstream.headers.get('content-length') || undefined;
    const safeName = (filenameParam || `veo3-video-${Date.now()}.mp4`).replace(/[^a-zA-Z0-9._-]+/g, '_');

    res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type, Content-Length');

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).send(`Proxy error: ${msg}`);
  }
}
