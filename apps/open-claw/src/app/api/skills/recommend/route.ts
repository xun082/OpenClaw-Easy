/**
 * POST /api/skills/recommend
 *
 * Runs a deepagents + LangChain agentic loop that:
 *  1. Receives the user's natural-language query and DeepSeek API key.
 *  2. Gives the model a `search_skills` tool that queries ClawHub online.
 *  3. Lets the model call the tool as many times as it wants.
 *  4. Streams back SSE events (search_start / search_end / result / done / error).
 *
 * This runs server-side (Next.js Node.js runtime), so there are no CORS
 * issues when hitting clawhub.ai, and the DeepSeek API key stays out of
 * client-side JS.
 */

import { NextRequest } from 'next/server';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ChatOpenAI } from '@langchain/openai';
import { createDeepAgent } from 'deepagents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AiRecommendResult {
  slug: string;
  displayName: string;
  summary?: string;
  reason: string;
  score: number;
}

export type SSEEvent =
  | { type: 'search_start'; step: number; keywords: string[] }
  | { type: 'search_end'; step: number; count: number }
  | { type: 'result'; results: AiRecommendResult[] }
  | { type: 'error'; message: string }
  | { type: 'done' };

// ── Helpers ───────────────────────────────────────────────────────────────────

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
    const raw = typeof output === 'string' ? output : JSON.stringify(output);
    const parsed = JSON.parse(raw) as unknown;

    if (Array.isArray(parsed)) return parsed.length;
  } catch {
    // ignore
  }

  return 0;
}

function parseFinalResults(content: string): AiRecommendResult[] {
  try {
    const jsonStr = content
      .replace(/^```(?:json)?\s*/m, '')
      .replace(/\s*```$/m, '')
      .trim();

    const match = jsonStr.match(/\[[\s\S]*\]/);
    if (!match) return [];

    const ranked = JSON.parse(match[0]) as Array<{
      slug: string;
      displayName?: string;
      reason: string;
      score: number;
    }>;

    return ranked
      .filter((r) => typeof r.slug === 'string' && r.score > 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
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

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { query?: string; apiKey?: string };
  const query = body.query?.trim() ?? '';
  const apiKey = body.apiKey?.trim() ?? '';

  if (!query) {
    return Response.json({ error: '查询内容不能为空' }, { status: 400 });
  }

  if (!apiKey) {
    return Response.json({ error: '请先在设置中配置 DeepSeek API Key' }, { status: 400 });
  }

  // ── Model ──────────────────────────────────────────────────────────────────
  const model = new ChatOpenAI({
    model: 'deepseek-chat',
    apiKey,
    configuration: { baseURL: 'https://api.deepseek.com' },
    temperature: 0.1,
    maxTokens: 8192,
  });

  // ── Tool: search_skills (calls ClawHub online) ─────────────────────────────
  const searchSkills = tool(
    async ({ keywords, limit = 25 }: { keywords: string[]; limit?: number }) => {
      try {
        const q = keywords.join(' ');
        const params = new URLSearchParams({
          q,
          limit: String(Math.min(limit, 50)),
        });

        const res = await fetch(`https://clawhub.ai/api/v1/search?${params}`, {
          headers: { 'User-Agent': 'OpenClaw/1.0' },
        });

        if (!res.ok) return `搜索失败 (${res.status})`;

        // The search API returns `results`, NOT `items` (which is used by the browse API)
        const data = (await res.json()) as {
          results?: Array<{ slug?: string; displayName?: string; summary?: string | null }>;
        };

        const items = (data.results ?? []).map((item) => ({
          slug: item.slug ?? '',
          displayName: item.displayName ?? item.slug ?? '',
          summary: (item.summary ?? '').slice(0, 120),
        }));

        return JSON.stringify(items);
      } catch (e) {
        return `搜索出错: ${(e as Error).message}`;
      }
    },
    {
      name: 'search_skills',
      description:
        '在 ClawHub 在线技能库中搜索技能，支持中英文关键词。可以多次调用，每次使用不同关键词获取更全面的候选。',
      schema: z.object({
        keywords: z.array(z.string()).describe('搜索关键词列表，例如 ["bilibili", "bili", "视频"]'),
        limit: z.number().optional().default(25).describe('返回结果数量，最多 50'),
      }),
    },
  );

  // ── Agent ──────────────────────────────────────────────────────────────────
  const agent = createDeepAgent({
    model,
    tools: [searchSkills],
    systemPrompt: `你是 OpenClaw AI Agent 框架的技能推荐引擎。

工作流程：
1. 根据用户需求，提取 1-3 个精准的搜索关键词（优先用英文，因为大多数技能名称是英文）。
2. 调用 search_skills 工具搜索。如果第一次搜索已返回相关结果，直接进入第3步，不要再继续搜索。
3. 最多搜索 2 次，之后必须立即输出结果，不得继续调用工具。
4. 从搜索结果中选出最匹配用户需求的技能，只返回纯 JSON 数组（不包含 markdown 代码块或任何其他文字）：
   [{"slug":"xxx","displayName":"xxx","reason":"中文解释（1-2句，说明为何匹配）","score":0.9}]

规则：只保留 score > 0.5 的条目，按 score 降序排列，最多返回 5 条。
如果未找到相关技能，返回空数组：[]`,
  });

  // ── SSE stream ─────────────────────────────────────────────────────────────
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SSEEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        let searchCount = 0;
        const MAX_SEARCHES = 3; // hard server-side cap
        let finalContent = '';

        const eventStream = (
          agent as {
            streamEvents: (
              input: { messages: { role: string; content: string }[] },
              options: { version: string },
            ) => AsyncIterable<{
              event: string;
              name: string;
              data: Record<string, unknown>;
            }>;
          }
        ).streamEvents({ messages: [{ role: 'user', content: query }] }, { version: 'v2' });

        for await (const { event: type, name, data } of eventStream) {
          if (type === 'on_tool_start' && name === 'search_skills') {
            searchCount++;
            if (searchCount > MAX_SEARCHES) continue; // hard cap — skip excess calls

            const args = parseToolArgs(data?.input);
            const keywords = (args.keywords as string[]) ?? [];
            send({ type: 'search_start', step: searchCount, keywords });
          }

          if (type === 'on_tool_end' && name === 'search_skills') {
            const count = countToolResults(data?.output);
            send({ type: 'search_end', step: searchCount, count });
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
