<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1YstI7PjkcikD3JFQ1pFjWdHU9rv-EK6U

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Supabase Sinkronisasi

- Pastikan `.env` berisi `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Verifikasi tabel wajib dengan:
  `node scripts/verifySupabase.mjs`
- Jika tabel belum ada, buka Supabase SQL Editor dan jalankan isi file:
  `scripts/supabase_schema.sql`
- Untuk pengurangan kredit atomik (anti-race), schema menyertakan fungsi RPC `decrement_credit(p_user_id uuid)`.
  - Jika menggunakan migrasi, jalankan file baru di folder `supabase/migrations`: `20251109_atomic_credit_ops.sql`.
  - Pastikan Service Role dipakai oleh endpoint `api/*` sehingga fungsi berjalan tanpa dibatasi RLS.
- Admin dapat dibuat/promosi via:
  `node scripts/createAdmin.mjs` dan `node scripts/promoteAdmin.mjs`

Dengan ini, kredit dan laporan generasi akan tersimpan di Supabase dan disinkronkan ke UI.

## Deploy ke Vercel

1. Hubungkan repo GitHub ke Vercel (New Project → pilih repo ini).
2. Tambahkan Environment Variables:
   - Frontend (public, dibundel):
     - `VITE_SUPABASE_URL` = `https://<project_ref>.supabase.co`
     - `VITE_SUPABASE_ANON_KEY` = Anon Key dari Supabase → Project Settings → API
     - `GEMINI_API_KEY` (jika dipakai untuk generator di client)
   - Serverless Functions (private, JANGAN dipakai di frontend):
     - `SUPABASE_URL` = sama dengan `VITE_SUPABASE_URL`
     - `SUPABASE_SERVICE_ROLE_KEY` = Service Role Key (Project Settings → API)
     - `RESET_TZ` = zona waktu reset harian (contoh: `Asia/Jakarta`)
     - `CRON_SECRET` = secret untuk otorisasi manual endpoint reset saat development
3. Jalankan deploy. Vercel akan mengeksekusi `npm install` → `npm run build` dan mem-publish folder `dist` beserta endpoint di `api/`.
4. Verifikasi:
   - Login admin berjalan.
   - Dashboard menampilkan users dan log.
   - Generasi video mengurangi credit secara real-time.

5. Reset Harian (Cron):
   - File `vercel.json` telah mengkonfigurasi cron:
     - `"crons": [{ "path": "/api/resetDailyCredits", "schedule": "1 17 * * *" }]`
     - Jadwal di atas berjalan pukul 17:01 UTC (setara 00:01 Asia/Jakarta). Ubah jadwal jika zona waktu berbeda.
   - Pastikan `RESET_TZ` di Vercel sesuai zona waktu yang diinginkan.
   - Uji manual di dev: panggil `GET /api/resetDailyCredits` dengan header `Authorization: Bearer <CRON_SECRET>`.

Catatan keamanan:
- `SUPABASE_SERVICE_ROLE_KEY` hanya untuk endpoint server (`api/*`) dan tidak boleh di-embed ke kode frontend.
- Variabel yang dipakai di frontend wajib berawalan `VITE_`.
