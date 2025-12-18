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
  console.log('Verifying Supabase schema (tables, columns, RPC)...');

  const users = await checkTable(supabase, 'users');
  const logs = await checkTable(supabase, 'generation_logs');
  const creditEvents = await checkTable(supabase, 'user_credit_events');
  const globalSettings = await checkTable(supabase, 'global_settings');

  // Check allowed_features column presence by selecting it
  let hasAllowedFeatures = false;
  let allowedFeaturesError = null;
  try {
    const { error } = await supabase.from('users').select('allowed_features').limit(1);
    if (!error) {
      hasAllowedFeatures = true;
    } else if ((error.message || '').includes('column "allowed_features"')) {
      hasAllowedFeatures = false;
    } else {
      allowedFeaturesError = error.message;
    }
  } catch (e) {
    allowedFeaturesError = e?.message || String(e);
  }

  // Check max_sessions column presence
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

  // Check RPC function existence by calling it with a dummy UUID
  let hasDecrementCredit = false;
  let decrementCreditError = null;
  try {
    const dummyUuid = '00000000-0000-0000-0000-000000000000';
    const { data, error } = await supabase.rpc('decrement_credit', { p_user_id: dummyUuid });
    if (!error) {
      hasDecrementCredit = true; // function exists; update likely no-op
    } else if ((error.message || '').includes("Could not find the function 'public.decrement_credit'")) {
      hasDecrementCredit = false;
    } else {
      // Other errors (e.g., permission) still indicate function exists
      hasDecrementCredit = true;
      decrementCreditError = error.message;
    }
  } catch (e) {
    decrementCreditError = e?.message || String(e);
  }

  const status = {
    users: users.exists ? 'OK' : 'MISSING',
    generation_logs: logs.exists ? 'OK' : 'MISSING',
    user_credit_events: creditEvents.exists ? 'OK' : 'MISSING',
    global_settings: globalSettings.exists ? 'OK' : 'MISSING',
    users_allowed_features_col: hasAllowedFeatures ? 'OK' : 'MISSING',
    users_max_sessions_col: hasMaxSessions ? 'OK' : 'MISSING',
    rpc_decrement_credit: hasDecrementCredit ? 'OK' : 'MISSING',
  };
  console.table(status);

  const anyMissing = Object.values(status).includes('MISSING');
  if (anyMissing) {
    console.log('\nItems missing. Please ensure migrations in supabase/migrations have been pushed.');
  }

  const errors = { users: users.error, generation_logs: logs.error, user_credit_events: creditEvents.error, global_settings: globalSettings.error };
  if (Object.values(errors).some(Boolean) || allowedFeaturesError || decrementCreditError) {
    console.log('\nDetailed errors:');
    if (errors.users) console.log('users:', errors.users);
    if (errors.generation_logs) console.log('generation_logs:', errors.generation_logs);
    if (errors.user_credit_events) console.log('user_credit_events:', errors.user_credit_events);
    if (errors.global_settings) console.log('global_settings:', errors.global_settings);
    if (allowedFeaturesError) console.log('users.allowed_features:', allowedFeaturesError);
    if (maxSessionsError) console.log('users.max_sessions:', maxSessionsError);
    if (decrementCreditError) console.log('rpc.decrement_credit:', decrementCreditError);
  }
}

main();
