-- ============================================================
-- SKEMA DATABASE SUPABASE - SISTEM ANTRIAN BANK
-- Jalankan SQL ini di Supabase SQL Editor (supabase.com)
-- Dashboard → SQL Editor → New Query → Paste & Run
-- ============================================================

-- ============================================================
-- 1. Tabel PROFILES
-- Menyimpan data profil nasabah dan teller
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nama        TEXT NOT NULL,
    no_hp       TEXT,
    role        TEXT NOT NULL DEFAULT 'nasabah' CHECK (role IN ('nasabah', 'teller')),
    onesignal_player_id TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Aktifkan Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policy: User hanya bisa melihat profil sendiri
CREATE POLICY "User bisa lihat profil sendiri"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

-- Policy: User bisa update profil sendiri
CREATE POLICY "User bisa update profil sendiri"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- Policy: Service role bisa akses semua (untuk server-side operations)
CREATE POLICY "Service role akses penuh"
    ON public.profiles FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================================
-- 2. Tabel ANTRIAN
-- Menyimpan data antrian nasabah
-- ============================================================
CREATE TABLE IF NOT EXISTS public.antrian (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    nomor_antrian   INTEGER NOT NULL,
    layanan         TEXT NOT NULL CHECK (layanan IN ('Tabungan', 'Kredit', 'Umum')),
    status          TEXT NOT NULL DEFAULT 'menunggu'
                        CHECK (status IN ('menunggu', 'dipanggil', 'selesai', 'batal')),
    notif_sent      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    called_at       TIMESTAMPTZ
);

-- Index untuk mempercepat query antrian per hari dan layanan
CREATE INDEX IF NOT EXISTS idx_antrian_status ON public.antrian (status);
CREATE INDEX IF NOT EXISTS idx_antrian_user_id ON public.antrian (user_id);
CREATE INDEX IF NOT EXISTS idx_antrian_layanan ON public.antrian (layanan);
CREATE INDEX IF NOT EXISTS idx_antrian_created_at ON public.antrian (created_at);

-- Aktifkan Row Level Security
ALTER TABLE public.antrian ENABLE ROW LEVEL SECURITY;

-- Policy: User bisa melihat antrian sendiri
CREATE POLICY "User bisa lihat antrian sendiri"
    ON public.antrian FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: User bisa insert antrian baru
CREATE POLICY "User bisa tambah antrian"
    ON public.antrian FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policy: Service role bisa akses semua (untuk teller via server)
CREATE POLICY "Service role akses penuh antrian"
    ON public.antrian FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================================
-- 3. BUAT AKUN TELLER (opsional, bisa juga via Supabase Auth)
-- Jalankan bagian ini SECARA TERPISAH setelah tabel dibuat
-- ============================================================

-- Cara membuat akun teller:
-- 1. Daftar via API: POST /api/auth/register dengan role default 'nasabah'
-- 2. Kemudian UPDATE manual di sini:

-- UPDATE public.profiles
-- SET role = 'teller'
-- WHERE id = 'UUID_USER_DISINI';

-- ============================================================
-- VERIFIKASI: Cek tabel sudah terbuat
-- ============================================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('profiles', 'antrian');
