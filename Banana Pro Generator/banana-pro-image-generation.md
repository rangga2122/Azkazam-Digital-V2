# Dokumentasi Generate Gambar "Banana Pro" (Labs API)

## Daftar Isi
- Pendahuluan
- Prasyarat
- Konfigurasi Token
- Ringkasan Endpoint
- Header Wajib
- Struktur Request
- Variasi Penggunaan
- Contoh cURL
- Contoh JavaScript (fetch)
- Error Handling
- Best Practices
- Referensi Kode di Repo

---

## Pendahuluan
Di aplikasi ini, istilah "Banana Pro" merujuk pada integrasi generator gambar yang berjalan di Google Labs Sandbox API (model `GEM_PIX_2`). Dokumen ini memandu cara generate gambar dari prompt teks, gambar referensi, serta kombinasi gambar latar.

---

## Prasyarat
- Memiliki token Bearer Google Labs yang aktif.
- Koneksi jaringan yang stabil; API mengembalikan URL atau data gambar terenkode.

---

## Konfigurasi Token
- Token disimpan lokal di browser pada key `VEO_BEARER_TOKEN` dan dapat dipusatkan via endpoint admin.
- Aplikasi membaca token melalui:
  - LocalStorage `VEO_BEARER_TOKEN`
  - `GET /api/globalSettings?key=VEO_BEARER_TOKEN`

Referensi:
- `components/AiBannerProduk.tsx:96` dan `components/StudioIklan.tsx:89` mengambil token terpusat.
- `components/TokenSettingsModal.tsx:33` menyimpan token secara lokal.

---

## Ringkasan Endpoint
- Base URL Labs: `https://aisandbox-pa.googleapis.com`
- Upload gambar pengguna: `POST /v1:uploadUserImage`
- Generate gambar batch: `POST /v1/projects/{PROJECT_ID}/flowMedia:batchGenerateImages`

Konstanta di repo:
- `services/imageSandboxApi.ts:4` `LABS_API_BASE_URL = 'https://aisandbox-pa.googleapis.com'`
- `services/imageSandboxApi.ts:5` `PROJECT_ID = '0d92b53d-9512-40c9-9164-4c256dcbbb16'`

---

## Header Wajib
- `Authorization: Bearer <TOKEN>`
- Upload: `Content-Type: application/json`
- Generate: `Content-Type: text/plain;charset=UTF-8`

---

## Struktur Request
- `clientContext.sessionId`: UUID atau timestamp untuk konteks sesi.
- `seed`: angka acak untuk reproduktibilitas.
- `imageModelName`: gunakan `GEM_PIX_2`.
- `imageAspectRatio`: salah satu dari `IMAGE_ASPECT_RATIO_LANDSCAPE` | `IMAGE_ASPECT_RATIO_PORTRAIT` | `IMAGE_ASPECT_RATIO_SQUARE`.
- `prompt`: instruksi teks.
- `imageInputs`: daftar input gambar yang telah diupload, format `{ name: <MEDIA_ID>, imageInputType: 'IMAGE_INPUT_TYPE_REFERENCE' }`.

Referensi mapping aspect ratio: `services/imageSandboxApi.ts:69`.

---

## Variasi Penggunaan
- Prompt saja (tanpa gambar): `imageInputs: []` — `services/imageSandboxApi.ts:115`.
- Subjek produk + prompt: satu `imageInputs` — `services/imageSandboxApi.ts:51`.
- Subjek + model referensi: dua `imageInputs` — `services/imageSandboxApi.ts:138`.
- Subjek + latar kustom: dua `imageInputs` — `services/imageSandboxApi.ts:182`.
- Subjek + referensi + latar: tiga `imageInputs` — `services/imageSandboxApi.ts:241`.

---

## Contoh cURL

1) Upload gambar pengguna
```
curl -X POST "https://aisandbox-pa.googleapis.com/v1:uploadUserImage" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "imageInput": {
      "rawImageBytes": "<BASE64_IMAGE>",
      "mimeType": "image/png",
      "isUserUploaded": true,
      "aspectRatio": "IMAGE_ASPECT_RATIO_LANDSCAPE"
    },
    "clientContext": { "sessionId": "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx", "tool": "ASSET_MANAGER" }
  }'
```
Respons berisi `mediaGenerationId.mediaGenerationId` atau `mediaId`.

