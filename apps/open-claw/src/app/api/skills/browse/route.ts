/**
 * GET /api/skills/browse
 *
 * Server-side proxy for the ClawHub skills list.
 * Handles 429 rate limiting with exponential backoff and caches results
 * so rapid client navigations don't flood clawhub.ai.
 *
 * Query params:
 *   cursor  - pagination cursor (optional)
 *   sort    - sort order, default "downloads"
 */

import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Cache ─────────────────────────────────────────────────────────────────────

interface CacheEntry {
  data: unknown;
  expiry: number;
}

const _cache = new Map<string, CacheEntry>();
const TTL = 5 * 60 * 1000; // 5 minutes

function getCached(key: string): unknown | null {
  const e = _cache.get(key);

  if (!e || e.expiry < Date.now()) {
    _cache.delete(key);

    return null;
  }

  return e.data;
}

function setCache(key: string, data: unknown) {
  _cache.set(key, { data, expiry: Date.now() + TTL });
}

// ── Fetch with retry ──────────────────────────────────────────────────────────

async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  const headers = {
    'User-Agent': 'OpenClaw/2.0 (https://github.com/openclaw)',
    Accept: 'application/json',
  };

  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After') ?? 0);
      const delay = retryAfter > 0 ? retryAfter * 1000 : Math.pow(2, i) * 2_000;
      console.warn(`[ClawHub Browse] 429 → retry in ${delay}ms (attempt ${i + 1})`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    return res;
  }

  throw new Error('ClawHub browse: max retries exceeded (rate limited)');
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get('cursor') ?? '';
  const sort = searchParams.get('sort') ?? 'downloads';

  const cacheKey = `browse:${sort}:${cursor}`;
  const cached = getCached(cacheKey);

  if (cached) {
    return Response.json(cached, { headers: { 'X-Cache': 'HIT' } });
  }

  try {
    const params = new URLSearchParams({ sort, nonSuspicious: 'true' });
    if (cursor) params.set('cursor', cursor);

    const res = await fetchWithRetry(`https://clawhub.ai/api/v1/skills?${params}`);

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error('[ClawHub Browse] HTTP', res.status, txt.slice(0, 200));

      return Response.json(
        { error: `HTTP ${res.status}`, items: [], nextCursor: null },
        { status: res.status },
      );
    }

    const data = await res.json();
    setCache(cacheKey, data);

    return Response.json(data, { headers: { 'X-Cache': 'MISS' } });
  } catch (e) {
    console.error('[ClawHub Browse] error:', (e as Error).message);

    return Response.json(
      { error: (e as Error).message, items: [], nextCursor: null },
      { status: 500 },
    );
  }
}
