import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  throw new Error(
    "SUPABASE_URL, SUPABASE_ANON_KEY, dan SUPABASE_SERVICE_KEY harus diatur di environment variables",
  );
}

// Klien publik untuk operasi yang melibatkan nasabah (menggunakan anon key)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Klien admin untuk operasi server-side (mengabaikan RLS)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
