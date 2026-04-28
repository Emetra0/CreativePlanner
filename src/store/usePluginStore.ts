import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Plugin {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  installed: boolean;
  icon: string;
  /** If true, only visible and usable by admin users */
  adminOnly?: boolean;
}

// Source-of-truth catalogue. New entries here will automatically appear
// for existing users (with defaults) while preserving their saved preferences.
export const BUILTIN_PLUGINS: Plugin[] = [
  {
    id: 'collabora-office',
    name: 'Collabora Office',
    description: 'Adds the full Collabora office extension to the planner app, including Documents, Spreadsheets, and Presentations in the existing workspace shell.',
    enabled: false,
    installed: false,
    icon: 'Layers',
  },
  {
    id: 'todo-integration',
    name: 'Todo Integration',
    description: 'Embed a todo task panel directly inside the Mindmap editor. Link tasks to specific nodes and track progress without leaving your mindmap.',
    enabled: false,
    installed: false,
    icon: 'CheckSquare',
  },
  {
    id: 'storytelling',
    name: 'Creative Suite',
    description: 'Unlocks two tabs: Brainstorming (visual idea tools — colour palettes, colour theory harmonies, and quick inspiration prompts focused on design and visual creativity) and Storytelling (narrative writing tools — story prompts, character generators, plot arc templates, world building sparks, and an inspiration moodboard).',
    enabled: false,
    installed: false,
    icon: 'BookOpen',
  },
  {
    id: 'planner',
    name: 'Planner',
    description: 'Session-based project planner with date scheduling, live timer, and a work log to record real time spent.',
    enabled: false,
    installed: false,
    icon: 'ClipboardList',
  },
  {
    id: 'todo-app',
    name: 'Todo',
    description: 'Task management with priorities, tags, due dates, and project assignment.',
    enabled: false,
    installed: false,
    icon: 'CheckSquare',
  },
  {
    id: 'user-statistics',
    name: 'User Statistics',
    description: 'Admin-only panel: view active users, plugin adoption, app request volume, and platform-wide activity. Also adds a summary banner to your Dashboard.',
    enabled: false,
    installed: false,
    icon: 'BarChart2',
    adminOnly: true,
  },
];

/** Merge saved plugin prefs with the current catalogue.
 *  - Existing entries: keep saved installed/enabled values.
 *  - New entries not yet in saved data: use catalogue defaults.
 *  - Removed entries: dropped.
 */
function mergeWithDefaults(saved: Plugin[]): Plugin[] {
  return BUILTIN_PLUGINS.map((def) => {
    const saved_ = saved.find((p) => p.id === def.id);
    const legacyCollaboraPlugins = saved.filter((p) =>
      p.id === 'collabora-documents' || p.id === 'collabora-spreadsheets' || p.id === 'collabora-presentations'
    );

    if (def.id === 'collabora-office' && !saved_) {
      const installed = legacyCollaboraPlugins.some((plugin) => plugin.installed);
      const enabled = legacyCollaboraPlugins.some((plugin) => plugin.enabled);
      return installed || enabled ? { ...def, installed, enabled } : def;
    }

    // Always keep catalogue-defined adminOnly (user cannot override it via saved state)
    return saved_ ? { ...def, installed: saved_.installed, enabled: saved_.enabled } : def;
  });
}

interface PluginState {
  plugins: Plugin[];
  /** Merge an array from external storage (file) with catalogue defaults */
  mergePlugins: (saved: Plugin[]) => void;
  installPlugin: (id: string) => void;
  uninstallPlugin: (id: string) => void;
  togglePlugin: (id: string) => void;
}

export const usePluginStore = create<PluginState>()(
  persist(
    (set) => ({
      plugins: BUILTIN_PLUGINS,
      mergePlugins: (saved) =>
        set({ plugins: mergeWithDefaults(saved) }),
      installPlugin: (id) =>
        set((state) => ({
          plugins: state.plugins.map((p) =>
            p.id === id ? { ...p, installed: true, enabled: true } : p
          ),
        })),
      uninstallPlugin: (id) =>
        set((state) => ({
          plugins: state.plugins.map((p) =>
            p.id === id ? { ...p, installed: false, enabled: false } : p
          ),
        })),
      togglePlugin: (id) =>
        set((state) => ({
          plugins: state.plugins.map((p) =>
            p.id === id ? { ...p, enabled: !p.enabled } : p
          ),
        })),
    }),
    {
      name: 'creative-planner-plugins',
      // When rehydrating from localStorage, merge saved prefs with the
      // current catalogue so new plugins always appear with correct defaults.
      merge: (persisted, current) => ({
        ...current,
        plugins: mergeWithDefaults(
          ((persisted as any)?.plugins as Plugin[]) ?? []
        ),
      }),
    }
  )
);