2) Generate gambar (dengan satu input gambar)
```
curl -X POST "https://aisandbox-pa.googleapis.com/v1/projects/<PROJECT_ID>/flowMedia:batchGenerateImages" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: text/plain;charset=UTF-8" \
  -d '{
    "requests": [{
      "clientContext": { "sessionId": "<timestamp>" },
      "seed": 12345,
      "imageModelName": "GEM_PIX_2",
      "imageAspectRatio": "IMAGE_ASPECT_RATIO_LANDSCAPE",
      "prompt": "Foto produk skincare di meja kayu, lighting lembut",
      "imageInputs": [{ "name": "<MEDIA_ID>", "imageInputType": "IMAGE_INPUT_TYPE_REFERENCE" }]
    }]
  }'
```
Respons: ambil `media[0].image.generatedImage.fifeUrl` atau `encodedImage`.

3) Prompt saja (tanpa gambar)
```
curl -X POST "https://aisandbox-pa.googleapis.com/v1/projects/<PROJECT_ID>/flowMedia:batchGenerateImages" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: text/plain;charset=UTF-8" \
  -d '{
    "requests": [{
      "clientContext": { "sessionId": "<timestamp>" },
      "seed": 987654,
      "imageModelName": "GEM_PIX_2",
      "imageAspectRatio": "IMAGE_ASPECT_RATIO_PORTRAIT",
      "prompt": "Poster promosi, tipografi jelas, warna pastel",
      "imageInputs": []
    }]
  }'
```

---

## Contoh JavaScript (fetch)

Upload gambar:
```js
async function uploadUserImage(base64, mime, aspect, token) {
  const resp = await fetch('https://aisandbox-pa.googleapis.com/v1:uploadUserImage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageInput: { rawImageBytes: base64, mimeType: mime, isUserUploaded: true, aspectRatio: aspect },
      clientContext: { sessionId: crypto.randomUUID(), tool: 'ASSET_MANAGER' }
    })
  });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}
```

Generate gambar:
```js
async function generateImage({ projectId, prompt, aspect, mediaId, token, seed }) {
  const req = {
    clientContext: { sessionId: String(Date.now()) },
    seed: seed ?? Math.floor(Math.random() * 2147483647),
    imageModelName: 'GEM_PIX_2',
    imageAspectRatio: aspect,
    prompt,
    imageInputs: mediaId ? [{ name: mediaId, imageInputType: 'IMAGE_INPUT_TYPE_REFERENCE' }] : []
  };
  const resp = await fetch(`https://aisandbox-pa.googleapis.com/v1/projects/${projectId}/flowMedia:batchGenerateImages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ requests: [req] })
  });
  if (!resp.ok) throw new Error(await resp.text());
  const data = await resp.json();
  const m = Array.isArray(data?.media) ? data.media[0] : undefined;
  return m?.image?.generatedImage?.fifeUrl || m?.image?.generatedImage?.encodedImage;
}
```

---

## Error Handling
- 401/403: token salah atau kadaluarsa.
- 400: payload tidak valid (cek `imageAspectRatio`, `imageModelName`).
- Devtools terbuka: operasi dibatalkan; tutup devtools saat generate (`services/imageSandboxApi.ts:61`).
- Tidak ada URL gambar: gunakan fallback `encodedImage` jika tersedia.

---

## Best Practices
- Cocokkan aspect ratio dengan UI (landscape/portrait/square).
- Gunakan `seed` tetap untuk konsistensi hasil.
- Saat memakai latar kustom, jelaskan dengan jelas di `prompt` agar latar digunakan.
- Simpan token di lokal, hindari commit ke repository.

---

## Referensi Kode di Repo
- Konstanta dan upload: `services/imageSandboxApi.ts:4`, `services/imageSandboxApi.ts:13`.
- Prompt-only: `services/imageSandboxApi.ts:115`.
- Generate satu input: `services/imageSandboxApi.ts:51`.
- Generate dua input (referensi): `services/imageSandboxApi.ts:138`.
- Generate dua input (latar): `services/imageSandboxApi.ts:182`.
- Generate tiga input: `services/imageSandboxApi.ts:241`.
- Pemakaian batch di UI: `components/AiPhotoshoot.tsx:226`, `components/Lipsync.tsx:240`, `App.tsx:923`.

