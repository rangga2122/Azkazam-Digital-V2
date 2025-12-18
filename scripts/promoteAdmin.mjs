import { createClient } from '@supabase/supabase-js';
import { readFile } from 'fs/promises';

function parseEnv(text) {
  const env = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    env[key] = value;
  }
  return env;
}

async function findAuthUserByEmail(supabase, email) {
  // Iterate pages to find user by email
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const users = data?.users || [];
    const match = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (users.length < perPage) return null; // reached end
    page += 1;
  }
}

async function main() {
  try {
    const args = process.argv.slice(2);
    const [email, role = 'admin', dailyLimitStr = '999'] = args;
    if (!email) {
      console.error('Usage: node scripts/promoteAdmin.mjs <email> [role] [dailyLimit]');
      process.exit(1);
    }
    const dailyLimit = Number(dailyLimitStr) || 999;

    const envText = await readFile(new URL('../.env', import.meta.url), 'utf-8').catch(() => '');
    const env = parseEnv(envText);

    const SUPABASE_URL = process.env.SUPABASE_URL || env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Ensure they are set in .env or environment.');
      process.exit(1);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Try update existing metadata row
    const { data: existing, error: selErr } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    if (!selErr && existing) {
      const { error: updErr } = await supabase
        .from('users')
        .update({ role, daily_limit: dailyLimit, remaining_credits: dailyLimit })
        .eq('email', email);
      if (updErr) {
        console.error('Failed to update existing user metadata:', updErr.message);
        process.exit(1);
      }
      console.log('Updated user role and limits:', { email, role, dailyLimit });
      process.exit(0);
    }

    // If no metadata row, find auth user by email and insert
    const authUser = await findAuthUserByEmail(supabase, email);
    if (!authUser) {
      console.error('Auth user not found by email. Create the auth user first via dashboard or admin API.');
      process.exit(1);
    }

    const today = new Date().toISOString().split('T')[0];
    const row = {
      id: authUser.id,
      email,
      role,
      daily_limit: dailyLimit,
      remaining_credits: dailyLimit,
      last_reset_date: today,
      expiry_date: null,
    };
    const { error: insertErr } = await supabase.from('users').insert(row);
    if (insertErr) {
      console.error('Failed to insert new metadata row:', insertErr.message);
      process.exit(1);
    }
    console.log('Inserted new metadata row with admin role:', { email, role, dailyLimit });
    process.exit(0);
  } catch (e) {
    console.error('Unexpected error:', e?.message || e);
    process.exit(1);
  }
}

main();

