import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL as string | undefined;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'Supabase environment variables missing.' });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const method = (req.method || 'GET').toUpperCase();
    if (method === 'GET') {
      const key = (req.query.key as string) || 'VEO_BEARER_TOKEN';
      const { data, error } = await supabase
        .from('global_settings')
        .select('key,value')
        .eq('key', key)
        .single();
      if (error) {
        const missing = (error.message || '').includes("Could not find the table 'public.global_settings'");
        if (missing) return res.json({ key, value: null, warning: 'global_settings table missing' });
        return res.status(500).json({ error: error.message });
      }
      return res.json({ key: data?.key || key, value: data?.value || null });
    }

    if (method === 'POST' || method === 'PUT') {
      const key = (req.body?.key as string) || 'VEO_BEARER_TOKEN';
      const value = String(req.body?.value || '').trim();
      if (!value) return res.status(400).json({ error: 'value required' });
      const row = { key, value, updated_at: new Date().toISOString() } as any;
      const { error } = await supabase
        .from('global_settings')
        .upsert(row, { onConflict: 'key' });
      if (error) {
        const missing = (error.message || '').includes("Could not find the table 'public.global_settings'");
        if (missing) return res.json({ ok: true, warning: 'global_settings table missing; value not persisted' });
        return res.status(500).json({ error: error.message });
      }
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Unexpected error' });
  }
}

