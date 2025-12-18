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

    if (req.method === 'GET') {
      const period = (String(req.query.period || 'today')) as 'today' | '7days' | '30days' | 'all';
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
          return res.json({ total: 0, byUser: [], warning: 'generation_logs table missing' });
        }
        return res.status(500).json({ error: error.message });
      }

      const counts: Record<string, number> = {};
      for (const row of (data || [])) {
        const email = (row as any).user_email || 'unknown';
        counts[email] = (counts[email] || 0) + 1;
      }
      const byUser = Object.entries(counts)
        .map(([email, count]) => ({ email, count }))
        .sort((a, b) => b.count - a.count);

      return res.json({ total: (data || []).length, byUser });
    }

    if (req.method === 'POST') {
      const { userId, userEmail, timestamp } = req.body || {};
      if (!userId || !userEmail) return res.status(400).json({ error: 'userId and userEmail required' });
      const ts = timestamp || new Date().toISOString();
      const { error } = await supabase
        .from('generation_logs')
        .insert({ user_id: userId, user_email: userEmail, timestamp: ts });
      if (error) {
        const missing = (error.message || '').includes("Could not find the table 'public.generation_logs'");
        if (missing) {
          return res.json({ ok: true, warning: 'generation_logs table missing; event not persisted' });
        }
        return res.status(500).json({ error: error.message });
      }
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Unexpected error' });
  }
}
