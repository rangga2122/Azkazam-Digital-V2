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
    const [email, password] = process.argv.slice(2);
    if (!email || !password) {
      console.error('Usage: node scripts/testLogin.mjs <email> <password>');
      process.exit(1);
    }

    const envText = await readFile(new URL('../.env', import.meta.url), 'utf-8').catch(() => '');
    const env = parseEnv(envText);

    const VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
    const VITE_SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;

    if (!VITE_SUPABASE_URL || !VITE_SUPABASE_ANON_KEY) {
      console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Check your .env settings.');
      process.exit(1);
    }

    const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error('Login failed:', error.message);
      process.exit(1);
    }
    console.log('Login success:', { userId: data.user.id, email: data.user.email });
    process.exit(0);
  } catch (e) {
    console.error('Unexpected error:', e?.message || e);
    process.exit(1);
  }
}

main();

