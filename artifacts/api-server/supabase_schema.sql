-- ============================================================
-- SKEMA DATABASE SUPABASE - SISTEM ANTRIAN BANK
-- Jalankan SQL ini di Supabase SQL Editor (supabase.com)
-- Dashboard → SQL Editor → New Query → Paste & Run
-- ============================================================

-- ============================================================
-- 1. Tabel PROFILES
-- Menyimpan data profil staf (cs/teller)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nama        TEXT NOT NULL,
    no_hp       TEXT,
    role        TEXT NOT NULL DEFAULT 'cs' CHECK (role IN ('cs', 'teller')),
    onesignal_player_id TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Aktifkan Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policy: User hanya bisa melihat profil sendiri
CREATE POLICY IF NOT EXISTS "User bisa lihat profil sendiri"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

-- Policy: User bisa update profil sendiri
CREATE POLICY IF NOT EXISTS "User bisa update profil sendiri"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- Policy: Service role bisa akses semua
CREATE POLICY IF NOT EXISTS "Service role akses penuh"
    ON public.profiles FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================================
-- 2. Tabel ANTRIAN
-- Menyimpan data antrian nasabah (dibuat oleh CS atau nasabah)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.antrian (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    nama_nasabah    TEXT,
    no_hp_nasabah   TEXT,
    nomor_antrian   INTEGER NOT NULL,
    layanan         TEXT NOT NULL CHECK (layanan IN ('Teller', 'CS', 'Tabungan', 'Kredit', 'Umum')),
    status          TEXT NOT NULL DEFAULT 'menunggu'
                        CHECK (status IN ('menunggu', 'dipanggil', 'selesai', 'batal')),
    notif_sent      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    called_at       TIMESTAMPTZ
);

-- Index untuk mempercepat query
CREATE INDEX IF NOT EXISTS idx_antrian_status ON public.antrian (status);
CREATE INDEX IF NOT EXISTS idx_antrian_user_id ON public.antrian (user_id);
CREATE INDEX IF NOT EXISTS idx_antrian_layanan ON public.antrian (layanan);
CREATE INDEX IF NOT EXISTS idx_antrian_created_at ON public.antrian (created_at);

-- Aktifkan Row Level Security
ALTER TABLE public.antrian ENABLE ROW LEVEL SECURITY;

-- Policy: Service role bisa akses semua
CREATE POLICY IF NOT EXISTS "Service role akses penuh antrian"
    ON public.antrian FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================================
-- MIGRASI (jika sudah ada tabel lama, jalankan ALTER ini)
-- ============================================================
-- ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
-- ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('cs', 'teller'));
-- ALTER TABLE public.antrian ALTER COLUMN user_id DROP NOT NULL;
-- ALTER TABLE public.antrian ADD COLUMN IF NOT EXISTS nama_nasabah TEXT;
-- ALTER TABLE public.antrian ADD COLUMN IF NOT EXISTS no_hp_nasabah TEXT;

-- ============================================================
-- VERIFIKASI: Cek tabel sudah terbuat
-- ============================================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('profiles', 'antrian');
