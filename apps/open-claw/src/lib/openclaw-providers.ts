// ─── Provider / Model Constants for OpenClaw Config Editor ───────────────────
// These are extracted here so the config page stays focused on UI logic.

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OpenclawModelEntry {
  id: string;
  name: string;
  reasoning?: boolean;
  input?: string[];
  cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow?: number;
  maxTokens?: number;
}

export interface ProviderConfig {
  baseUrl: string;
  api: string;
  apiKey: string;
  authHeader: boolean;
  models?: OpenclawModelEntry[];
  [key: string]: unknown;
}

export interface ProviderPreset {
  id: string;
  name: string;
  description: string;
  api: string;
  baseUrl: string;
  authHeader: boolean;
  keyPlaceholder: string;
  color: string;
  /** Full model objects to write into the config for this preset. */
  fullModels?: OpenclawModelEntry[];
}

export interface ModelOption {
  id: string;
  name: string;
  desc?: string;
}

// ── API types accepted by the OpenClaw gateway (from validation error output) ──

export const API_OPTIONS = [
  'openai-completions',
  'openai-responses',
  'openai-codex-responses',
  'anthropic-messages',
  'google-generative-ai',
  'github-copilot',
  'bedrock-converse-stream',
  'ollama',
] as const;

// ── Migrate legacy / invalid api values to valid ones ─────────────────────────

export const LEGACY_API_MAP: Record<string, string> = {
  openai: 'openai-completions',
  'openai-compatible': 'openai-completions',
  'azure-openai': 'openai-completions',
  gemini: 'google-generative-ai',
  vertex: 'google-generative-ai',
  bedrock: 'bedrock-converse-stream',
};

// ── Kimi K2 full model definitions (shared by kimi-cn and moonshot presets) ──

const KIMI_K2_MODELS: OpenclawModelEntry[] = [
  {
    id: 'kimi-k2.5',
    name: 'Kimi K2.5',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 256000,
    maxTokens: 8192,
  },
  {
    id: 'kimi-k2-0905-preview',
    name: 'Kimi K2 0905 Preview',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 256000,
    maxTokens: 8192,
  },
  {
    id: 'kimi-k2-turbo-preview',
    name: 'Kimi K2 Turbo',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 256000,
    maxTokens: 8192,
  },
  {
    id: 'kimi-k2-thinking',
    name: 'Kimi K2 Thinking',
    reasoning: true,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 256000,
    maxTokens: 8192,
  },
  {
    id: 'kimi-k2-thinking-turbo',
    name: 'Kimi K2 Thinking Turbo',
    reasoning: true,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 256000,
    maxTokens: 8192,
  },
];

