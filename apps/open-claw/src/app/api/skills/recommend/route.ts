import { NextRequest } from 'next/server';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ChatOpenAI } from '@langchain/openai';
import { createDeepAgent } from 'deepagents';

import { searchClawHub } from '@/lib/clawhub-search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface AiRecommendResult {
  slug: string;
  displayName: string;
  summary?: string;
  reason: string;
  score: number;
}

export type SSEEvent =
  | { type: 'search_start'; step: number; keywords: string[]; method: 'cli' | 'http' }
  | { type: 'search_end'; step: number; count: number; method: 'cli' | 'http' }
  | { type: 'result'; results: AiRecommendResult[] }
  | { type: 'error'; message: string }
  | { type: 'done' };

type Provider = 'deepseek' | 'kimi';

interface ProviderConfig {
  model: string;
  baseURL: string;
  temperature: number;
}

const PROVIDER_CONFIG: Record<Provider, ProviderConfig> = {
  deepseek: { model: 'deepseek-chat', baseURL: 'https://api.deepseek.com', temperature: 0.1 },
  kimi: { model: 'moonshot-v1-8k', baseURL: 'https://api.moonshot.cn/v1', temperature: 0.1 },
};

function buildModel(apiKey: string, provider: Provider, maxTokens: number) {
  const cfg = PROVIDER_CONFIG[provider];

  return new ChatOpenAI({
    model: cfg.model,
    apiKey,
    configuration: { baseURL: cfg.baseURL },
    temperature: cfg.temperature,
    maxTokens,
  });
}

interface CacheEntry {
  payload: string;
  expiry: number;
}

const _searchCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function getCached(key: string): string | null {
  const e = _searchCache.get(key);

  if (!e || e.expiry < Date.now()) {
    _searchCache.delete(key);

    return null;
  }

  return e.payload;
}

function setCache(key: string, payload: string) {
  _searchCache.set(key, { payload, expiry: Date.now() + CACHE_TTL_MS });
}

function parseToolArgs(raw: unknown): Record<string, unknown> {
  try {
    const str = (raw as Record<string, unknown>)?.input;

    return typeof str === 'string'
      ? (JSON.parse(str) as Record<string, unknown>)
      : ((raw as Record<string, unknown>) ?? {});
  } catch {
    return {};
  }
}

function countToolResults(output: unknown): number {
  try {
    // LangChain wraps tool output in a ToolMessage: { lc:1, kwargs:{ content:"[...]" } }
    if (output && typeof output === 'object') {
      const obj = output as Record<string, unknown>;
      const kwargs = obj.kwargs as Record<string, unknown> | undefined;
      const content = (kwargs?.content ?? obj.content) as string | undefined;

      if (typeof content === 'string') {
        const parsed = JSON.parse(content);

        return Array.isArray(parsed) ? parsed.length : 0;
      }
    }

    const raw = typeof output === 'string' ? output : JSON.stringify(output);
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.length;
  } catch {
    /* ignore */
  }

  return 0;
}

