import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { SSHConn } from '@/lib/ssh-utils';

export type { SSHConn };

// ── Migration from legacy localStorage format ─────────────────────────────────

const LEGACY_KEY = 'openclaw_ssh_connections';

function readLegacyConnections(): SSHConn[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((c): c is SSHConn => !!c?.id && !!c?.host)
      .map((c) => ({ ...c, gatewayPort: c.gatewayPort ?? '18789' }));
  } catch {
    return [];
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface ConnectionStore {
  connections: SSHConn[];
  /** 'local' or a connection id */
  selectedConnId: string;

  setSelectedConnId: (id: string) => void;
  addConnection: (data: Omit<SSHConn, 'id' | 'createdAt'>) => SSHConn;
  updateConnection: (id: string, patch: Partial<Omit<SSHConn, 'id' | 'createdAt'>>) => void;
  removeConnection: (id: string) => void;
}

export const useConnectionStore = create<ConnectionStore>()(
  persist(
    (set) => ({
      // Initial connections: read from the legacy key on first-ever load.
      // Once the new store key is written, this is ignored in favour of persisted data
      // (handled by the custom `merge` below).
      connections: readLegacyConnections(),
      selectedConnId: 'local',

      setSelectedConnId: (id) => set({ selectedConnId: id }),

      addConnection: (data) => {
        const conn: SSHConn = { ...data, id: crypto.randomUUID(), createdAt: Date.now() };

        set((s) => ({ connections: [...s.connections, conn] }));

        return conn;
      },

      updateConnection: (id, patch) =>
        set((s) => ({
          connections: s.connections.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),

      removeConnection: (id) =>
        set((s) => ({
          connections: s.connections.filter((c) => c.id !== id),
          // Revert to local if the selected connection is deleted
          selectedConnId: s.selectedConnId === id ? 'local' : s.selectedConnId,
        })),
    }),
    {
      name: 'openclaw_connections',
      // Only persist the connections list; selectedConnId always resets to 'local' on load
      // so users don't return to a stale remote connection after restart.
      partialize: (state) => ({ connections: state.connections }),
      // Custom merge: if the persisted store is empty, preserve the legacy-migrated
      // connections from the initial state so existing data survives the migration.
      merge: (persisted, current) => {
        const p = persisted as Partial<ConnectionStore>;

        if (!p.connections?.length) {
          return { ...current, ...p, connections: current.connections };
        }

        return { ...current, ...p };
      },
    },
  ),
);

// ── Selector helpers ──────────────────────────────────────────────────────────

/** Returns the currently selected SSHConn, or null when 'local' is selected. */
export const selectActiveConn = (s: ConnectionStore): SSHConn | null =>
  s.connections.find((c) => c.id === s.selectedConnId) ?? null;