// ── Provider presets ──────────────────────────────────────────────────────────

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude 系列模型',
    api: 'anthropic-messages',
    baseUrl: 'https://api.anthropic.com',
    authHeader: true,
    keyPlaceholder: 'sk-ant-api03-...',
    color: '#D97706',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT / o 系列模型',
    api: 'openai-completions',
    baseUrl: 'https://api.openai.com/v1',
    authHeader: true,
    keyPlaceholder: 'sk-proj-...',
    color: '#10B981',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Gemini 系列模型（原生）',
    api: 'google-generative-ai',
    baseUrl: 'https://generativelanguage.googleapis.com',
    authHeader: true,
    keyPlaceholder: 'AIza...',
    color: '#3B82F6',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: '多模型统一入口',
    api: 'openai-completions',
    baseUrl: 'https://openrouter.ai/api/v1',
    authHeader: true,
    keyPlaceholder: 'sk-or-v1-...',
    color: '#8B5CF6',
  },
  {
    id: 'venice',
    name: 'Venice AI',
    description: '隐私优先推理',
    api: 'openai-completions',
    baseUrl: 'https://api.venice.ai/api/v1',
    authHeader: true,
    keyPlaceholder: 'venice-...',
    color: '#EC4899',
  },
  {
    id: 'kimi-code',
    name: 'Kimi Code',
    description: 'Kimi 编码专用 — 订阅制',
    api: 'openai-completions',
    baseUrl: 'https://api.kimi.com/coding/v1',
    authHeader: true,
    keyPlaceholder: 'sk-kimi-...',
    color: '#06B6D4',
    fullModels: KIMI_K2_MODELS,
  },
  {
    id: 'kimi-cn',
    name: 'Kimi (国内)',
    description: 'Moonshot 国内端点 — 按量计费',
    api: 'openai-completions',
    baseUrl: 'https://api.moonshot.cn/v1',
    authHeader: true,
    keyPlaceholder: 'sk-...',
    color: '#0891B2',
    fullModels: KIMI_K2_MODELS,
  },
  {
    id: 'moonshot',
    name: 'Moonshot (国际)',
    description: 'Moonshot 国际端点 — 需国际 Key',
    api: 'openai-completions',
    baseUrl: 'https://api.moonshot.ai/v1',
    authHeader: true,
    keyPlaceholder: 'sk-...',
    color: '#155E75',
    fullModels: KIMI_K2_MODELS,
  },
  {
    id: 'qwen',
    name: 'Qwen (阿里云)',
    description: '通义千问系列',
    api: 'openai-completions',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    authHeader: true,
    keyPlaceholder: 'sk-...',
    color: '#F59E0B',
  },
  {
    id: 'glm',
    name: 'GLM (智谱)',
    description: 'ChatGLM 系列模型',
    api: 'openai-completions',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    authHeader: true,
    keyPlaceholder: '...',
    color: '#6366F1',
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    description: 'MiniMax 按量计费',
    api: 'openai-completions',
    baseUrl: 'https://api.minimax.chat/v1',
    authHeader: true,
    keyPlaceholder: 'eyJ...',
    color: '#14B8A6',
  },
  {
    id: 'minimax-coding',
    name: 'MiniMax Coding',
    description: 'MiniMax 编码订阅制',
    api: 'openai-completions',
    baseUrl: 'https://api.minimaxi.com/v1',
    authHeader: true,
    keyPlaceholder: 'sk-...',
    color: '#0D9488',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: '本地模型运行',
    api: 'ollama',
    baseUrl: 'http://localhost:11434',
    authHeader: false,
    keyPlaceholder: 'ollama（留空即可）',
    color: '#64748B',
  },
  {
    id: 'bedrock',
    name: 'Amazon Bedrock',
    description: 'AWS 托管模型',
    api: 'bedrock-converse-stream',
    baseUrl: '',
    authHeader: false,
    keyPlaceholder: '使用 AWS 凭证',
    color: '#F97316',
  },
  {
    id: 'azure-openai',
    name: 'Azure OpenAI',
    description: 'Azure 托管 GPT',
    api: 'openai-completions',
    baseUrl: 'https://<resource>.openai.azure.com',
    authHeader: true,
    keyPlaceholder: '...',
    color: '#0EA5E9',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek V3 / R1',
    api: 'openai-completions',
    baseUrl: 'https://api.deepseek.com/v1',
    authHeader: true,
    keyPlaceholder: 'sk-...',
    color: '#2563EB',
  },
  {
    id: 'openclaw-proxy',
    name: 'OpenClaw Proxy',
    description: '本地代理（推荐）',
    api: 'anthropic-messages',
    baseUrl: 'http://127.0.0.1:8080/api',
    authHeader: true,
    keyPlaceholder: 'openclaw-secret-key',
    color: '#A855F7',
  },
];

// ── Model catalog per provider ────────────────────────────────────────────────

