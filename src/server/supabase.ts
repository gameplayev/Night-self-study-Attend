import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabase: SupabaseClient | null = null;

function configurationError(message: string) {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = 500;
  return error;
}

function decodeJwtPayload(token: string) {
  const payload = token.split('.')[1];
  if (!payload) return null;

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(json) as { role?: unknown };
  } catch {
    return null;
  }
}

function assertServiceRoleKey(key: string) {
  const payload = decodeJwtPayload(key);
  if (payload && payload.role !== 'service_role') {
    throw configurationError(
      'SUPABASE_SERVICE_ROLE_KEY에는 anon/public key가 아니라 service_role key를 넣어야 합니다. Supabase Dashboard > Project Settings > API에서 service_role secret key를 복사해 주세요.',
    );
  }
}

export function getSupabase() {
  if (supabase) return supabase;

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw configurationError(
      'Supabase 환경 변수가 없습니다. SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY를 설정해 주세요.',
    );
  }

  assertServiceRoleKey(serviceRoleKey);

  supabase = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabase;
}
