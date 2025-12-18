import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL as string | undefined;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined;
const RESET_TZ = process.env.RESET_TZ || 'Asia/Jakarta';

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
  };
}

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

    const { action, userId } = (req.body || {}) as { action?: string; userId?: string };
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const ensureUserRow = async (): Promise<any | null> => {
      const { data: existing, error: selectErr } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      if (!selectErr && existing) return existing;
      if (selectErr && (selectErr.message || '').includes("Could not find the table 'public.users'")) {
        return null; // table missing — caller should handle
      }

      const { data: authUser, error: authErr } = await supabase.auth.admin.getUserById(userId);
      if (authErr || !authUser?.user) return null;
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
      if (upsertErr) return null;
      return upserted;
    };

    if (action === 'ensure') {
      const ensured = await ensureUserRow();
      if (!ensured) return res.status(500).json({ error: 'Failed to ensure user metadata row' });
      return res.json({ ok: true, user: toCamel(ensured) });
    }

    if (action !== 'deduct') return res.status(400).json({ error: 'Invalid action' });

    const row = await ensureUserRow();
    if (!row) return res.status(404).json({ error: 'User not found or table missing' });
    // Cegah pengurangan kredit jika user expired
    const t = today();
    const expiry: string | null = row.expiry_date ?? null;
    if (expiry && typeof expiry === 'string' && expiry < t) {
      return res.status(400).json({ error: 'User expired' });
    }

    // Pengurangan atomik via RPC
    const { data: decRows, error: decErr } = await (supabase as any).rpc('decrement_credit', { p_user_id: userId });
    if (decErr) {
      const msg = decErr.message || '';
      const missingFn = /Could not find the function/i.test(msg);
      if (!missingFn) return res.status(500).json({ error: msg });
      // Fallback non-atomik untuk development bila fungsi belum di-apply
      const current = row.remaining_credits ?? row.daily_limit ?? 0;
      if (current <= 0) return res.status(400).json({ error: 'No credits remaining' });
      const { data: updatedRow, error: updErr } = await supabase
        .from('users')
        .update({ remaining_credits: (current - 1) })
        .eq('id', userId)
        .gt('remaining_credits', 0)
        .select('*')
        .single();
      if (updErr || !updatedRow) return res.status(500).json({ error: updErr?.message || 'Update failed' });
      // Catat event kredit
      try {
        await supabase
          .from('user_credit_events')
          .insert({ user_id: userId, amount: -1, reason: 'generation', credits_after: updatedRow.remaining_credits });
      } catch {}
      return res.json({ ok: true, user: toCamel(updatedRow) });
    }
    const updatedRow = Array.isArray(decRows) ? decRows[0] : decRows;
    if (!updatedRow) return res.status(400).json({ error: 'No credits remaining' });

    // Catat event kredit (audit trail)
    try {
      await supabase
        .from('user_credit_events')
        .insert({
          user_id: userId,
          amount: -1,
          reason: 'generation',
          credits_after: (updatedRow.remaining_credits ?? undefined),
        });
    } catch (e) {
      // Jika tabel belum ada, abaikan agar flow utama tetap berjalan
      const msg = (e as any)?.message || String(e);
      const missing = msg.includes("Could not find the table 'public.user_credit_events'");
      if (!missing) {
        console.warn('Failed to insert credit event:', msg);
      }
    }

    return res.json({ ok: true, user: toCamel(updatedRow) });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Unexpected error' });
  }
}