export const PROVIDER_MODELS: Record<string, ModelOption[]> = {
  anthropic: [
    { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', desc: '最强推理' },
    { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', desc: '性能均衡' },
    { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', desc: '轻量快速' },
    { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o', desc: '旗舰多模态' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', desc: '快速轻量' },
    { id: 'o4-mini', name: 'o4 Mini', desc: '高效推理' },
    { id: 'o3', name: 'o3', desc: '顶级推理' },
    { id: 'o3-mini', name: 'o3 Mini' },
    { id: 'o1', name: 'o1', desc: '深度推理' },
    { id: 'o1-mini', name: 'o1 Mini' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
  ],
  gemini: [
    { id: 'gemini-2.5-pro-preview-05-06', name: 'Gemini 2.5 Pro', desc: '旗舰推理' },
    { id: 'gemini-2.5-flash-preview-04-17', name: 'Gemini 2.5 Flash', desc: '快速高效' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
  ],
  openrouter: [
    { id: 'anthropic/claude-opus-4-5', name: 'Claude Opus 4.5', desc: 'Anthropic 旗舰' },
    { id: 'anthropic/claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
    { id: 'openai/gpt-4o', name: 'GPT-4o', desc: 'OpenAI 旗舰' },
    { id: 'openai/o3', name: 'o3', desc: '顶级推理' },
    { id: 'openai/o4-mini', name: 'o4 Mini' },
    { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', desc: '开源推理' },
    { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3' },
    { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B' },
    { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B' },
    { id: 'mistralai/mistral-large', name: 'Mistral Large' },
  ],
  venice: [
    { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', desc: '默认推荐' },
    { id: 'claude-opus-45', name: 'Claude Opus 4.5', desc: '最强任务' },
    { id: 'deepseek-r1', name: 'DeepSeek R1', desc: '推理优化' },
    { id: 'llama-3.1-405b', name: 'Llama 3.1 405B' },
  ],
  moonshot: [
    { id: 'kimi-k2.5', name: 'Kimi K2.5', desc: '旗舰推荐' },
    { id: 'kimi-k2-0905-preview', name: 'Kimi K2 0905 Preview' },
    { id: 'kimi-k2-turbo-preview', name: 'Kimi K2 Turbo', desc: '快速' },
    { id: 'kimi-k2-thinking', name: 'Kimi K2 Thinking', desc: '推理增强' },
    { id: 'kimi-k2-thinking-turbo', name: 'Kimi K2 Thinking Turbo' },
  ],
  'kimi-cn': [
    { id: 'kimi-k2.5', name: 'Kimi K2.5', desc: '旗舰推荐' },
    { id: 'kimi-k2-0905-preview', name: 'Kimi K2 0905 Preview' },
    { id: 'kimi-k2-turbo-preview', name: 'Kimi K2 Turbo', desc: '快速' },
    { id: 'kimi-k2-thinking', name: 'Kimi K2 Thinking', desc: '推理增强' },
    { id: 'kimi-k2-thinking-turbo', name: 'Kimi K2 Thinking Turbo' },
  ],
  'kimi-code': [
    { id: 'kimi-k2.5', name: 'Kimi K2.5', desc: '旗舰推荐' },
    { id: 'kimi-k2-0905-preview', name: 'Kimi K2 0905 Preview' },
    { id: 'kimi-k2-turbo-preview', name: 'Kimi K2 Turbo', desc: '快速' },
    { id: 'kimi-k2-thinking', name: 'Kimi K2 Thinking', desc: '推理增强' },
    { id: 'kimi-k2-thinking-turbo', name: 'Kimi K2 Thinking Turbo' },
  ],
  qwen: [
    { id: 'qwen-max', name: 'Qwen Max', desc: '旗舰' },
    { id: 'qwen-plus', name: 'Qwen Plus', desc: '均衡' },
    { id: 'qwen-turbo', name: 'Qwen Turbo', desc: '轻量' },
    { id: 'qwen2.5-72b-instruct', name: 'Qwen 2.5 72B' },
    { id: 'qwen2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder 32B' },
  ],
  glm: [
    { id: 'glm-z1', name: 'GLM-Z1', desc: '推理增强' },
    { id: 'glm-4', name: 'GLM-4', desc: '旗舰对话' },
    { id: 'glm-4-air', name: 'GLM-4 Air', desc: '轻量均衡' },
    { id: 'glm-4-flash', name: 'GLM-4 Flash', desc: '免费快速' },
  ],
  minimax: [
    { id: 'MiniMax-M2.5', name: 'MiniMax M2.5', desc: '最新旗舰' },
    { id: 'MiniMax-M2.5-highspeed', name: 'MiniMax M2.5 极速', desc: '极速版' },
    { id: 'MiniMax-M2.1', name: 'MiniMax M2.1' },
    { id: 'MiniMax-M2', name: 'MiniMax M2' },
    { id: 'MiniMax-Text-01', name: 'MiniMax Text-01', desc: '长文本' },
    { id: 'abab6.5s-chat', name: 'ABAB 6.5S' },
  ],
  'minimax-coding': [
    { id: 'MiniMax-M2.5', name: 'MiniMax M2.5', desc: '最新旗舰' },
    { id: 'MiniMax-M2.5-highspeed', name: 'MiniMax M2.5 极速', desc: '极速版' },
    { id: 'MiniMax-M2.1', name: 'MiniMax M2.1' },
    { id: 'MiniMax-M2', name: 'MiniMax M2' },
  ],
  ollama: [
    { id: 'deepseek-r1:7b', name: 'DeepSeek R1 7B', desc: '本地推理' },
    { id: 'deepseek-r1:14b', name: 'DeepSeek R1 14B' },
    { id: 'deepseek-r1:32b', name: 'DeepSeek R1 32B' },
    { id: 'qwen2.5:7b', name: 'Qwen 2.5 7B' },
    { id: 'qwen2.5:32b', name: 'Qwen 2.5 32B' },
    { id: 'llama3.3:70b', name: 'Llama 3.3 70B' },
    { id: 'llama3.1:8b', name: 'Llama 3.1 8B' },
    { id: 'phi4:14b', name: 'Phi-4 14B' },
    { id: 'mistral:7b', name: 'Mistral 7B' },
    { id: 'codellama:7b', name: 'CodeLlama 7B' },
  ],
  bedrock: [
    { id: 'anthropic.claude-opus-4-5-v1:0', name: 'Claude Opus 4.5' },
    { id: 'anthropic.claude-sonnet-4-5-v1:0', name: 'Claude Sonnet 4.5' },
    { id: 'anthropic.claude-3-5-haiku-20241022-v1:0', name: 'Claude 3.5 Haiku' },
    { id: 'amazon.nova-pro-v1:0', name: 'Amazon Nova Pro' },
    { id: 'amazon.nova-lite-v1:0', name: 'Amazon Nova Lite' },
  ],
  'azure-openai': [
    { id: 'gpt-4o', name: 'GPT-4o', desc: '根据部署名' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'o1', name: 'o1' },
    { id: 'o3-mini', name: 'o3 Mini' },
    { id: 'gpt-4', name: 'GPT-4' },
  ],
  'openclaw-proxy': [
    { id: 'deepseek-chat', name: 'DeepSeek V3', desc: '对话旗舰' },
    { id: 'deepseek-reasoner', name: 'DeepSeek R1', desc: '推理增强' },
    { id: 'claude-sonnet-4-5-20250514', name: 'Claude Sonnet 4.5' },
    { id: 'claude-opus-4-5-20250514', name: 'Claude Opus 4.5' },
  ],
  deepseek: [
    { id: 'deepseek-chat', name: 'DeepSeek V3 (deepseek-chat)', desc: '对话旗舰' },
    { id: 'deepseek-reasoner', name: 'DeepSeek R1 (deepseek-reasoner)', desc: '推理增强' },
  ],
};

// ── Resolve which PROVIDER_MODELS entry to use for a given configured provider ─
// Priority: baseUrl domain (most specific) > preset key name > api type fallback.
// This ensures "openai" provider pointing to api.deepseek.com shows DeepSeek models.

export function resolveModelListKey(providerKey: string, providerConfig: ProviderConfig): string {
  const u = (providerConfig.baseUrl ?? '').toLowerCase();

  if (u.includes('deepseek.com')) return 'deepseek';
  if (u.includes('api.kimi.com')) return 'kimi-code';
  if (u.includes('moonshot.cn') || u.includes('moonshot.ai')) return 'moonshot';
  if (u.includes('bigmodel.cn')) return 'glm';
  if (u.includes('minimaxi.com')) return 'minimax-coding';
  if (u.includes('minimax.chat')) return 'minimax';
  if (u.includes('dashscope.aliyuncs.com')) return 'qwen';
  if (u.includes('venice.ai')) return 'venice';
  if (u.includes('openrouter.ai')) return 'openrouter';
  if (u.includes('11434')) return 'ollama';
  if (u.includes('anthropic.com')) return 'anthropic';
  if (u.includes('openai.com')) return 'openai';
  if (u.includes('googleapis.com') || u.includes('generativelanguage')) return 'gemini';
  if (u.includes('azure.com') || u.includes('cognitiveservices')) return 'azure-openai';
  if (u.includes('amazonaws.com')) return 'bedrock';

  if (PROVIDER_MODELS[providerKey]) return providerKey;

  const apiToKey: Record<string, string> = {
    'anthropic-messages': 'anthropic',
    openai: 'openai',
    bedrock: 'bedrock',
    gemini: 'gemini',
    vertex: 'gemini',
    'azure-openai': 'azure-openai',
  };

  return apiToKey[providerConfig.api] ?? '';
}
