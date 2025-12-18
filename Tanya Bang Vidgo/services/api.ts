import { Message } from '../types';

const MODEL = 'Qwen/Qwen2.5-VL-32B-Instruct';
const CENTRAL_ENDPOINT = '/api/chutesChat';

export const streamChatCompletion = async (
  messages: Message[],
  onChunk: (content: string) => void,
  onError: (error: string) => void,
  onFinish: () => void,
  signal?: AbortSignal
) => {
  try {
    // System instruction to define the persona as a UGC/Content Expert with STRICT formatting rules
    const systemMessage = {
      role: 'system',
      content: `Kamu adalah Asisten Bang Vidgo, ahli strategi konten, copywriter, dan spesialis UGC.

ATURAN FORMAT JAWABAN (WAJIB DIPATUHI):
1. **Gaya Visual:** Gunakan "Clean Professional Layout". Tampilan harus rapi, mahal, dan mudah dibaca (scannable).
2. **Struktur:** Gunakan hierarki Heading Markdown menggunakan simbol pagar (# untuk Judul Utama, ## untuk Sub-judul, ### untuk Poin Penting). JANGAN menulis teks "H1", "H2", atau "H3" secara literal.
3. **Paragraf:** Wajib paragraf pendek (maksimal 2-3 kalimat per paragraf). Jangan membuat dinding teks (wall of text).
4. **List:** Gunakan Bullet points (-) atau Numbering (1.) untuk rincian. Hindari koma berderet dalam paragraf panjang.
5. **Penekanan:** Gunakan **Bold** untuk kata kunci penting atau poin utama.
6. **Pemisah:** Gunakan garis horizontal (---) untuk memisahkan bagian intro, isi utama, dan kesimpulan/CTA agar visualnya bersih.
7. **Tone:** Profesional, namun kreatif dan luwes (humanis).
8. **Tujuan:** Output harus terlihat seperti naskah/dokumen yang "Siap Pakai" (Ready to post/print).

Fokus tugas: Caption IG/TikTok, Script Video, Copywriting Ads, dan Riset Hashtag.`
    };

    const apiMessages = [
      systemMessage,
      ...messages.map((m) => {
        const hasImages = Array.isArray((m as any).images) && (m as any).images.length > 0;
        if (m.role === 'user' && hasImages) {
          const imgs = ((m as any).images as string[]).slice(0, 4);
          const contentParts = [
            { type: 'text', text: m.content },
            ...imgs.map((url) => ({ type: 'image_url', image_url: { url } })),
          ];
          return { role: m.role, content: contentParts } as any;
        }
        return { role: m.role, content: m.content };
      })
    ];

    // Try centralized proxy (reads token from Supabase global_settings via admin panel)
    const response = await fetch(CENTRAL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream,application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: apiMessages,
        stream: true,
        max_tokens: 1024,
        temperature: 0.7,
      }),
      signal,
    });

    if (!response.ok) {
      // Fallback to direct upstream using locally stored token (from Admin menu) when centralized fails
      const localToken = (localStorage.getItem('CHUTES_API_TOKEN') || '').trim();
      if (!localToken) {
        const errorData = await response.json().catch(() => ({}));
        const statusMessage = response.statusText ? `(${response.statusText})` : '';
        const friendlyMessage = errorData.error?.message || `Terjadi gangguan pada server. Kode: ${response.status} ${statusMessage}`;
        throw new Error(friendlyMessage);
      }
      const upstream = await fetch('https://llm.chutes.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localToken}`,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream,application/json'
        },
        body: JSON.stringify({
          model: MODEL,
          messages: apiMessages,
          stream: true,
          max_tokens: 1024,
          temperature: 0.7,
        }),
        signal,
      });
      if (!upstream.ok) {
        const errData = await upstream.json().catch(() => ({}));
        const statusMessage = upstream.statusText ? `(${upstream.statusText})` : '';
        const friendlyMessage = errData.error?.message || `Terjadi gangguan pada server. Kode: ${upstream.status} ${statusMessage}`;
        throw new Error(friendlyMessage);
      }
      // Use upstream response as the streaming source
      const body = upstream.body;
      if (!body) throw new Error('ReadableStream tidak didukung oleh browser ini.');
      const reader = body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine.startsWith('data: ')) continue;
          const dataStr = trimmedLine.replace('data: ', '');
          if (dataStr === '[DONE]') { onFinish(); return; }
          try {
            const json = JSON.parse(dataStr);
            const deltaContent = json.choices?.[0]?.delta?.content;
            if (deltaContent) onChunk(deltaContent);
          } catch (e) {
            console.warn('Error parsing stream chunk', e);
          }
        }
      }
      onFinish();
      return;
    }

    // Centralized path OK: stream if SSE is available, otherwise parse final JSON
    if (!response.body) {
      // Non-streaming response: parse JSON and emit once
      const text = await response.text();
      try {
        const j = JSON.parse(text);
        const content =
          j?.choices?.[0]?.message?.content ||
          j?.choices?.[0]?.delta?.content ||
          '';
        if (content) onChunk(content);
        onFinish();
        return;
      } catch {
        throw new Error('Respons server tidak valid.');
      }
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the incomplete line in the buffer

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine.startsWith('data: ')) continue;

        const dataStr = trimmedLine.replace('data: ', '');
        if (dataStr === '[DONE]') {
            onFinish();
            return;
        }

        try {
          const json = JSON.parse(dataStr);
          const deltaContent = json.choices?.[0]?.delta?.content;
          if (deltaContent) {
            onChunk(deltaContent);
          }
        } catch (e) {
          console.warn('Error parsing stream chunk', e);
        }
      }
    }
    
    onFinish();

  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      onFinish();
      return;
    }
    console.error('Streaming error:', error);
    let errorMessage = error instanceof Error ? error.message : 'Terjadi kesalahan yang tidak diketahui.';
    
    // Translate common network errors
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
        errorMessage = 'Gagal terhubung ke internet. Periksa koneksi Anda.';
    }

    onError(errorMessage);
    onFinish();
  }
};
