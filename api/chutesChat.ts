import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL as string | undefined;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'Supabase environment variables missing.' });
    }
    const method = (req.method || 'POST').toUpperCase();
    if (method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase
      .from('global_settings')
      .select('value')
      .eq('key', 'CHUTES_API_TOKEN')
      .single();
    if (error) {
      const missing = (error.message || '').includes("Could not find the table 'public.global_settings'");
      if (missing) return res.status(500).json({ error: 'global_settings table missing; cannot read token' });
      return res.status(500).json({ error: error.message });
    }

    const token = (data?.value || '').trim();
    if (!token) {
      return res.status(500).json({ error: 'CHUTES_API_TOKEN not configured' });
    }

    const payload = req.body || {};
    const upstream = await fetch('https://llm.chutes.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream,application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!upstream.body) {
      const text = await upstream.text();
      res.status(upstream.status);
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
      return res.send(text);
    }

    res.status(upstream.status);
    res.setHeader('Content-Type', 'text/event-stream');
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Unexpected error' });
  }
}
