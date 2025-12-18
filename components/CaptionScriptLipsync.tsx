import React, { useCallback, useMemo, useRef, useState } from 'react';

type CategoryKey = 'fashion' | 'beauty' | 'food' | 'tech' | 'home' | 'health' | 'other';

const categoryKeywords: Record<CategoryKey, { adjectives: string[]; hooks: string[]; features_long: string[]; actions: string[] }> = {
  fashion: {
    adjectives: ["Nyaman banget dipakai seharian","Desainnya timeless & stylish","Bahannya premium parah","Gampang di-mix & match","Bikin look auto mahal"],
    hooks: ["Sumpah, ini outfit terenak yang pernah aku pake, kalian wajib punya!","Stop scroll dulu! Jangan ngaku fashionista kalau belum tau brand ini!","Outfit hacks 2025 yang bikin penampilan auto mahal dalam 5 detik!"],
    features_long: ["Bahannya tuh bener-bener jatuh dan adem banget, gak bikin gerah sama sekali.","Jahitannya super rapi, detailnya juara, pokoknya worth every penny deh!"],
    actions: ["Twirl / muter badan slow motion","Zoom detail jahitan dan bahan","Pose mirror selfie aesthetic","Transisi ganti baju (finger snap)"]
  },
  beauty: {
    adjectives: ["Teksturnya ringan banget","Finish-nya glowing natural","Coverage-nya mantul","Gak bikin breakout","Tahan seharian tanpa touch-up"],
    hooks: ["Demi apa, kulit aku jadi glowing parah cuma gara-gara produk satu ini!","Capek gak sih nyari skincare yang cocok? Tenang, aku udah nemuin solusinya buat kalian!","Rahasia makeup tahan banting seharian, anti geser walau kena badai!"],
    features_long: ["Teksturnya ringan banget kayak air, langsung nyerap tanpa rasa lengket sedikitpun.","Finish-nya tuh flawless banget, pori-pori auto mingkem seketika!"],
    actions: ["Swatches di tangan (close up)","Apply ke pipi setengah wajah","Tap-tap wajah hasil akhir","Tunjukkan botol kosong (empty bottle)"]
  },
  food: {
    adjectives: ["Rasanya pecah di mulut","Kriuknya berisik banget","Bumbunya medok parah","Pedesnya nampol tapi nagih","Manisnya pas gak bikin eneg"],
    hooks: ["Sumpah ya, ini cemilan paling bahaya yang pernah aku coba, bikin gak bisa berhenti ngunyah!","Hati-hati guys, jangan beli ini kalau kalian lagi diet, karena seenak itu woy!","Definisi kenikmatan hakiki ada di sini, rasanya beneran pecah banget di mulut!"],
    features_long: ["Rasa bumbunya tuh medok banget, gak pelit sama sekali, beneran nempel di lidah.","Kriuknya itu lho, renyah banget sampai tetangga sebelah bisa denger!"],
    actions: ["Gigit (bunyi kriuk ASMR)","Zoom tekstur makanan (tarik/belah)","Ekspresi merem melek menikmati","Suapan besar ke kamera"]
  },
  tech: {
    adjectives: ["Fiturnya canggih banget","Baterainya awet berhari-hari","Desainnya sleek dan modern","Multitasking jadi sat-set","Worth the price banget"],
    hooks: ["Gila sih, gadget sekeren ini harganya masih masuk akal banget, fitur flagship harga mid-range!","Nyesel banget baru tau sekarang, ternyata ini gadget yang selama ini aku cari-cari!","Life hacks buat kalian yang mau produktif, wajib banget kepoin barang canggih ini!"],
    features_long: ["Layarnya jernih banget, refresh rate tinggi bikin scrolling super mulus tanpa ngelag.","Baterainya badak banget, dipake seharian full masih sisa banyak, gila sih!"],
    actions: ["Tapping layar demonstrasi fitur","Zoom port/kamera detail","Demo kecepatan loading app","Compare side-by-side dengan barang lama"]
  },
  home: {
    adjectives: ["Bikin ruangan jadi aesthetic","Super fungsional dan praktis","Hemat tempat banget","Kualitasnya kokoh","Solusi rumah rapi"],
    hooks: ["Kamar berantakan bikin stress? Nih aku kasih tau rahasia kamar estetik low budget!","Anak kos wajib merapat! Barang ini bakal nyelamatin hidup kalian banget!","Ibu-ibu pasti setuju, ini solusi terbaik buat rumah jadi rapi dalam sekejap!"],
    features_long: ["Desainnya minimalis tapi fungsional banget, bikin ruangan sempit jadi lega.","Bahannya kokoh banget, bukan plastik ecek-ecek, dijamin awet bertahun-tahun."],
    actions: ["Before/After ruangan","Cara pasang/rakit timelapse","Simulasi penggunaan sehari-hari","Wide shot ruangan yang rapi"]
  },
  health: {
    adjectives: ["Badan jadi enteng banget","Rasanya seger gak bau jamu","Komposisinya 100% alami","Efeknya kerasa cepet","Mood booster seharian"],
    hooks: ["Stop minum sembarangan! Mending cobain yang alami tapi efeknya beneran kerasa!","Investasi kesehatan gak harus mahal kok, buktinya aku jadi fit banget pake ini!","Badan sering pegel linu? Fix kalian butuh asupan ajaib yang satu ini!"],
    features_long: ["Rasanya seger banget, gak ada bau aneh-aneh, enak banget diminum dingin.","Efeknya langsung kerasa di badan, bangun tidur jadi jauh lebih fresh."],
    actions: ["Minum/Konsumsi dengan nikmat","Gerakan olahraga semangat","Tunjuk komposisi di kemasan","Senyum bugar ke kamera"]
  },
  other: {
    adjectives: ["Unik dan jarang ada yang punya","Sangat membantu keseharian","Harganya masuk akal banget","Kualitas di atas rata-rata","Best purchase tahun ini"],
    hooks: ["Aku nemu barang random di internet tapi ternyata fungsinya beneran mind-blowing!","Jangan bilang siapa-siapa, ini rahasia aku buat hidup lebih gampang!","Cuma modal receh tapi bisa dapet barang sekualitas ini? Mimpi apa semalam!"],
    features_long: ["Kualitas materialnya solid banget, finishingnya halus, gak kelihatan barang murah.","Cara pakainya gampang banget, gak pake ribet, langsung sat-set selesai."],
    actions: ["Unboxing paket pelan-pelan","Pegang produk putar 360","Tunjuk fitur unggulan","Thumbs up dua jempol"]
  }
};

