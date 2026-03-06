import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ── UI state that benefits from persistence (panel layout) ────────────────────

interface ConfigPageStore {
  // Persistent across navigations
  showPreview: boolean;
  panelWidth: number;

  // Transient per-session
  expandedProviders: Record<string, boolean>;
  showKeys: Record<string, boolean>;
  showGatewayToken: boolean;
  showGatewayPassword: boolean;
  providerPickerOpen: boolean;

  // Actions
  setShowPreview: (v: boolean | ((p: boolean) => boolean)) => void;
  setPanelWidth: (v: number) => void;
  toggleProvider: (name: string) => void;
  setExpandedProviders: (
    v: Record<string, boolean> | ((p: Record<string, boolean>) => Record<string, boolean>),
  ) => void;
  toggleShowKey: (name: string) => void;
  setShowGatewayToken: (v: boolean | ((p: boolean) => boolean)) => void;
  setShowGatewayPassword: (v: boolean | ((p: boolean) => boolean)) => void;
  setProviderPickerOpen: (v: boolean | ((p: boolean) => boolean)) => void;
}

export const useConfigPageStore = create<ConfigPageStore>()(
  persist(
    (set) => ({
      showPreview: true,
      panelWidth: 380,
      expandedProviders: {},
      showKeys: {},
      showGatewayToken: false,
      showGatewayPassword: false,
      providerPickerOpen: false,

      setShowPreview: (v) =>
        set((s) => ({ showPreview: typeof v === 'function' ? v(s.showPreview) : v })),

      setPanelWidth: (v) => set({ panelWidth: v }),

      toggleProvider: (name) =>
        set((s) => ({
          expandedProviders: { ...s.expandedProviders, [name]: !s.expandedProviders[name] },
        })),

      setExpandedProviders: (v) =>
        set((s) => ({
          expandedProviders: typeof v === 'function' ? v(s.expandedProviders) : v,
        })),

      toggleShowKey: (name) =>
        set((s) => ({ showKeys: { ...s.showKeys, [name]: !s.showKeys[name] } })),

      setShowGatewayToken: (v) =>
        set((s) => ({ showGatewayToken: typeof v === 'function' ? v(s.showGatewayToken) : v })),

      setShowGatewayPassword: (v) =>
        set((s) => ({
          showGatewayPassword: typeof v === 'function' ? v(s.showGatewayPassword) : v,
        })),

      setProviderPickerOpen: (v) =>
        set((s) => ({
          providerPickerOpen: typeof v === 'function' ? v(s.providerPickerOpen) : v,
        })),
    }),
    {
      name: 'openclaw-config-page-ui',
      // Only persist layout prefs, not transient toggles
      partialize: (state) => ({
        showPreview: state.showPreview,
        panelWidth: state.panelWidth,
      }),
    },
  ),
);
