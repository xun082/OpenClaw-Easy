import { create } from 'zustand';

import type { OpenclawModelEntry, ProviderConfig } from '@/lib/openclaw-providers';
import {
  APIS_REQUIRING_MODELS,
  LEGACY_API_MAP,
  PROVIDER_MODELS,
  resolveModelListKey,
} from '@/lib/openclaw-providers';

// ─── Per-model alias / capability override (agents.defaults.models) ───────────

export interface AgentModelConfig {
  alias?: string;
  [key: string]: unknown;
}

// ─── Agent route binding ───────────────────────────────────────────────────────

export interface AgentBindingPeer {
  kind: 'private' | 'group' | 'channel';
  id?: string;
}

export interface AgentBinding {
  agentId: string;
  match: {
    channel: string;
    peer?: AgentBindingPeer;
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OpenclawConfig {
  meta?: Record<string, unknown>;
  env?: Record<string, string>;
  gateway?: {
    mode?: 'local' | 'remote';
    port?: number;
    auth?: {
      mode?: 'none' | 'token' | 'password' | 'trusted-proxy';
      token?: string;
      password?: string;
    };
    reload?: { mode?: 'hybrid' | 'off' };
  };
  canvasHost?: {
    enabled?: boolean;
    port?: number;
  };
  models?: {
    mode?: 'merge' | 'replace';
    providers?: Record<string, ProviderConfig>;
  };
  agents?: {
    defaults?: {
      workspace?: string;
      contextPruning?: { mode?: 'cache-ttl' | 'off' };
      model?: { primary?: string };
      compaction?: { mode?: string };
      /** Per-model alias / capability overrides, keyed by "provider/modelId". */
      models?: Record<string, AgentModelConfig>;
    };
    /** Configured agent instances (from openclaw.json agents.list) */
    list?: Array<{
      id: string;
      name?: string;
      workspace?: string;
      agentDir?: string;
      model?: { primary?: string };
    }>;
  };
  bindings?: AgentBinding[];
  tools?: {
    agentToAgent?: {
      enabled?: boolean;
      allow?: string[];
    };
  };
  channels?: {
    whatsapp?: {
      groupPolicy?: 'open' | 'allowlist';
      allowFrom?: string[];
      groups?: Record<string, { requireMention?: boolean }>;
    };
  };
  messages?: {
    groupChat?: { mentionPatterns?: string[] };
  };
  [key: string]: unknown;
}

export type SaveStatus = 'idle' | 'saving' | 'reloading' | 'saved' | 'saved-no-gateway' | 'error';

export interface RestartLog {
  output: string;
  success: boolean;
  visible: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const EMPTY_CONFIG: OpenclawConfig = {
  meta: {},
  env: {},
  gateway: {
    mode: 'local',
    port: 18789,
    auth: { mode: 'none' },
    reload: { mode: 'hybrid' },
  },
  canvasHost: { enabled: true, port: 18793 },
  models: { mode: 'merge', providers: {} },
  agents: {
    defaults: {
      workspace: '',
      contextPruning: { mode: 'off' },
    },
  },
  channels: {
    whatsapp: {
      groupPolicy: 'open',
      allowFrom: [],
      groups: { '*': { requireMention: true } },
    },
  },
  messages: {
    groupChat: { mentionPatterns: ['@openclaw'] },
  },
};

// ─── Config normalization ────────────────────────────────────────────────────

export function normalizeConfig(cfg: OpenclawConfig): OpenclawConfig {
  // Ensure gateway.mode is always set — required field since openclaw 2026.3.x
  if (!cfg.gateway?.mode) {
    cfg = { ...cfg, gateway: { mode: 'local', ...cfg.gateway } };
  }

  // Ensure auth.mode is always set — prevents gateway from auto-generating a token
  if (!cfg.gateway?.auth?.mode) {
    cfg = {
      ...cfg,
      gateway: { ...cfg.gateway, auth: { mode: 'none', ...cfg.gateway?.auth } },
    };
  }

  // Clean bindings — strip peer when id is missing (peer.id is required by schema
  // when peer is present), and drop any binding that has no agentId.
  if (Array.isArray(cfg.bindings)) {
    cfg = {
      ...cfg,
      bindings: cfg.bindings
        .filter((b) =>
          (b.agentId ?? (b as unknown as Record<string, unknown>)['agentid'] ?? '')
            .toString()
            .trim(),
        )
        .map((b) => {
          // Migrate legacy agentid → agentId
          const agentId = (b.agentId ?? (b as unknown as Record<string, unknown>)['agentid'] ?? '')
            .toString()
            .trim();

          return {
            agentId,
            match: {
              channel: b.match.channel,
              // Only include peer when id is present and non-empty; peer without id is rejected by schema
              ...(b.match.peer?.id?.trim()
                ? { peer: { kind: b.match.peer.kind, id: b.match.peer.id.trim() } }
                : {}),
            },
          };
        }),
    };
  }

  // Clean tools.agentToAgent — strip empty strings from allow list
  if (cfg.tools?.agentToAgent) {
    const a2a = cfg.tools.agentToAgent;
    cfg = {
      ...cfg,
      tools: {
        ...cfg.tools,
        agentToAgent: {
          ...a2a,
          ...(Array.isArray(a2a.allow) ? { allow: a2a.allow.filter((a) => a.trim()) } : {}),
        },
      },
    };
  }

  // Migrate legacy agenttoagent → agentToAgent
  if (cfg.tools && (cfg.tools as Record<string, unknown>)['agenttoagent']) {
    const rawTools = cfg.tools as Record<string, unknown>;
    const legacy = rawTools['agenttoagent'] as { enabled?: boolean; allow?: string[] };
    const { agenttoagent: _removed, ...restTools } = rawTools;
    void _removed;
    cfg = {
      ...cfg,
      tools: { ...restTools, agentToAgent: legacy } as typeof cfg.tools,
    };
  }

  if (!cfg.models?.providers) return cfg;

  const providers: Record<string, ProviderConfig> = {};

  for (const [key, p] of Object.entries(cfg.models.providers)) {
    const rawApi = (p as ProviderConfig).api ?? '';
    const migratedApi = LEGACY_API_MAP[rawApi] ?? rawApi;
    const rawModels = (p as ProviderConfig).models;
    // OpenClaw requires models to be objects with { id, name, ... }.
    // Strip any legacy string entries that would cause gateway validation errors.
    const cleanModels = Array.isArray(rawModels)
      ? (rawModels as unknown[]).filter(
          (m): m is OpenclawModelEntry =>
            m !== null &&
            typeof m === 'object' &&
            typeof (m as Record<string, unknown>).id === 'string',
        )
      : undefined;
    providers[key] = {
      ...(p as ProviderConfig),
      api: migratedApi,
      ...(cleanModels && cleanModels.length > 0 ? { models: cleanModels } : {}),
    };
  }

  // Auto-populate models for APIs that require them when models are missing.
  // This prevents the gateway from failing validation with "expected array, received undefined".
  for (const key of Object.keys(providers)) {
    const p = providers[key];

    if (APIS_REQUIRING_MODELS.has(p.api) && (!p.models || p.models.length === 0)) {
      const listKey = resolveModelListKey(key, p);
      const catalog = listKey ? (PROVIDER_MODELS[listKey] ?? []) : [];

      if (catalog.length > 0) {
        providers[key] = {
          ...p,
          models: catalog.map((m) => ({ id: m.id, name: m.name })),
        };
      }
    }
  }

  const normalizedCfg: OpenclawConfig = { ...cfg, models: { ...cfg.models, providers } };

  // Validate model.primary — must be "provider/model". Clear anything invalid.
  const primary = normalizedCfg.agents?.defaults?.model?.primary;

  if (typeof primary === 'string') {
    const trimmed = primary.endsWith('/') ? primary.slice(0, -1) : primary;
    const isValid = trimmed.includes('/') && trimmed.split('/')[1] !== '';

    if (!isValid && normalizedCfg.agents?.defaults) {
      const defaults = { ...normalizedCfg.agents.defaults };
      delete defaults.model;
      normalizedCfg.agents = { ...normalizedCfg.agents, defaults };
    } else if (trimmed !== primary && normalizedCfg.agents?.defaults?.model) {
      normalizedCfg.agents = {
        ...normalizedCfg.agents,
        defaults: { ...normalizedCfg.agents.defaults, model: { primary: trimmed } },
      };
    }
  }

  return normalizedCfg;
}

// ─── Store ───────────────────────────────────────────────────────────────────

interface ConfigStore {
  // ── Data state ──────────────────────────────────────────────────────────
  config: OpenclawConfig | null;
  savedConfig: OpenclawConfig | null;
  configPath: string;

  // ── Loading / save state ─────────────────────────────────────────────────
  loading: boolean;
  exists: boolean;
  saveStatus: SaveStatus;
  errorMsg: string;
  restartLog: RestartLog | null;

  // ── Core actions ─────────────────────────────────────────────────────────
  loadConfig: () => Promise<void>;
  saveConfig: () => Promise<void>;

  /** Apply an immutable update to the working config. */
  mutate: (updater: (prev: OpenclawConfig) => OpenclawConfig) => void;

  /** True when normalizeConfig changed the loaded config — disk still has the old version. */
  autoNormalized: boolean;

  /** Replace the working config without touching savedConfig (used for init). */
  setConfig: (config: OpenclawConfig | null) => void;
  setSavedConfig: (config: OpenclawConfig | null) => void;
  setRestartLog: (log: RestartLog | null) => void;
  setSaveStatus: (status: SaveStatus) => void;
  initWithEmpty: () => void;

  // ── Specific mutation helpers ─────────────────────────────────────────────

  // Gateway
  setGatewayPort: (port: number) => void;
  setGatewayAuthMode: (mode: 'none' | 'token' | 'password' | 'trusted-proxy') => void;
  setGatewayAuthToken: (token: string) => void;
  setGatewayAuthPassword: (password: string) => void;
  setGatewayReloadMode: (mode: 'hybrid' | 'off') => void;

  // Canvas
  setCanvasEnabled: (enabled: boolean) => void;
  setCanvasPort: (port: number) => void;

  // Models
  setModelsMode: (mode: 'merge' | 'replace') => void;
  updateProvider: (name: string, patch: Partial<ProviderConfig>) => void;
  removeProvider: (name: string) => void;
  addProvider: (name: string, base: ProviderConfig) => void;
  addProviderModel: (providerName: string, model: OpenclawModelEntry) => void;
  removeProviderModel: (providerName: string, modelId: string) => void;

  // Agents
  setAgentWorkspace: (workspace: string) => void;
  setContextPruningMode: (mode: 'cache-ttl' | 'off') => void;
  setAgentDefaultModel: (primary: string) => void;

  // Agent model aliases
  addAgentModelEntry: (key: string, alias: string) => void;
  updateAgentModelEntry: (key: string, patch: Partial<AgentModelConfig>) => void;
  removeAgentModelEntry: (key: string) => void;

  // Channels / Messages
  setWaGroupPolicy: (groupPolicy: 'open' | 'allowlist') => void;
  setWaAllowFrom: (allowFrom: string[]) => void;
  setWaRequireMention: (requireMention: boolean) => void;
  setMentionPatterns: (patterns: string[]) => void;

  // Env vars
  setEnvVar: (oldKey: string, newKey: string, val: string) => void;
  addEnvVar: () => void;
  removeEnvVar: (key: string) => void;

  // Bindings
  addBinding: () => void;
  updateBinding: (idx: number, patch: Partial<AgentBinding>) => void;
  updateBindingMatch: (
    idx: number,
    patch: { channel?: string; peer?: Partial<AgentBindingPeer> },
  ) => void;
  removeBinding: (idx: number) => void;

  // Agent-to-agent tools
  setAgentToAgentEnabled: (enabled: boolean) => void;
  setAgentToAgentAllow: (allow: string[]) => void;
}

const isElectronEnv = () =>
  typeof window !== 'undefined' && typeof window.api?.readOpenclawConfig === 'function';

export const useConfigStore = create<ConfigStore>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  config: null,
  savedConfig: null,
  configPath: '',
  loading: false,
  exists: false,
  saveStatus: 'idle',
  errorMsg: '',
  restartLog: null,
  autoNormalized: false,

  // ── Core actions ──────────────────────────────────────────────────────────

  loadConfig: async () => {
    set({ loading: true, saveStatus: 'idle', errorMsg: '' });

    try {
      const res = await window.api.readOpenclawConfig();
      set({ configPath: res.path });

      if (res.success && res.content) {
        try {
          const rawParsed = JSON.parse(res.content) as OpenclawConfig;
          const normalized = normalizeConfig(rawParsed);
          // If normalizeConfig changed anything (e.g. stripped invalid id:""),
          // keep the raw version as savedConfig so isDirty=true and the user
          // can save the cleaned version to disk to restore the gateway.
          const wasNormalized = JSON.stringify(rawParsed) !== JSON.stringify(normalized);
          set({
            config: normalized,
            savedConfig: wasNormalized ? rawParsed : normalized,
            exists: true,
            autoNormalized: wasNormalized,
          });
        } catch {
          set({ config: EMPTY_CONFIG, savedConfig: EMPTY_CONFIG, exists: true });
        }
      } else {
        set({ exists: false, config: null, savedConfig: null });
        if (res.error !== 'not-found') set({ errorMsg: res.error ?? '读取失败' });
      }
    } finally {
      set({ loading: false });
    }
  },

  saveConfig: async () => {
    const { config } = get();
    if (!config || !isElectronEnv()) return;

    const configJson = JSON.stringify(config, null, 2);

    set({ saveStatus: 'saving', errorMsg: '' });

    try {
      const res = await window.api.writeOpenclawConfig(configJson);

      if (!res.success) {
        set({ errorMsg: res.error ?? '保存失败', saveStatus: 'error' });

        return;
      }

      set({ savedConfig: config, exists: true, autoNormalized: false });

      // Sync apiKeys to agent auth-profiles.json
      if (config.models?.providers) {
        await window.api.syncAgentAuth(
          Object.fromEntries(
            Object.entries(config.models.providers).map(([k, v]) => [
              k,
              { apiKey: v.apiKey, api: v.api },
            ]),
          ),
        );
      }

      // Restart gateway
      set({ saveStatus: 'reloading' });

      try {
        const cmd = await window.api.restartGateway();
        const rawOutput = (cmd.output ?? '').trim();
        const displayOutput = cmd.success
          ? `✓ ${rawOutput || '网关已重启，新配置生效'}`
          : `✗ 网关启动失败\n${rawOutput}\n\n请在终端手动运行: openclaw gateway start`;

        set({
          restartLog: { output: displayOutput, success: cmd.success, visible: true },
          saveStatus: cmd.success ? 'saved' : 'saved-no-gateway',
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        set({
          restartLog: { output: msg, success: false, visible: true },
          saveStatus: 'saved-no-gateway',
        });
      }

      setTimeout(() => set({ saveStatus: 'idle' }), 6000);
    } catch {
      set({ errorMsg: '保存时发生未知错误', saveStatus: 'error' });
    }
  },

  mutate: (updater) =>
    set((state) => ({
      config: state.config ? updater(state.config) : state.config,
    })),

  setConfig: (config) => set({ config }),
  setSavedConfig: (savedConfig) => set({ savedConfig }),
  setRestartLog: (restartLog) => set({ restartLog }),
  setSaveStatus: (saveStatus) => set({ saveStatus }),

  initWithEmpty: () => set({ config: EMPTY_CONFIG, savedConfig: null, exists: true }),

  // ── Mutation helpers ──────────────────────────────────────────────────────

  setGatewayPort: (port) => get().mutate((p) => ({ ...p, gateway: { ...p.gateway, port } })),

  setGatewayAuthMode: (mode) =>
    get().mutate((p) => ({
      ...p,
      gateway: { ...p.gateway, auth: { ...p.gateway?.auth, mode } },
    })),

  setGatewayAuthToken: (token) =>
    get().mutate((p) => ({
      ...p,
      gateway: { ...p.gateway, auth: { ...p.gateway?.auth, token } },
    })),

  setGatewayAuthPassword: (password) =>
    get().mutate((p) => ({
      ...p,
      gateway: { ...p.gateway, auth: { ...p.gateway?.auth, password } },
    })),

  setGatewayReloadMode: (mode) =>
    get().mutate((p) => ({ ...p, gateway: { ...p.gateway, reload: { mode } } })),

  setCanvasEnabled: (enabled) =>
    get().mutate((p) => ({ ...p, canvasHost: { ...p.canvasHost, enabled } })),

  setCanvasPort: (port) => get().mutate((p) => ({ ...p, canvasHost: { ...p.canvasHost, port } })),

  setModelsMode: (mode) => get().mutate((p) => ({ ...p, models: { ...p.models, mode } })),

  updateProvider: (name, patch) =>
    get().mutate((p) => ({
      ...p,
      models: {
        ...p.models,
        providers: {
          ...p.models?.providers,
          [name]: { ...(p.models?.providers?.[name] ?? {}), ...patch } as ProviderConfig,
        },
      },
    })),

  removeProvider: (name) =>
    get().mutate((p) => {
      const ps = { ...p.models?.providers };
      delete ps[name];

      return { ...p, models: { ...p.models, providers: ps } };
    }),

  addProvider: (name, base) =>
    get().mutate((p) => ({
      ...p,
      models: {
        ...p.models,
        providers: { ...p.models?.providers, [name]: base },
      },
    })),

  addProviderModel: (providerName, model) =>
    get().mutate((p) => {
      const existing = p.models?.providers?.[providerName];
      if (!existing) return p;
      const currentModels = existing.models ?? [];
      if (currentModels.find((m) => m.id === model.id)) return p;
      return {
        ...p,
        models: {
          ...p.models,
          providers: {
            ...p.models?.providers,
            [providerName]: { ...existing, models: [...currentModels, model] },
          },
        },
      };
    }),

  removeProviderModel: (providerName, modelId) =>
    get().mutate((p) => {
      const existing = p.models?.providers?.[providerName];
      if (!existing) return p;
      return {
        ...p,
        models: {
          ...p.models,
          providers: {
            ...p.models?.providers,
            [providerName]: {
              ...existing,
              models: (existing.models ?? []).filter((m) => m.id !== modelId),
            },
          },
        },
      };
    }),

  setAgentWorkspace: (workspace) =>
    get().mutate((p) => ({
      ...p,
      agents: { ...p.agents, defaults: { ...p.agents?.defaults, workspace } },
    })),

  setContextPruningMode: (mode) =>
    get().mutate((p) => ({
      ...p,
      agents: {
        ...p.agents,
        defaults: { ...p.agents?.defaults, contextPruning: { mode } },
      },
    })),

  setAgentDefaultModel: (primary) =>
    get().mutate((p) => {
      const defaults = { ...p.agents?.defaults };

      if (!primary.trim() || !primary.includes('/') || !primary.split('/')[1]) {
        delete defaults.model;
      } else {
        defaults.model = { primary };
      }

      return { ...p, agents: { ...p.agents, defaults } };
    }),

  addAgentModelEntry: (key, alias) =>
    get().mutate((p) => ({
      ...p,
      agents: {
        ...p.agents,
        defaults: {
          ...p.agents?.defaults,
          models: { ...p.agents?.defaults?.models, [key]: { alias } },
        },
      },
    })),

  updateAgentModelEntry: (key, patch) =>
    get().mutate((p) => ({
      ...p,
      agents: {
        ...p.agents,
        defaults: {
          ...p.agents?.defaults,
          models: {
            ...p.agents?.defaults?.models,
            [key]: { ...(p.agents?.defaults?.models?.[key] ?? {}), ...patch },
          },
        },
      },
    })),

  removeAgentModelEntry: (key) =>
    get().mutate((p) => {
      const models = { ...p.agents?.defaults?.models };
      delete models[key];

      return {
        ...p,
        agents: {
          ...p.agents,
          defaults: { ...p.agents?.defaults, models },
        },
      };
    }),

  setWaGroupPolicy: (groupPolicy) =>
    get().mutate((p) => ({
      ...p,
      channels: { ...p.channels, whatsapp: { ...p.channels?.whatsapp, groupPolicy } },
    })),

  setWaAllowFrom: (allowFrom) =>
    get().mutate((p) => ({
      ...p,
      channels: { ...p.channels, whatsapp: { ...p.channels?.whatsapp, allowFrom } },
    })),

  setWaRequireMention: (requireMention) =>
    get().mutate((p) => ({
      ...p,
      channels: {
        ...p.channels,
        whatsapp: { ...p.channels?.whatsapp, groups: { '*': { requireMention } } },
      },
    })),

  setMentionPatterns: (mentionPatterns) =>
    get().mutate((p) => ({
      ...p,
      messages: { ...p.messages, groupChat: { ...p.messages?.groupChat, mentionPatterns } },
    })),

  setEnvVar: (oldKey, newKey, val) =>
    get().mutate((p) => {
      const env = Object.fromEntries(
        Object.entries(p.env ?? {}).map(([k, v]) => (k === oldKey ? [newKey, val] : [k, v])),
      );

      return { ...p, env };
    }),

  addEnvVar: () => get().mutate((p) => ({ ...p, env: { ...p.env, '': '' } })),

  removeEnvVar: (key) =>
    get().mutate((p) => {
      const env = { ...p.env };
      delete env[key];

      return { ...p, env };
    }),

  addBinding: () =>
    get().mutate((p) => ({
      ...p,
      // No peer object in initial binding — peer requires id which we don't have yet
      bindings: [...(p.bindings ?? []), { agentId: '', match: { channel: 'telegram' } }],
    })),

  updateBinding: (idx, patch) =>
    get().mutate((p) => {
      const bindings = [...(p.bindings ?? [])];
      bindings[idx] = { ...bindings[idx], ...patch };

      return { ...p, bindings };
    }),

  updateBindingMatch: (idx, patch) =>
    get().mutate((p) => {
      const bindings = [...(p.bindings ?? [])];
      const prev = bindings[idx];

      let newMatch: AgentBinding['match'];

      if (patch.peer !== undefined) {
        const prevPeer = prev.match.peer ?? { kind: 'group' as const };
        const merged = { ...prevPeer, ...patch.peer };

        // peer.id is required by schema when peer is present — drop peer if id is empty
        if (!merged.id?.trim()) {
          newMatch = {
            channel: patch.channel ?? prev.match.channel,
          };
        } else {
          newMatch = {
            channel: patch.channel ?? prev.match.channel,
            peer: merged as AgentBindingPeer,
          };
        }
      } else {
        newMatch = {
          ...prev.match,
          ...(patch.channel !== undefined ? { channel: patch.channel } : {}),
        };
      }

      bindings[idx] = { ...prev, match: newMatch };

      return { ...p, bindings };
    }),

  removeBinding: (idx) =>
    get().mutate((p) => ({
      ...p,
      bindings: (p.bindings ?? []).filter((_, i) => i !== idx),
    })),

  setAgentToAgentEnabled: (enabled) =>
    get().mutate((p) => ({
      ...p,
      tools: { ...p.tools, agentToAgent: { ...(p.tools?.agentToAgent ?? {}), enabled } },
    })),

  setAgentToAgentAllow: (allow) =>
    get().mutate((p) => ({
      ...p,
      tools: { ...p.tools, agentToAgent: { ...(p.tools?.agentToAgent ?? {}), allow } },
    })),
}));

// ─── Helper to auto-select first model for a provider ─────────────────────────

export function autoSelectModel(
  providerKey: string,
  providers: Record<string, ProviderConfig>,
): string {
  const provConfig = providers[providerKey];
  if (!provConfig) return `${providerKey}/`;

  const listKey = resolveModelListKey(providerKey, provConfig);
  const models = listKey ? (PROVIDER_MODELS[listKey] ?? []) : [];

  return models.length > 0 ? `${providerKey}/${models[0].id}` : `${providerKey}/`;
}
