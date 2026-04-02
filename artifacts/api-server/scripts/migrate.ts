import { supabaseAdmin } from "../src/config/supabase";

async function migrate() {
  console.log("🔄 Menjalankan migrasi database...");

  // 1. Tambah kolom nik ke tabel profiles
  const { error: e1 } = await supabaseAdmin.rpc("exec_sql" as any, {
    sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nik VARCHAR(16) UNIQUE;`,
  });
  if (e1) {
    console.log("Coba cara lain untuk tambah nik...");
    // Coba insert profil dengan nik untuk test apakah kolom sudah ada
    const { error: testErr } = await supabaseAdmin
      .from("profiles")
      .select("nik")
      .limit(1);
    if (testErr?.message?.includes("nik")) {
      console.error("Kolom nik belum ada dan gagal ditambahkan:", e1);
    } else {
      console.log("✅ Kolom nik sudah ada di tabel profiles");
    }
  } else {
    console.log("✅ Kolom nik berhasil ditambahkan/sudah ada");
  }

  // 2. Test apakah kolom ada dengan select
  const { data, error: e2 } = await supabaseAdmin
    .from("profiles")
    .select("id, nama, nik, role")
    .limit(1);

  if (e2) {
    console.error("Error select profiles:", e2.message);
  } else {
    console.log("✅ Tabel profiles OK. Contoh data:", JSON.stringify(data?.[0] ?? {}));
  }

  // 3. Check antrian table structure
  const { data: antrianData, error: e3 } = await supabaseAdmin
    .from("antrian")
    .select("id, layanan, status")
    .limit(1);

  if (e3) {
    console.error("Error select antrian:", e3.message);
  } else {
    console.log("✅ Tabel antrian OK. Contoh data:", JSON.stringify(antrianData?.[0] ?? {}));
  }

  console.log("✅ Migrasi selesai!");
}

migrate().catch(console.error);
