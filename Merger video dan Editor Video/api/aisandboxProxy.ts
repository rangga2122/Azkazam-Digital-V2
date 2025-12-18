import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL as string | undefined
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'Supabase environment variables missing.' })
    }

    if ((req.method || 'POST').toUpperCase() !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const path = String((req.body?.path ?? '')).trim()
    const payload = req.body?.body ?? {}

    const allowed = new Set([
      '/v1:uploadUserImage',
      '/v1/whisk:runImageRecipe',
      '/v1/whisk:generateImage',
      '/v1/video:batchAsyncGenerateVideoStartImage',
      '/v1/video:batchAsyncGenerateVideoText',
      '/v1/video:batchCheckAsyncVideoGenerationStatus',
    ])
    if (!path || !allowed.has(path)) {
      return res.status(400).json({ error: 'Invalid or disallowed path' })
    }

    const { data, error } = await supabase
      .from('global_settings')
      .select('value')
      .eq('key', 'VEO_BEARER_TOKEN')
      .single()
    if (error) {
      const missing = (error.message || '').includes("Could not find the table 'public.global_settings'")
      if (missing) return res.status(500).json({ error: 'global_settings table missing; cannot read token' })
      return res.status(500).json({ error: error.message })
    }

    const token = (data?.value || '').trim()
    if (!token) return res.status(500).json({ error: 'Bearer token not configured' })

    const upstream = await fetch(`https://aisandbox-pa.googleapis.com${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const text = await upstream.text()
    res.status(upstream.status).setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    return res.send(text)
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Unexpected error' })
  }
}
