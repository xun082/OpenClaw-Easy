import { NextRequest } from 'next/server';

import { searchClawHub } from '@/lib/clawhub-search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CacheEntry {
  data: unknown;
  expiry: number;
}

const _cache = new Map<string, CacheEntry>();
const TTL = 10 * 60 * 1000;

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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();

  if (!q) return Response.json({ results: [] });

  const cacheKey = `search:${q}`;
  const cached = getCached(cacheKey);
  if (cached) return Response.json(cached, { headers: { 'X-Cache': 'HIT' } });

  const { items, method } = await searchClawHub(q, { limit: 50 });

  if (method !== null) {
    const data = { results: items, method };
    setCache(cacheKey, data);

    return Response.json(data);
  }

  return Response.json({ error: '搜索失败，请稍后重试', results: [] }, { status: 503 });
}
