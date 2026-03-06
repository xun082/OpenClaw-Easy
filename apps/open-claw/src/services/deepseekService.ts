/**
 * DeepSeek service — client-side utilities only.
 *
 * The actual AI agent logic lives in the Next.js API route:
 *   POST /api/skills/recommend
 *
 * This file handles:
 *   - API key storage in localStorage (renderer-side only)
 *   - Shared TypeScript types used by the frontend components
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const KEY_STORAGE = 'openclaw_deepseek_api_key';

// ── Key management ────────────────────────────────────────────────────────────

export function getApiKey(): string {
  if (typeof localStorage === 'undefined') return '';

  return localStorage.getItem(KEY_STORAGE) ?? '';
}

export function saveApiKey(key: string): void {
  if (typeof localStorage === 'undefined') return;

  if (key.trim()) {
    localStorage.setItem(KEY_STORAGE, key.trim());
  } else {
    localStorage.removeItem(KEY_STORAGE);
  }
}

export function clearApiKey(): void {
  if (typeof localStorage === 'undefined') return;

  localStorage.removeItem(KEY_STORAGE);
}

// ── Shared types (also exported from the API route, mirrored here for the client) ──

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
