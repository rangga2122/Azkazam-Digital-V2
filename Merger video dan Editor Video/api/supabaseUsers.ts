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
    maxSessions: row.max_sessions != null ? Number(row.max_sessions) : 1,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'Supabase environment variables missing.' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (req.method === 'GET') {
      const { data, error } = await supabase.from('users').select('*');
      if (error) {
        if ((error.message || '').includes("Could not find the table 'public.users'")) {
          // Tabel belum ada: kembalikan list kosong agar UI tetap jalan
          return res.json([]);
        }
        return res.status(500).json({ error: error.message });
      }
      const users = (data || []).map(toCamel);
      return res.json(users);
    }

    if (req.method === 'POST') {
      const { email, password, role = 'user', dailyLimit = 5, expiryDate, maxSessions } = req.body || {};
      if (!email || !password) return res.status(400).json({ error: 'Email/password required' });
      if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

      const normalizedLimit = Math.max(Number(dailyLimit) || 5, 1);
      const lowerEmail = String(email).toLowerCase();

      // Helper: find existing auth user by email (paginate)
      const findAuthUserByEmail = async (): Promise<string | null> => {
        let page = 1;
        const perPage = 200;
        while (true) {
          const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
          if (error) throw new Error(error.message);
          const users = data?.users || [];
          const match = users.find(u => (u.email || '').toLowerCase() === lowerEmail);
          if (match) return match.id as string;
          if (users.length < perPage) return null; // reached end
          page += 1;
        }
      };

      // Try create Supabase Auth user
      let uid: string | null = null;
      const { data: createdUser, error: createErr } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
      if (createErr) {
        // If email already exists, find that user and reset password
        const isDuplicate = /exist|already|registered/i.test(createErr.message || '');
        if (!isDuplicate) {
          return res.status(500).json({ error: createErr.message });
        }
        uid = await findAuthUserByEmail();
        if (!uid) return res.status(500).json({ error: 'Email sudah digunakan, dan user tidak ditemukan di Auth.' });
        // Optional: update password for existing user
        const { error: updErr } = await supabase.auth.admin.updateUserById(uid, { password });
        if (updErr) {
          // Continue even if password update fails; metadata will still sync
          console.warn('Password update failed for existing user:', updErr.message);
        }
      } else {
        uid = createdUser.user?.id || null;
      }
      if (!uid) return res.status(500).json({ error: 'Failed to create or locate user' });

      const row = {
        id: uid,
        email,
        role,
        daily_limit: normalizedLimit,
        remaining_credits: normalizedLimit,
        last_reset_date: today(),
        expiry_date: expiryDate || null,
        max_sessions: Math.max(Number(maxSessions ?? 1) || 1, 1),
      };

      // Upsert metadata so it syncs whether new or existing
      const { error: upsertErr } = await supabase
        .from('users')
        .upsert(row, { onConflict: 'id' });
      if (upsertErr) {
        if ((upsertErr.message || '').includes("Could not find the table 'public.users'")) {
          // Tabel belum ada: tetap sukseskan pembuatan/penemuan auth user, metadata tidak tersimpan
          return res.json({ ok: true, user: toCamel(row), warning: 'users table missing; metadata not persisted' });
        }
        return res.status(500).json({ error: upsertErr.message });
      }

      return res.json({ ok: true, user: toCamel(row) });
    }

    if (req.method === 'PUT') {
      const { uid } = req.query as { uid?: string };
      const body = req.body || {};
      const targetId = uid || body.uid;
      if (!targetId) return res.status(400).json({ error: 'uid required' });

      const patch: any = {};
      if (body.role && ['user','admin'].includes(body.role)) patch.role = body.role;
      if (body.dailyLimit != null) patch.daily_limit = Math.max(Number(body.dailyLimit) || 1, 1);
      if (body.remainingCredits != null) patch.remaining_credits = Math.max(Number(body.remainingCredits) || 0, 0);
      if (body.expiryDate !== undefined) patch.expiry_date = body.expiryDate || null;
      if (body.maxSessions !== undefined) patch.max_sessions = Math.max(Number(body.maxSessions || 1) || 1, 1);

      if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'No fields to update' });

      const { data: updated, error: updErr } = await supabase
        .from('users')
        .update(patch)
        .eq('id', targetId)
        .select('*')
        .single();
      if (updErr) {
        if ((updErr.message || '').includes("Could not find the table 'public.users'")) {
          return res.status(500).json({ error: 'users table missing' });
        }
        return res.status(500).json({ error: updErr.message });
      }
      return res.json({ ok: true, user: toCamel(updated) });
    }

    if (req.method === 'DELETE') {
      const uid = (req.query.uid as string) || req.body?.uid;
      if (!uid) return res.status(400).json({ error: 'uid required' });

      // Prevent deleting last admin — only if target is admin and table exists
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
          return res.status(500).json({ error: adminsErr.message });
        }
        if (!adminsErr && (admins || []).length <= 1) {
          return res.status(400).json({ error: 'Tidak bisa menghapus admin terakhir.' });
        }
      }

      const { error: delRowErr } = await supabase.from('users').delete().eq('id', uid);
      if (delRowErr && !((delRowErr.message || '').includes("Could not find the table 'public.users'"))) {
        return res.status(500).json({ error: delRowErr.message });
      }

      const { error: delAuthErr } = await supabase.auth.admin.deleteUser(uid);
      if (delAuthErr) return res.status(500).json({ error: delAuthErr.message });

      return res.json({ ok: true, warning: delRowErr ? 'users table missing; only auth user deleted' : undefined });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Unexpected error' });
  }
}
