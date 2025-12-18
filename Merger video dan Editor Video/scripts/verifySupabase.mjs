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

async function checkTable(supabase, table) {
  try {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      const missing = (error.message || '').includes(`Could not find the table 'public.${table}'`);
      if (missing) return { exists: false, error: null };
      return { exists: false, error: error.message };
    }
    return { exists: true, error: null, sampleCount: (data || []).length };
  } catch (e) {
    return { exists: false, error: e?.message || String(e) };
  }
}

async function main() {
  const envText = await readFile(new URL('../.env', import.meta.url), 'utf-8').catch(() => '');
  const env = parseEnv(envText);

  const SUPABASE_URL = process.env.SUPABASE_URL || env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Configure them in .env.');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  console.log('Verifying Supabase tables with service role...');

  const users = await checkTable(supabase, 'users');
  const logs = await checkTable(supabase, 'generation_logs');

  const status = {
    users: users.exists ? 'OK' : 'MISSING',
    generation_logs: logs.exists ? 'OK' : 'MISSING',
  };
  console.table(status);

  // Column checks
  let hasMaxSessions = false;
  let maxSessionsError = null;
  try {
    const { error } = await supabase.from('users').select('max_sessions').limit(1);
    if (!error) {
      hasMaxSessions = true;
    } else if ((error.message || '').includes('column "max_sessions"')) {
      hasMaxSessions = false;
    } else {
      maxSessionsError = error.message;
    }
  } catch (e) {
    maxSessionsError = e?.message || String(e);
  }

  console.table({ users_max_sessions_col: hasMaxSessions ? 'OK' : 'MISSING' });
  

  if (!users.exists || !logs.exists) {
    console.log('\nTables missing. Please run SQL in scripts/supabase_schema.sql using Supabase SQL Editor.');
  }

  if (users.error || logs.error) {
    console.log('\nDetailed errors:');
    if (users.error) console.log('users:', users.error);
    if (logs.error) console.log('generation_logs:', logs.error);
    if (maxSessionsError) console.log('users.max_sessions:', maxSessionsError);
  }
}

main();