function parseFinalResults(content: string): AiRecommendResult[] {
  try {
    const cleaned = content
      .replace(/^```(?:json)?\s*/m, '')
      .replace(/\s*```$/m, '')
      .trim();
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) return [];

    const ranked = JSON.parse(match[0]) as Array<{
      slug: string;
      displayName?: string;
      reason: string;
      score: number;
    }>;

    return ranked
      .filter((r) => typeof r.slug === 'string' && r.score > 0.4)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((r) => ({
        slug: r.slug,
        displayName: r.displayName ?? r.slug,
        reason: r.reason,
        score: r.score,
      }));
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { query?: string; apiKey?: string; provider?: string };
  const query = body.query?.trim() ?? '';
  const apiKey = body.apiKey?.trim() ?? '';
  const provider: Provider =
    body.provider === 'kimi' || body.provider === 'deepseek' ? body.provider : 'deepseek';

  if (!query) return Response.json({ error: '查询内容不能为空' }, { status: 400 });
  if (!apiKey)
    return Response.json({ error: '请先在设置中配置 DeepSeek 或 Kimi API Key' }, { status: 400 });

  const model = buildModel(apiKey, provider, 8192);

  let lastSearchMethod: 'cli' | 'http' = 'http';

  const searchSkills = tool(
    async ({ keywords, limit = 25 }: { keywords: string[]; limit?: number }) => {
      const q = keywords.join(' ');
      const limitNum = Math.min(limit, 50);
      const cacheKey = `${q}::${limitNum}`;

      const cached = getCached(cacheKey);

      if (cached) {
        console.log('[Search] cache hit for:', q);

        return cached;
      }

      const { items, method } = await searchClawHub(q, { limit: limitNum });
      lastSearchMethod = method ?? 'http';

      const payload = JSON.stringify(items);
      if (items.length > 0) setCache(cacheKey, payload);

      return payload;
    },
    {
      name: 'search_skills',
      description:
        'Search the ClawHub skill library. Supports natural language queries and semantic matching. Use English keywords — most skill names are in English. Call at most twice with different angles if the first result is insufficient.',
      schema: z.object({
        keywords: z
          .array(z.string())
          .describe('Search keywords, e.g. ["bilibili", "video downloader"]'),
        limit: z.number().optional().default(25).describe('Max results, up to 50'),
      }),
    },
  );

  const agent = createDeepAgent({
    model,
    tools: [searchSkills],
    systemPrompt: `你是 OpenClaw AI Agent 框架的技能推荐引擎，使用 ClawHub 技能库（语义向量搜索）。

⚠️ 搜索限制：最多调用 search_skills 2 次，请第一次就给出最精准的英文关键词。

工作流程：
1. 从用户需求中提取 1-3 个精准的英文关键词（优先英文，因为技能名称多为英文）。
2. 调用 search_skills 一次。如果结果相关性高，直接输出推荐；
   只有第一次结果完全不相关时，才用不同关键词再搜索一次。
3. 从候选列表中挑选最匹配的技能，只输出纯 JSON 数组（无 markdown 代码块）：
   [{"slug":"xxx","displayName":"xxx","reason":"中文解释（1-2句，说明功能和匹配原因）","score":0.9}]

评分规则：
- score 0.9-1.0：完美匹配，功能直接满足需求
- score 0.7-0.89：强匹配，核心功能覆盖需求
- score 0.5-0.69：部分匹配，可间接满足需求
- score < 0.5：忽略
- 最多返回 5 条，按 score 降序
- 未找到相关技能时返回 []`,
  });

  const encoder = new TextEncoder();
  let currentSearchStep = 0;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SSEEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        let searchCount = 0;
        const MAX_SEARCHES = 2;
        let finalContent = '';

        const eventStream = (
          agent as {
            streamEvents: (
              input: { messages: { role: string; content: string }[] },
              options: { version: string },
            ) => AsyncIterable<{ event: string; name: string; data: Record<string, unknown> }>;
          }
        ).streamEvents({ messages: [{ role: 'user', content: query }] }, { version: 'v2' });

        for await (const { event: type, name, data } of eventStream) {
          if (type === 'on_tool_start' && name === 'search_skills') {
            searchCount++;
            if (searchCount > MAX_SEARCHES) continue;
            currentSearchStep = searchCount;

            const args = parseToolArgs(data?.input);
            const keywords = (args.keywords as string[]) ?? [];
            send({ type: 'search_start', step: searchCount, keywords, method: 'cli' });
          }

          if (type === 'on_tool_end' && name === 'search_skills') {
            const count = countToolResults(data?.output);
            console.log(
              '[search_end] step',
              currentSearchStep,
              'count',
              count,
              'method',
              lastSearchMethod,
            );
            send({ type: 'search_end', step: currentSearchStep, count, method: lastSearchMethod });
          }

          if (type === 'on_chat_model_stream') {
            const token = (data?.chunk as { content?: string })?.content ?? '';
            if (token) finalContent += token;
          }
        }

        const results = parseFinalResults(finalContent);
        send({ type: 'result', results });
        send({ type: 'done' });
      } catch (e) {
        send({ type: 'error', message: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
