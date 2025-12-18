import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL as string | undefined;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined;
const RESET_TZ = process.env.RESET_TZ || 'Asia/Jakarta';
const CRON_SECRET = process.env.CRON_SECRET || '';

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

function isAuthorized(req: VercelRequest): boolean {
  const cronHeader = (req.headers['x-vercel-cron'] || req.headers['X-Vercel-Cron']) as string | undefined;
  if (cronHeader) return true;
  const auth = (req.headers['authorization'] || req.headers['Authorization']) as string | undefined;
  if (CRON_SECRET && auth && auth.startsWith('Bearer ') && auth.substring('Bearer '.length) === CRON_SECRET) return true;
  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'Supabase environment variables missing.' });
    return;
  }
  if (!isAuthorized(req)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const supabase = createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string);
  const t = today();

  try {
    const { data: candidates, error: selErr } = await supabase
      .from('users')
      .select('id,daily_limit,last_reset_date,expiry_date')
      .or(`last_reset_date.is.null,last_reset_date.neq.${t}`);
    if (selErr) {
      // If table missing, treat as no-op
      if ((selErr.message || '').includes("Could not find the table 'public.users'")) {
        res.status(200).json({ ok: true, processed: 0, warning: 'users table missing; no rows reset' });
        return;
      }
      res.status(500).json({ error: selErr.message });
      return;
    }

    const rows = candidates || [];
    let processed = 0;
    for (const row of rows) {
      const limit = (row as any).daily_limit ?? 5;
      const id = (row as any).id as string;
      const expiry: string | null = (row as any).expiry_date ?? null;
      if (expiry && typeof expiry === 'string' && expiry < t) {
        // Skip expired users: tidak di-reset
        continue;
      }
      const { error: updErr } = await supabase
        .from('users')
        .update({ remaining_credits: limit, last_reset_date: t })
        .eq('id', id)
        .or(`last_reset_date.is.null,last_reset_date.neq.${t}`);
      if (!updErr) {
        processed += 1;
        try {
          await supabase
            .from('user_credit_events')
            .insert({ user_id: id, amount: 0, reason: 'daily_reset', credits_after: limit });
        } catch (evErr: any) {
          const msg = evErr?.message || String(evErr);
          const missing = msg.includes("Could not find the table 'public.user_credit_events'");
          if (!missing) console.warn('[resetDailyCredits] insert event failed:', msg);
        }
      } else {
        console.warn('[resetDailyCredits] update failed for', id, updErr.message);
      }
    }

    res.status(200).json({ ok: true, processed, today: t });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Unexpected error' });
  }
}