function getRandom<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function getExtendedHashtags(category: CategoryKey, productName: string, platform: string): string {
  const cleanName = productName.replace(/\s/g, '');
  const common = `#${cleanName} #RacunShopee #SpillProduk #ReviewJujur #UGCIndonesia`;
  let categoryTags = '';
  switch (category) {
    case 'fashion': categoryTags = '#OOTDIndo #FashionHacks #OutfitKekinian #Gayaditiktok'; break;
    case 'beauty': categoryTags = '#SkincareRoutine #BeautyHacks #MakeUpTutorial #GlowingSkin'; break;
    case 'food': categoryTags = '#KulinerViral #MukbangIndo #JajananKekinian #FoodieIndo'; break;
    case 'tech': categoryTags = '#GadgetIn #Teknologi #TipsGadget #UnboxingGadget'; break;
    case 'home': categoryTags = '#DekorasiKamar #HomeDecorIndo #RumahMinimalis #AnakKos'; break;
    case 'health': categoryTags = '#HidupSehat #TipsDiet #OlahragaDirumah #HealthyLifestyle'; break;
    default: categoryTags = '#SerbaSerbi #Unik #BarangViral #LifeHacks'; break;
  }
  return `${common}\n${categoryTags}`;
}

const CaptionScriptLipsync: React.FC = () => {
  // Hapus analisa gambar; fokus pada deskripsi produk
  const [productName, setProductName] = useState<string>('');
  const [productDescription, setProductDescription] = useState<string>('');
  const [category, setCategory] = useState<CategoryKey>('other');
  const [sceneCount, setSceneCount] = useState<number>(5);
  const [platform, setPlatform] = useState<string>('tiktok');
  const [contentType, setContentType] = useState<string>('');
  const [toneStyle, setToneStyle] = useState<string>('santai');
  const [language, setLanguage] = useState<string>('id');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [caption, setCaption] = useState<string>('');
  const [hashtags, setHashtags] = useState<string>('');
  const [scenes, setScenes] = useState<{ visual: string; audio: string; duration: string }[]>([]);
  const [showResults, setShowResults] = useState<boolean>(false);
  const toastRef = useRef<HTMLDivElement | null>(null);

  // Gambar dihapus, tidak digunakan

  const showToast = useCallback((message: string) => {
    const el = toastRef.current;
    if (!el) return;
    const span = el.querySelector('#toastMessage') as HTMLSpanElement;
    if (span) span.textContent = message;
    el.classList.remove('translate-y-20','opacity-0');
    setTimeout(() => { el.classList.add('translate-y-20','opacity-0'); }, 3000);
  }, []);

  const buildScene = useCallback((num: number, visual: string, audio: string, duration: string) => ({ visual, audio, duration }), []);

  const copyText = useCallback((text: string) => {
    const langLabelMap2: Record<string, string> = { id: 'bahasa indonesia', en: 'bahasa inggris', ms: 'bahasa malaysia', es: 'bahasa spanyol', fr: 'bahasa prancis', ar: 'bahasa arab', hi: 'bahasa hindi', ja: 'bahasa jepang', ko: 'bahasa korea', zh: 'bahasa mandarin' };
    const fullText = `Buatkan lypsing pakai ${langLabelMap2[language] || 'bahasa indonesia'} : ` + text;
    navigator.clipboard.writeText(fullText).then(() => {
      showToast('Audio + Template berhasil disalin!');
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = fullText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('Audio + Template berhasil disalin!');
    });
  }, [showToast, language]);

  const copyCaption = useCallback(() => {
    const text = `${caption}\n\n${hashtags}`;
    navigator.clipboard.writeText(text).then(() => showToast('Berhasil disalin!'));
  }, [caption, hashtags, showToast]);

  const copyScript = useCallback(() => {
    let text = '';
    scenes.forEach((scene, idx) => {
      text += `Adegan ${idx + 1}:\nVisual: ${scene.visual}\nAudio: "${scene.audio}"\n\n`;
    });
    navigator.clipboard.writeText(text).then(() => showToast('Berhasil disalin!'));
  }, [scenes, showToast]);

  const copyAll = useCallback(() => {
    let scriptText = '--- SCRIPT ---\n\n';
    scenes.forEach((scene, idx) => {
      scriptText += `Adegan ${idx + 1}:\nVisual: ${scene.visual}\nAudio: "${scene.audio}"\n\n`;
    });
    const fullText = `${scriptText}\n--- CAPTION ---\n${caption}\n\n${hashtags}`;
    navigator.clipboard.writeText(fullText).then(() => showToast('Semua konten disalin!'));
  }, [scenes, caption, hashtags, showToast]);

  const resetForm = useCallback(() => {
    setContentType('');
    setSceneCount(5);
    setProductDescription('');
    setShowResults(false);
  }, []);

  const generate = useCallback(() => {
    if (!contentType) {
      showToast('Mohon pilih Jenis Konten!');
      return;
    }
    if (!productDescription.trim()) {
      showToast('Mohon isi deskripsi produk terlebih dahulu.');
      return;
    }
    const callChutesJson = async (userContent: string): Promise<string> => {
      const resp = await fetch('/api/chutesChat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'deepseek-ai/DeepSeek-V3.1',
          messages: [
            { role: 'system', content: 'Kembalikan JSON saja dengan keys: caption (string), hashtags (string multiline), scenes (array objek) berisi visual, audio, duration. Jangan sertakan teks lain di luar JSON.' },
            { role: 'user', content: userContent }
          ],
          stream: false,
          max_tokens: 1024,
          temperature: 0.7
        })
      });
      if (!resp.ok) {
        let m = `HTTP ${resp.status}`; try { m = (await resp.json())?.error?.message || m; } catch {}
        throw new Error(m);
      }
      const data = await resp.json();
      const text = data?.choices?.[0]?.message?.content?.trim() || '';
      if (!text) throw new Error('Respons AI kosong');
      return text;
    };

    setIsGenerating(true);
    (async () => {
      try {

        const langOutMap: Record<string, string> = { id: 'Indonesian', en: 'English', ms: 'Malay', es: 'Spanish', fr: 'French', ar: 'Arabic', hi: 'Hindi', ja: 'Japanese', ko: 'Korean', zh: 'Mandarin Chinese' };
        const langIdMap: Record<string, string> = { id: 'Indonesia', en: 'Inggris', ms: 'Malaysia', es: 'Spanyol', fr: 'Prancis', ar: 'Arab', hi: 'Hindi', ja: 'Jepang', ko: 'Korea', zh: 'Mandarin' };
        const langOut = langOutMap[language] || 'Indonesian';
        const langId = langIdMap[language] || 'Indonesia';

        const productInfo = `\n\nDESKRIPSI PRODUK (WAJIB):\n${productDescription.trim()}\n\nGunakan informasi deskripsi produk di atas untuk membuat konten yang spesifik dan akurat. Sesuaikan narasi, keunggulan, dan manfaat berdasarkan deskripsi ini.`;

        let baseInstruction: string;
        if (language === 'id') {
          baseInstruction = `Buat konten UGC berbahasa ${langId} untuk platform ${platform}. Jenis konten: ${contentType}. Buat tepat ${sceneCount} adegan.${productInfo}\nSetiap adegan: audio/lip-sync satu kalimat dalam bahasa ${langId} yang nyaman diucapkan selama ±8 detik. Hindari terlalu pendek.\nKembalikan JSON saja dengan key: caption (string), hashtags (string; gabungan baris), scenes (array objek) berisi visual (deskripsi aksi/angle), audio (kalimat lipsync berbahasa ${langId} di dalam tanda kutip, cocok untuk ±8 detik), duration (angka atau string detik).\nNada harus natural, menarik, dan berorientasi komersial tanpa berlebihan. Hindari klaim medis/berbahaya. Sesuaikan gaya dengan platform.`;
        } else {
          baseInstruction = `Create UGC content in ${langOut} for ${platform}. Content type: ${contentType}. Create exactly ${sceneCount} scenes.${productInfo}\nEach scene: one lip-sync line in ${langOut} that is comfortable to speak for ~8 seconds. Avoid overly short lines.\nReturn JSON only with keys: caption (string), hashtags (string with multiple lines), scenes (array of objects) with visual (action/angle description), audio (lip-sync line in ${langOut} wrapped in quotes, ~8s), duration (number or string seconds).\nAll text must be in ${langOut}. Tone must be natural, engaging, and commercially oriented without exaggeration. Avoid medical/dangerous claims. Match the platform style.`;
        }

        const toneGuidesId: Record<string, string> = {
          santai: 'Santai, kasual, bahasa gaul ringan, emoji secukupnya',
          formal: 'Formal, profesional, tanpa slang, tanpa emoji',
          persuasif: 'Persuasif soft-sell, fokus manfaat, CTA halus',
          edukatif: 'Edukatif, jelas, tips praktis, informatif',
          storytelling: 'Storytelling, naratif, emosional, tetap ringkas'
        };
        const toneGuidesEn: Record<string, string> = {
          santai: 'Casual, conversational, light slang if appropriate, minimal emoji',
          formal: 'Formal, professional, no slang, no emoji',
          persuasif: 'Persuasive soft-sell, focus on benefits, gentle CTA',
          edukatif: 'Educational, clear, practical tips, informative',
          storytelling: 'Storytelling, narrative, emotional yet concise'
        };
        const toneDesc = (language === 'id' ? toneGuidesId : toneGuidesEn)[toneStyle] || (language === 'id' ? toneGuidesId.santai : toneGuidesEn.santai);
        const userContent = (language === 'id'
          ? (baseInstruction + `\nGunakan gaya bahasa: ${toneDesc}.\nSemua output harus dalam bahasa ${langId}.`)
          : (baseInstruction + `\nUse writing style: ${toneDesc}.\nALL output must be in ${langOut} only. Do not include Indonesian filler words like 'banget', 'auto', 'gini', 'dong', 'deh', 'nih', 'kok'.`)
        );

        const txt = await callChutesJson(userContent);
        if (!txt) throw new Error('Tidak ada respons AI');
        let parsed: any;
        try {
          const cleaned = txt.replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
          parsed = JSON.parse(cleaned);
        } catch { throw new Error('Format AI tidak valid'); }

        if (language !== 'id') {
          const translatePrompt = `Translate the following JSON into ${langOut}. Keep exactly ${sceneCount} scenes, preserve durations, maintain quotes around audio lines, do not change structure or keys, and return JSON only. ALL text must be in ${langOut} only.`;
          const translated = await callChutesJson(translatePrompt + "\n\n" + JSON.stringify(parsed));
          try {
            const cleanedT = translated.replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
            parsed = JSON.parse(cleanedT);
          } catch { throw new Error('Format terjemahan tidak valid'); }
          const tokens = [' banget',' auto',' gini',' dong',' deh',' nih',' kok',' liat',' lihat',' kamu',' aku',' kita',' produk ',' warna ',' bahan ',' motif ',' gemes '];
          const textBundle = `${parsed.caption} ${parsed.hashtags} ` + (Array.isArray(parsed.scenes) ? parsed.scenes.map((s:any)=>`${s.visual} ${s.audio}`).join(' ') : '');
          const hasIndo = tokens.some(t => textBundle.toLowerCase().includes(t));
          if (hasIndo) {
            const enforcePrompt = `Rewrite the following JSON strictly in ${langOut}. Remove any Indonesian words or slang. Keep the same JSON keys and structure, same number of scenes, and return JSON only.`;
            const enforced = await callChutesJson(enforcePrompt + "\n\n" + JSON.stringify(parsed));
            try {
              const cleanedE = enforced.replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
              parsed = JSON.parse(cleanedE);
            } catch { throw new Error('Format terjemahan tidak valid'); }
          }
        }

        const cap = String(parsed.caption || '').trim();
        const tags = String(parsed.hashtags || '').trim();
        const scn = Array.isArray(parsed.scenes) ? parsed.scenes : [];
        const mapped = scn.map((s: any, idx: number) => ({
          visual: String(s.visual || `Adegan ${idx+1}`),
          audio: String(s.audio || '""'),
          duration: String(s.duration || '8'),
        }));

        setCaption(cap);
        setHashtags(tags);
        setScenes(mapped);
        setShowResults(true);
      } catch (e) {
        showToast((e as any)?.message || 'Gagal generate via AI');
      } finally {
        setIsGenerating(false);
      }
    })();
  }, [platform, contentType, sceneCount, toneStyle, showToast, buildScene, productDescription]);

  return (
    <div className="flex flex-col">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 w-full">
        <div className="text-center mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Buat Caption & Scrip Lypsing</h1>
          <p className="text-gray-600">Buat skrip dan caption untuk konten produk secara cepat.</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-6">
            {/* Bagian upload gambar dihapus */}

            <div className="glass-panel rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-5">Detail Konten</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Jumlah Adegan (Scene)</label>
                  <select value={sceneCount} onChange={e => setSceneCount(parseInt(e.target.value))} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-sm">
                    <option value={3}>3 Adegan</option>
                    <option value={4}>4 Adegan</option>
                    <option value={5}>5 Adegan</option>
                    <option value={6}>6 Adegan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Platform Target</label>
                  <div className="grid grid-cols-2 gap-3">
                    {['tiktok','instagram','youtube','facebook'].map(p => (
                      <label key={p} className="cursor-pointer">
                        <input type="radio" name="platform" checked={platform===p} onChange={() => setPlatform(p)} className="sr-only" />
                        <div className={`rounded-lg border p-2 text-center ${platform===p ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 hover:bg-gray-50'}`}>{p==='youtube'?'Shorts':p.charAt(0).toUpperCase()+p.slice(1)}</div>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Jenis Konten</label>
                  <select value={contentType} onChange={e => setContentType(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-sm">
                    <option value="">Pilih jenis konten</option>
                    <option value="review">Review Jujur / Produk</option>
                    <option value="unboxing">ASMR / Unboxing</option>
                    <option value="tutorial">Tutorial / Cara Pakai</option>
                    <option value="comparison">Perbandingan (Vs)</option>
                    <option value="storytelling">Storytelling / Lifestyle</option>
                    <option value="testimoni">Testimonial</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi Produk <span className="text-red-600">(Wajib)</span></label>
                  <textarea
                    value={productDescription}
                    onChange={e => setProductDescription(e.target.value)}
                    placeholder="Contoh: Tas ransel anti air dengan 3 kompartemen, bahan polyester premium, cocok untuk traveling dan kuliah. Tersedia warna hitam, navy, dan abu-abu."
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-sm resize-none"
                    rows={3}
                  />
                  <p className="text-xs text-gray-500 mt-1">Kolom ini wajib diisi untuk menghasilkan konten yang relevan.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gaya Bahasa</label>
                  <select value={toneStyle} onChange={e => setToneStyle(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-sm">
                    <option value="santai">Santai / Kasual</option>
                    <option value="formal">Formal / Profesional</option>
                    <option value="persuasif">Persuasif (Soft-sell)</option>
                    <option value="edukatif">Edukatif</option>
                    <option value="storytelling">Storytelling</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bahasa</label>
                  <select value={language} onChange={e => setLanguage(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-sm">
                    <option value="id">Indonesia</option>
                    <option value="en">Inggris</option>
                    <option value="ms">Malaysia</option>
                    <option value="es">Spanyol</option>
                    <option value="fr">Prancis</option>
                    <option value="ar">Arab</option>
                    <option value="hi">Hindi</option>
                    <option value="ja">Jepang</option>
                    <option value="ko">Korea</option>
                    <option value="zh">Mandarin</option>
                  </select>
                </div>
                <button onClick={generate} disabled={isGenerating} className={`w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 px-4 rounded-xl transition-all ${isGenerating?'opacity-75 cursor-not-allowed':''}`}>{isGenerating ? 'Menganalisa...' : 'Generate Konten UGC'}</button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7">
            {!showResults && (
              <div className="h-full flex flex-col items-center justify-center bg-white rounded-2xl border-2 border-dashed border-gray-200 p-10 text-center min-h-[500px]">
                <div className="bg-orange-50 p-4 rounded-full mb-4">🤖</div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">Siap Membuat Konten?</h3>
                <p className="text-gray-500 max-w-sm">Isi formulir di sebelah kiri dan biarkan AI membuatkan skrip viral.</p>
              </div>
            )}
            {showResults && (
              <div className="space-y-6">
                <div className="glass-panel rounded-2xl overflow-hidden border-t-4 border-orange-500">
                  <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                    <h3 className="font-bold text-gray-800">Hasil Generasi UGC</h3>
                    <div className="flex gap-2">
                      <span className="px-2 py-1 bg-black text-white text-xs rounded font-bold capitalize">{platform}</span>
                    </div>
                  </div>
                  <div className="p-6 space-y-6">
                    <div className="space-y-3">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Caption & Hashtags</label>
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 relative">
                        <p className="text-sm text-gray-800 whitespace-pre-line font-medium mb-3">{caption || '...'}</p>
                        <p className="text-sm text-blue-600 whitespace-pre-line">{hashtags || '...'}</p>
                        <button onClick={copyCaption} className="absolute top-2 right-2 bg-white p-2 rounded-lg shadow-sm text-gray-500 border border-gray-200">Copy</button>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-end">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Script Video (Scene by Scene)</label>
                        <span className="text-xs text-gray-400 italic bg-yellow-50 px-2 py-1 rounded text-yellow-700 border border-yellow-100">Tips: nada cepat (±8 detik vibe)</span>
                      </div>
                      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden relative">
                        <div className="p-5 text-sm space-y-4 text-gray-700">
                          {scenes.map((scene, idx) => (
                            <div key={idx} className="border-l-4 border-orange-200 pl-4 py-2 mb-4 bg-gray-50 rounded-r-lg">
                              <div className="flex justify-between items-center mb-2">
                                <span className="font-bold text-orange-900 text-sm bg-orange-100 px-2 py-0.5 rounded">Adegan {idx+1}</span>
                                <span className="text-xs text-gray-500">± {scene.duration} det</span>
                              </div>
                              <div className="mb-2">
                                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Visual</p>
                                <p className="text-sm text-gray-700">{scene.visual}</p>
                              </div>
                              <div>
                                <div className="flex justify-between items-start">
                                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Audio / Lip-sync</p>
                                  <button onClick={() => copyText(scene.audio.replace(/^[^\"]*\"|\"$/g,''))} className="text-xs flex items-center text-orange-600 font-medium bg-white border border-orange-100 px-2 py-1 rounded">Copy Audio</button>
                                </div>
                                <p className="text-sm text-gray-900 font-medium italic leading-relaxed">"{scene.audio.replace(/^[^\"]*\"|\"$/g,'')}"</p>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="absolute top-4 right-4">
                          <button onClick={copyScript} className="bg-orange-50 text-orange-600 px-3 py-1.5 rounded-lg text-xs font-bold border border-orange-200">Copy All</button>
                        </div>
                      </div>
                    </div>
                    <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-between items-center">
                      <button onClick={resetForm} className="text-sm text-gray-500 font-medium">Reset</button>
                      <button onClick={copyAll} className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium">Copy All Result</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div id="toast" ref={toastRef} className="fixed bottom-5 right-5 bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg transform translate-y-20 opacity-0 transition-all duration-300 z-50 flex items-center"><span className="mr-2">✔</span><span id="toastMessage">Copied to clipboard!</span></div>
    </div>
  );
};

export default CaptionScriptLipsync;
