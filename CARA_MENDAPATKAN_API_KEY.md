# Cara Mendapatkan API Key Gemini untuk Fitur TTS (Text-to-Speech)

## Masalah yang Terjadi

Jika Anda melihat error seperti ini:
```
API key not valid. Please pass a valid API key.
Status: INVALID_ARGUMENT
Reason: API_KEY_INVALID
```

Ini berarti API key yang digunakan tidak valid atau sudah expired.

## Solusi: Dapatkan API Key Gratis dari Google

### Langkah 1: Buka Google AI Studio

1. Kunjungi: **https://aistudio.google.com/apikey**
2. Login dengan akun Google Anda

### Langkah 2: Buat API Key Baru

1. Klik tombol **"Create API Key"** atau **"Get API Key"**
2. Pilih project Google Cloud (atau buat baru jika belum ada)
3. Copy API key yang dihasilkan (format: `AIzaSy...`)

### Langkah 3: Tambahkan ke File .env

1. Buka file `.env` di root project Anda
2. Tambahkan atau update baris berikut:

```env
# API key untuk client-side (TTS dan analisa gambar)
VITE_GEMINI_API_KEY=AIzaSy_PASTE_YOUR_KEY_HERE
```

3. **PENTING**: Ganti `AIzaSy_PASTE_YOUR_KEY_HERE` dengan API key yang Anda copy dari Google AI Studio

### Langkah 4: Restart Development Server

```bash
# Stop server yang sedang berjalan (Ctrl+C)
# Kemudian jalankan ulang:
npm run dev
```

## Verifikasi API Key

Untuk memastikan API key Anda valid:

1. Buka browser console (F12)
2. Coba fitur "Buat Audio" di menu Editor Video & Narasi
3. Lihat log di console:
   - ✅ Jika berhasil: `[TTS] Berhasil pada percobaan 1`
   - ❌ Jika gagal: `[TTS] API key invalid`

## Catatan Penting

### Perbedaan API Key

- **GEMINI_API_KEY** = Untuk server-side (generate video)
- **VITE_GEMINI_API_KEY** = Untuk client-side (TTS & analisa gambar)

Keduanya bisa menggunakan API key yang sama, tapi harus didefinisikan terpisah.

### Contoh File .env Lengkap

```env
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Gemini API Keys
GEMINI_API_KEY=AIzaSy_YOUR_KEY_HERE
VITE_GEMINI_API_KEY=AIzaSy_YOUR_KEY_HERE
```

### Keamanan

⚠️ **JANGAN** commit file `.env` ke Git!
- File `.env` sudah ada di `.gitignore`
- Jangan share API key Anda di public
- Untuk production, set environment variables di dashboard hosting (Vercel/Netlify)

## Troubleshooting

### Error: "API key not valid"
- Pastikan API key sudah di-copy dengan benar (tidak ada spasi)
- Pastikan menggunakan prefix `VITE_` untuk client-side
- Restart development server setelah update `.env`

### Error: "Quota exceeded"
- API key gratis memiliki limit penggunaan
- Tunggu beberapa saat atau buat API key baru
- Upgrade ke paid plan jika perlu usage lebih tinggi

### Masih Gagal?
1. Cek console browser untuk error detail
2. Pastikan koneksi internet stabil
3. Coba clear cache browser (Ctrl+Shift+Delete)
4. Coba API key yang berbeda

## Link Berguna

- **Google AI Studio**: https://aistudio.google.com/apikey
- **Gemini API Docs**: https://ai.google.dev/docs
- **Pricing**: https://ai.google.dev/pricing

## Support

Jika masih mengalami masalah, silakan:
1. Cek log di browser console (F12)
2. Pastikan semua langkah di atas sudah diikuti
3. Coba dengan API key yang baru dibuat
