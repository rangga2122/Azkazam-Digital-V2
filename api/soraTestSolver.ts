import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

const CAPTCHA_API_KEY = process.env.SORA_CAPTCHA_API_KEY || '';
const SITE_KEY_CLOUDFLARE = process.env.SORA_CAPTCHA_SITE_KEY || '0x4AAAAAACDBydnKT0zYzh2H';
const SITE_URL_CLOUDFLARE = process.env.SORA_CAPTCHA_SITE_URL || 'https://geminigen.ai/app/video-gen/';

const solveTurnstile = async (url?: string): Promise<{ token: string; userAgent: string | null } | null> => {
    if (!CAPTCHA_API_KEY) return null;
    try {
        const targetUrl = url || SITE_URL_CLOUDFLARE;
        const form = new URLSearchParams();
        form.append('key', CAPTCHA_API_KEY);
        form.append('method', 'turnstile');
        form.append('sitekey', SITE_KEY_CLOUDFLARE);
        form.append('pageurl', targetUrl);
        form.append('json', '1');

        const inRes = await axios.post('https://2captcha.com/in.php', form.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 60000
        });

        if (inRes.data && inRes.data.status === 1 && inRes.data.request) {
            const id = inRes.data.request;
            for (let i = 0; i < 24; i++) {
                await new Promise(r => setTimeout(r, 5000));
                const resRes = await axios.get(`https://2captcha.com/res.php?key=${encodeURIComponent(CAPTCHA_API_KEY)}&action=get&id=${encodeURIComponent(id)}&json=1`, { timeout: 30000 });
                if (resRes.data && resRes.data.status === 1 && typeof resRes.data.request === 'string') {
                    return { token: resRes.data.request, userAgent: resRes.data.useragent || null };
                }
                if (resRes.data && resRes.data.request === 'CAPCHA_NOT_READY') continue;
                break;
            }
        }
        return null;
    } catch {
        return null;
    }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const url = typeof req.query.url === 'string' ? req.query.url : SITE_URL_CLOUDFLARE;
        const solved = await solveTurnstile(url);
        if (!solved) {
            return res.status(500).json({ success: false, error: 'Solver gagal atau parameter kurang.' });
        }
        return res.json({ success: true, token: solved.token, userAgent: solved.userAgent });
    } catch (error: any) {
        return res.status(500).json({ success: false, error: error.message || 'Gagal memanggil solver.' });
    }
}
