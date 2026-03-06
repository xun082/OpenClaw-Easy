import { exec } from 'child_process';
import { homedir } from 'os';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ClawHubSearchItem {
  slug: string;
  displayName: string;
  score?: number;
  summary?: string;
}

function enrichedPath(): string {
  const home = process.env.HOME ?? homedir();
  const nvmBin = process.env.NVM_BIN ?? '';
  const extras = [
    nvmBin,
    `${home}/.nvm/versions/node/v24.13.0/bin`,
    `${home}/.nvm/versions/node/v22.0.0/bin`,
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    `${home}/.local/bin`,
  ].filter(Boolean);

  return [...extras, process.env.PATH ?? ''].join(':');
}

async function searchViaCli(q: string, limit: number): Promise<ClawHubSearchItem[] | null> {
  try {
    const safeQuery = q.replace(/'/g, "'\\''");
    const { stdout, stderr } = await execAsync(`clawhub search '${safeQuery}'`, {
      timeout: 20_000,
      encoding: 'utf8',
      env: { ...process.env, PATH: enrichedPath() },
    });

    if (stderr?.toLowerCase().includes('error') && !stdout) {
      console.warn('[ClawHub CLI] stderr:', stderr.slice(0, 200));

      return null;
    }

    const items: ClawHubSearchItem[] = [];

    for (const raw of stdout.trim().split('\n').filter(Boolean)) {
      const scoreMatch = raw.match(/\((\d+(?:\.\d+)?)\)\s*$/);
      if (!scoreMatch) continue;

      const score = parseFloat(scoreMatch[1]);
      const withoutScore = raw.slice(0, raw.lastIndexOf('(')).trim();
      const sep = withoutScore.search(/\s+/);
      if (sep < 0) continue;

      const slug = withoutScore.slice(0, sep).trim();
      const displayName = withoutScore.slice(sep).trim();
      if (slug) items.push({ slug, displayName, score });
    }

    console.log('[ClawHub CLI] query:', q, '→', items.length, 'results');

    return items.slice(0, limit);
  } catch (e) {
    console.warn('[ClawHub CLI] unavailable:', (e as Error).message.slice(0, 120));

    return null;
  }
}

async function searchViaHttp(q: string, limit: number): Promise<ClawHubSearchItem[] | null> {
  const url =
    'https://clawhub.ai/api/v1/search?' +
    new URLSearchParams({ q, limit: String(Math.min(limit, 50)) }).toString();

  const headers = {
    'User-Agent': 'OpenClaw/2.0 (https://github.com/openclaw)',
    Accept: 'application/json',
  };

  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('Retry-After') ?? 0);
        const delay = retryAfter > 0 ? retryAfter * 1000 : Math.pow(2, attempt) * 2_000;
        console.warn(`[ClawHub HTTP] 429 → retry in ${delay}ms (attempt ${attempt + 1})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (!res.ok) {
        console.error('[ClawHub HTTP] error', res.status);

        return null;
      }

      const bodyText = await res.text();

      if (bodyText.trimStart().startsWith('<')) {
        console.error('[ClawHub HTTP] received HTML (CDN error page)');

        return null;
      }

      const raw = JSON.parse(bodyText) as Record<string, unknown>;
      const candidates: unknown[] =
        (raw.results as unknown[]) ??
        (raw.items as unknown[]) ??
        (raw.data as unknown[]) ??
        (Array.isArray(raw) ? raw : []);

      type R = {
        slug?: string;
        displayName?: string;
        name?: string;
        summary?: string | null;
        score?: number;
      };

      const items: ClawHubSearchItem[] = (candidates as R[])
        .map((item) => ({
          slug: item.slug ?? '',
          displayName: item.displayName ?? item.name ?? item.slug ?? '',
          score: typeof item.score === 'number' ? item.score : undefined,
          summary: typeof item.summary === 'string' ? item.summary : undefined,
        }))
        .filter((item) => item.slug)
        .slice(0, limit);

      console.log('[ClawHub HTTP]', items.length, 'results for:', q);

      return items;
    } catch (e) {
      console.error('[ClawHub HTTP] fetch error attempt', attempt + 1, ':', (e as Error).message);
      if (attempt < MAX_RETRIES - 1)
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1_000));
    }
  }

  return null;
}

export interface SearchClawHubResult {
  items: ClawHubSearchItem[];
  method: 'cli' | 'http' | null;
}

export async function searchClawHub(
  q: string,
  options?: { limit?: number },
): Promise<SearchClawHubResult> {
  const limit = Math.min(options?.limit ?? 50, 50);

  const cliItems = await searchViaCli(q, limit);

  if (cliItems !== null) {
    return { items: cliItems, method: 'cli' };
  }

  const httpItems = await searchViaHttp(q, limit);

  if (httpItems !== null) {
    return { items: httpItems, method: 'http' };
  }

  return { items: [], method: null };
}
