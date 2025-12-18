import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL as string | undefined;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'Supabase environment variables missing.' });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  try {
    const cookieHeader = String(req.headers.cookie || '');
    const cookies: Record<string,string> = {};
    cookieHeader.split(';').map(s => s.trim()).filter(Boolean).forEach(part => {
      const eq = part.indexOf('=');
      if (eq > 0) cookies[part.substring(0, eq)] = decodeURIComponent(part.substring(eq + 1));
    });
    const action = String((req.body as any)?.action || '');
    const userId = String((req.body as any)?.userId || '');
    const sessionId = String((req.body as any)?.sessionId || '');
    if (!userId || !sessionId) {
      res.status(400).json({ error: 'userId and sessionId required' });
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
            res.json({ ok: false, reason: 'occupied', message: 'Silahkan logout dulu di akun sebelumnya' });
            return;
          }
          const { error: updErr } = await updateUsersRow({ current_session_id: sessionId, session_updated_at: nowIso });
          if (updErr) {
            res.status(500).json({ error: updErr.message });
            return;
          }
          res.setHeader('Set-Cookie', `vidgo_sid=${encodeURIComponent(sessionId)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=1800`);
          res.json({ ok: true });
          return;
        }
        if (missingCol) {
          const keySess = `SESSION_USER_${userId}`;
          const { data: gsRow } = await getGS(keySess);
          const cur = (gsRow as any)?.value as string | undefined;
          if (cur && cur !== sessionId) {
            res.json({ ok: false, reason: 'occupied', message: 'Silahkan logout dulu di akun sebelumnya' });
            return;
          }
          const { error: setErr } = await setGS(keySess, sessionId);
          if (setErr) {
            res.status(500).json({ error: setErr.message });
            return;
          }
          res.setHeader('Set-Cookie', `vidgo_sid=${encodeURIComponent(sessionId)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=1800`);
          res.json({ ok: true });
          return;
        }
        res.status(500).json({ error: error?.message || 'Unexpected error' });
        return;
      } else {
        const keySessList = `SESSION_LIST_${userId}`;
        const { data: gsRow } = await getGS(keySessList);
        let arr: string[] = [];
        try { arr = JSON.parse(((gsRow as any)?.value || '[]')); } catch { arr = []; }
        if (!arr.includes(sessionId) && arr.length >= maxSessions) {
          res.json({ ok: false, reason: 'occupied', message: 'Silahkan logout dulu di akun sebelumnya' });
          return;
        }
        if (!arr.includes(sessionId)) arr.push(sessionId);
        const { error: setErr } = await setGS(keySessList, JSON.stringify(arr));
        if (setErr) { res.status(500).json({ error: setErr.message }); return; }
        res.json({ ok: true });
        return;
      }
    }

    if (action === 'force_claim') {
      const { data: row, error } = await readUsersRow();
      const missingCol = error && /column "current_session_id"|Could not find the table/i.test(error.message || '');
      if (!error && row) {
        const prev = (row as any).current_session_id as string | null;
        const { error: updErr } = await updateUsersRow({ current_session_id: sessionId, session_updated_at: nowIso });
        if (updErr) { res.status(500).json({ error: updErr.message }); return; }
        try { await supabase.from('session_audit').insert({ user_id: userId, action: 'force_claim', previous_session_id: prev, new_session_id: sessionId, created_at: nowIso }); } catch {}
        res.json({ ok: true, previous: prev || null }); return;
      }
      if (missingCol) {
        const keySess = `SESSION_USER_${userId}`;
        const { data: gsRow } = await getGS(keySess);
        const prev = (gsRow as any)?.value as string | undefined;
        const { error: setErr } = await setGS(keySess, sessionId);
        if (setErr) { res.status(500).json({ error: setErr.message }); return; }
        try { await supabase.from('session_audit').insert({ user_id: userId, action: 'force_claim', previous_session_id: prev, new_session_id: sessionId, created_at: nowIso }); } catch {}
        res.json({ ok: true, previous: prev || null }); return;
      }
      res.status(500).json({ error: error?.message || 'Unexpected error' }); return;
    }

    if (action === 'touch') {
      const { data: row, error } = await readUsersRow();
      const missingCol = error && /column "current_session_id"|Could not find the table/i.test(error.message || '');
      if (!error && row) {
        const cur = (row as any).current_session_id as string | null;
        if (cur === sessionId) {
          const { error: updErr } = await updateUsersRow({ session_updated_at: nowIso });
          if (updErr) { res.status(500).json({ error: updErr.message }); return; }
        }
        res.json({ ok: true }); return;
      }
      if (missingCol) {
        const keySessTime = `SESSION_TIME_${userId}`;
        const { error: setErr } = await setGS(keySessTime, nowIso);
        if (setErr) { res.status(500).json({ error: setErr.message }); return; }
        res.json({ ok: true }); return;
      }
      res.status(500).json({ error: error?.message || 'Unexpected error' }); return;
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
          res.setHeader('Set-Cookie', `vidgo_sid=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
          res.json({ ok: true });
          return;
        }
        if (missingCol) {
          const keySess = `SESSION_USER_${userId}`;
          await setGS(keySess, null);
          res.setHeader('Set-Cookie', `vidgo_sid=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
          res.json({ ok: true });
          return;
        }
        res.status(500).json({ error: error?.message || 'Unexpected error' });
        return;
      } else {
        const keySessList = `SESSION_LIST_${userId}`;
        const { data: gsRow } = await getGS(keySessList);
        let arr: string[] = [];
        try { arr = JSON.parse(((gsRow as any)?.value || '[]')); } catch { arr = []; }
        const next = arr.filter(x => x !== sessionId);
        const { error: setErr } = await setGS(keySessList, JSON.stringify(next));
        if (setErr) { res.status(500).json({ error: setErr.message }); return; }
        res.json({ ok: true });
        return;
      }
    }

    if (action === 'status') {
      const { data: row, error } = await readUsersRow();
      const missingCol = error && /column "current_session_id"|Could not find the table/i.test(error.message || '');
      const maxSessions = (!error && row && (row as any).max_sessions != null) ? Math.max(Number((row as any).max_sessions) || 1, 1) : 1;
      if (maxSessions <= 1) {
        if (!error && row) {
          const cur = (row as any).current_session_id as string | null;
          res.json({ ok: true, currentSessionId: cur });
          return;
        }
        if (missingCol) {
          const keySess = `SESSION_USER_${userId}`;
          const { data: gsRow } = await getGS(keySess);
          const cur = (gsRow as any)?.value as string | undefined;
          res.json({ ok: true, currentSessionId: cur || null });
          return;
        }
        res.status(500).json({ error: error?.message || 'Unexpected error' });
        return;
      } else {
        const keySessList = `SESSION_LIST_${userId}`;
        const { data: gsRow } = await getGS(keySessList);
        let arr: string[] = [];
        try { arr = JSON.parse(((gsRow as any)?.value || '[]')); } catch { arr = []; }
        res.json({ ok: true, sessionIds: arr });
        return;
      }
    }

    res.status(400).json({ error: 'Invalid action' });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Unexpected error' });
  }
}
