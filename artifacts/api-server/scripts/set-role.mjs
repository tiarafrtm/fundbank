/**
 * Set role staf di Supabase Auth + profiles
 * Usage: node scripts/set-role.mjs <email> <role>
 * Role valid: cs | teller
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const EMAIL = process.argv[2];
const ROLE  = process.argv[3];

if (!EMAIL || !ROLE) {
  console.error('Usage: node scripts/set-role.mjs <email> <role>');
  console.error('Role: cs | teller');
  process.exit(1);
}

if (!['cs', 'teller'].includes(ROLE)) {
  console.error('Role tidak valid. Gunakan: cs atau teller');
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL atau SUPABASE_SERVICE_KEY env vars');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Cari user di auth
const { data: { users }, error: listErr } = await admin.auth.admin.listUsers();
if (listErr) { console.error('Gagal ambil daftar user:', listErr.message); process.exit(1); }

const user = users.find(u => u.email === EMAIL);
if (!user) { console.error(`User ${EMAIL} tidak ditemukan di Supabase Auth`); process.exit(1); }

// Update auth metadata
const { error: authErr } = await admin.auth.admin.updateUserById(user.id, {
  app_metadata:  { ...user.app_metadata,  role: ROLE },
  user_metadata: { ...user.user_metadata, role: ROLE },
});
if (authErr) { console.error('Gagal update auth metadata:', authErr.message); process.exit(1); }

// Update tabel profiles
const { error: profileErr } = await admin
  .from('profiles')
  .upsert({ id: user.id, nama: user.user_metadata?.nama ?? EMAIL, role: ROLE }, { onConflict: 'id' });

if (profileErr) { console.error('Gagal update profiles:', profileErr.message); process.exit(1); }

console.log(`✅ Role "${ROLE}" berhasil di-set untuk ${EMAIL}`);
console.log(`   User ID: ${user.id}`);
