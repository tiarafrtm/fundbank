-- ============================================================
-- SKEMA LENGKAP - SISTEM ANTRIAN BANK
-- Jalankan di: Supabase Dashboard → SQL Editor → New Query → Run
-- Aman dijalankan berulang (idempotent).
-- ============================================================

-- ============================================================
-- TABEL: profiles
-- Menyimpan profil staf (teller/cs) dan nasabah mobile
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id                  UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nama                TEXT        NOT NULL,
    no_hp               TEXT,
    role                TEXT        NOT NULL DEFAULT 'cs',
    onesignal_player_id TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Constraint role: cs | teller | nasabah
ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('nasabah', 'cs', 'teller'));

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'profiles'
          AND policyname = 'Service role akses penuh'
    ) THEN
        EXECUTE 'CREATE POLICY "Service role akses penuh"
            ON public.profiles FOR ALL
            USING (auth.role() = ''service_role'')';
    END IF;
END $$;

-- ============================================================
-- TABEL: antrian
-- Menyimpan nomor antrian nasabah
-- ============================================================
CREATE TABLE IF NOT EXISTS public.antrian (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    nama_nasabah    TEXT,
    no_hp_nasabah   TEXT,
    nomor_antrian   INTEGER     NOT NULL,
    layanan         TEXT        NOT NULL,
    status          TEXT        NOT NULL DEFAULT 'menunggu',
    notif_sent      BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    called_at       TIMESTAMPTZ
);

-- Kolom opsional (aman jika sudah ada)
ALTER TABLE public.antrian ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.antrian ADD COLUMN IF NOT EXISTS nama_nasabah   TEXT;
ALTER TABLE public.antrian ADD COLUMN IF NOT EXISTS no_hp_nasabah  TEXT;
ALTER TABLE public.antrian ADD COLUMN IF NOT EXISTS called_at      TIMESTAMPTZ;

-- *** PERBAIKAN CONSTRAINT LAYANAN ***
-- Menambahkan Teller dan CS ke daftar yang diizinkan
ALTER TABLE public.antrian
    DROP CONSTRAINT IF EXISTS antrian_layanan_check;
ALTER TABLE public.antrian
    ADD CONSTRAINT antrian_layanan_check
    CHECK (layanan IN ('Teller', 'CS', 'Tabungan', 'Kredit', 'Umum'));

-- Constraint status
ALTER TABLE public.antrian
    DROP CONSTRAINT IF EXISTS antrian_status_check;
ALTER TABLE public.antrian
    ADD CONSTRAINT antrian_status_check
    CHECK (status IN ('menunggu', 'dipanggil', 'selesai', 'batal'));

-- Index untuk mempercepat query
CREATE INDEX IF NOT EXISTS idx_antrian_status     ON public.antrian (status);
CREATE INDEX IF NOT EXISTS idx_antrian_user_id    ON public.antrian (user_id);
CREATE INDEX IF NOT EXISTS idx_antrian_layanan    ON public.antrian (layanan);
CREATE INDEX IF NOT EXISTS idx_antrian_created_at ON public.antrian (created_at);

ALTER TABLE public.antrian ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'antrian'
          AND policyname = 'Service role akses penuh antrian'
    ) THEN
        EXECUTE 'CREATE POLICY "Service role akses penuh antrian"
            ON public.antrian FOR ALL
            USING (auth.role() = ''service_role'')';
    END IF;
END $$;

-- ============================================================
-- VERIFIKASI
-- ============================================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('profiles', 'antrian');
