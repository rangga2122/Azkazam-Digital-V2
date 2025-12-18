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

async function main() {
  try {
    const args = process.argv.slice(2);
    const [email, password, role = 'admin', dailyLimitStr = '999'] = args;
    if (!email || !password) {
      console.error('Usage: node scripts/createAdmin.mjs <email> <password> [role] [dailyLimit]');
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

    const { data: createdUser, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr) {
      console.error('Failed to create auth user:', createErr.message);
      process.exit(1);
    }
    const uid = createdUser.user?.id;
    if (!uid) {
      console.error('Auth user created but id missing.');
      process.exit(1);
    }

    const today = new Date().toISOString().split('T')[0];
    const row = {
      id: uid,
      email,
      role,
      daily_limit: dailyLimit,
      remaining_credits: dailyLimit,
      last_reset_date: today,
      expiry_date: null,
    };

    const { error: insertErr } = await supabase.from('users').insert(row);
    if (insertErr) {
      console.error('Failed to insert metadata row into users table:', insertErr.message);
      process.exit(1);
    }

    console.log('Admin user created successfully:', { email, role, dailyLimit });
    process.exit(0);
  } catch (e) {
    console.error('Unexpected error:', e?.message || e);
    process.exit(1);
  }
}

main();

