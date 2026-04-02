import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const EMAIL = process.argv[2];

if (!EMAIL) {
  console.error('Usage: node scripts/set-teller-role.mjs <email>');
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: { users }, error: listErr } = await admin.auth.admin.listUsers();
if (listErr) { console.error('Gagal ambil daftar user:', listErr.message); process.exit(1); }

const user = users.find(u => u.email === EMAIL);
if (!user) { console.error(`User ${EMAIL} tidak ditemukan`); process.exit(1); }

const { error } = await admin.auth.admin.updateUserById(user.id, {
  app_metadata: { ...user.app_metadata, role: 'teller' },
});

if (error) {
  console.error('Gagal update role:', error.message);
  process.exit(1);
}

console.log(`✅ Role "teller" berhasil di-set untuk ${EMAIL}`);
