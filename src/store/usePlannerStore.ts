import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PlannerWeekMode = 'weekdays' | 'weekdays-weekends';

export const MIN_VISIBLE_DAY_COUNT = 1;
export const MAX_VISIBLE_DAY_COUNT = 30;

export interface PlannerPlanItem {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  notes?: string;
  color: string;
  plannedDate: string;
  plannedStart: string;
  plannedEnd: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlannerLogOverride {
  id: string;
  planItemId: string;
  projectId: string;
  actualDate: string;
  actualStart: string;
  actualEnd: string;
  actualTitle?: string;
  actualNotes?: string;
  replacementNote?: string;
  updatedAt: string;
}

export interface PlannerExtraLogItem {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  notes?: string;
  color: string;
  actualDate: string;
  actualStart: string;
  actualEnd: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlannerProjectSettings {
  weekMode: PlannerWeekMode;
  visibleDayCount: number;
  sidebarCategory?: string;
}

export function sessionTodayString(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function elapsedMinutes(timerStartedAt: number): number {
  return Math.round((Date.now() - timerStartedAt) / 60000);
}

export function timeStringToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours * 60) + minutes;
}

export function minutesToTimeString(value: number): string {
  const normalized = Math.max(0, Math.min(24 * 60, value));
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function getDurationMinutes(start: string, end: string): number {
  return Math.max(30, timeStringToMinutes(end) - timeStringToMinutes(start));
}

const DEFAULT_ITEM_COLOR = '#6366f1';

const createId = () => Math.random().toString(36).slice(2, 11);

const ensureTimeWindow = (start?: string, end?: string, plannedMinutes = 60) => {
  const normalizedStart = start || '09:00';
  if (end) {
    return { start: normalizedStart, end };
  }

  return {
    start: normalizedStart,
    end: minutesToTimeString(timeStringToMinutes(normalizedStart) + Math.max(30, plannedMinutes || 60)),
  };
};

interface LegacyTimeLogEntry {
  id: string;
  minutesSpent: number;
  notes: string;
  loggedAt: string;
}

interface LegacyPlannerSession {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  description?: string;
  plannedDate: string;
  startTime?: string;
  endTime?: string;
  plannedMinutes: number;
  actualMinutes?: number;
  logs?: LegacyTimeLogEntry[];
  createdAt: string;
}

interface PlannerState {
  planItems: PlannerPlanItem[];
  logOverrides: PlannerLogOverride[];
  extraLogItems: PlannerExtraLogItem[];
  projectCategories: string[];
  projectSettings: Record<string, PlannerProjectSettings>;
  setProjectWeekMode: (projectId: string, mode: PlannerWeekMode) => void;
  setProjectVisibleDayCount: (projectId: string, visibleDayCount: number) => void;
  setProjectSidebarCategory: (projectId: string, category?: string) => void;
  addProjectCategory: (category: string) => void;
  addPlanItem: (projectId: string, projectName: string, input: {
    title: string;
    notes?: string;
    color?: string;
    plannedDate: string;
    plannedStart: string;
    plannedEnd: string;
  }) => string;
  updatePlanItem: (id: string, updates: Partial<Omit<PlannerPlanItem, 'id' | 'projectId' | 'createdAt'>>) => void;
  deletePlanItem: (id: string) => void;
  upsertLogOverride: (planItemId: string, updates: Partial<Omit<PlannerLogOverride, 'id' | 'planItemId' | 'projectId' | 'updatedAt'>>) => void;
  resetLogOverride: (planItemId: string) => void;
  addExtraLogItem: (projectId: string, projectName: string, input: {
    title: string;
    notes?: string;
    color?: string;
    actualDate: string;
    actualStart: string;
    actualEnd: string;
  }) => string;
  updateExtraLogItem: (id: string, updates: Partial<Omit<PlannerExtraLogItem, 'id' | 'projectId' | 'projectName' | 'createdAt'>>) => void;
  deleteExtraLogItem: (id: string) => void;
  getProjectWeekMode: (projectId: string) => PlannerWeekMode;
  getProjectTotals: (projectId: string) => { plannedMinutes: number; actualMinutes: number; extraMinutes: number; deltaMinutes: number };
}

const ensureSettings = (
  settings: Record<string, PlannerProjectSettings>,
  projectId: string,
): Record<string, PlannerProjectSettings> => {
  if (!projectId || settings[projectId]) return settings;
  return {
    ...settings,
    [projectId]: {
      weekMode: 'weekdays',
      visibleDayCount: 5,
    },
  };
};

const clampVisibleDayCount = (value: number) => {
  const normalized = Number.isFinite(value) ? Math.round(value) : 5;
  return Math.max(MIN_VISIBLE_DAY_COUNT, Math.min(MAX_VISIBLE_DAY_COUNT, normalized));
};

const normalizeCategoryName = (value: string) => value.trim();

const migrateLegacySessions = (sessions: LegacyPlannerSession[] | undefined) => {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return {
      planItems: [] as PlannerPlanItem[],
      logOverrides: [] as PlannerLogOverride[],
      extraLogItems: [] as PlannerExtraLogItem[],
      projectSettings: {} as Record<string, PlannerProjectSettings>,
    };
  }

  const planItems: PlannerPlanItem[] = [];
  const logOverrides: PlannerLogOverride[] = [];
  const projectSettings: Record<string, PlannerProjectSettings> = {};

  sessions.forEach((session) => {
    const timeWindow = ensureTimeWindow(session.startTime, session.endTime, session.plannedMinutes);
    planItems.push({
      id: session.id,
      projectId: session.projectId,
      projectName: session.projectName,
      title: session.title,
      notes: session.description,
      color: DEFAULT_ITEM_COLOR,
      plannedDate: session.plannedDate,
      plannedStart: timeWindow.start,
      plannedEnd: timeWindow.end,
      createdAt: session.createdAt,
      updatedAt: session.createdAt,
    });

    if (session.projectId && !projectSettings[session.projectId]) {
      projectSettings[session.projectId] = { weekMode: 'weekdays', visibleDayCount: 5 };
    }

    const logNotes = (session.logs || []).map((log) => log.notes).filter(Boolean).join('\n');
    if ((session.actualMinutes ?? 0) > 0 || logNotes) {
      const actualEnd = session.endTime
        ? session.endTime
        : minutesToTimeString(timeStringToMinutes(timeWindow.start) + Math.max(30, session.actualMinutes || session.plannedMinutes));
      logOverrides.push({
        id: createId(),
        planItemId: session.id,
        projectId: session.projectId,
        actualDate: session.plannedDate,
        actualStart: timeWindow.start,
        actualEnd,
        actualNotes: logNotes || undefined,
        updatedAt: new Date().toISOString(),
      });
    }
  });

  return {
    planItems,
    logOverrides,
    extraLogItems: [] as PlannerExtraLogItem[],
    projectSettings,
  };
};

export const usePlannerStore = create<PlannerState>()(
  persist(
    (set, get) => ({
      planItems: [],
      logOverrides: [],
      extraLogItems: [],
      projectCategories: [],
      projectSettings: {},

      setProjectWeekMode: (projectId, mode) => set((state) => ({
        projectSettings: {
          ...ensureSettings(state.projectSettings, projectId),
          [projectId]: {
            ...state.projectSettings[projectId],
            weekMode: mode,
            visibleDayCount: state.projectSettings[projectId]?.visibleDayCount || 5,
          },
        },
      })),

      setProjectVisibleDayCount: (projectId, visibleDayCount) => set((state) => ({
        projectSettings: {
          ...ensureSettings(state.projectSettings, projectId),
          [projectId]: {
            ...state.projectSettings[projectId],
            weekMode: state.projectSettings[projectId]?.weekMode || 'weekdays',
            visibleDayCount: clampVisibleDayCount(visibleDayCount),
          },
        },
      })),

      setProjectSidebarCategory: (projectId, category) => set((state) => ({
        projectSettings: {
          ...ensureSettings(state.projectSettings, projectId),
          [projectId]: {
            ...state.projectSettings[projectId],
            weekMode: state.projectSettings[projectId]?.weekMode || 'weekdays',
            visibleDayCount: state.projectSettings[projectId]?.visibleDayCount || 5,
            sidebarCategory: category || undefined,
          },
        },
      })),

      addProjectCategory: (category) => {
        const normalized = normalizeCategoryName(category);
        if (!normalized) return;
        set((state) => {
          if (state.projectCategories.some((entry) => entry.toLowerCase() === normalized.toLowerCase())) {
            return state;
          }

          return {
            ...state,
            projectCategories: [...state.projectCategories, normalized],
          };
        });
      },

      addPlanItem: (projectId, projectName, input) => {
        const now = new Date().toISOString();
        const id = createId();
        set((state) => ({
          planItems: [
            ...state.planItems,
            {
              id,
              projectId,
              projectName,
              title: input.title.trim(),
              notes: input.notes?.trim() || undefined,
              color: input.color || DEFAULT_ITEM_COLOR,
              plannedDate: input.plannedDate,
              plannedStart: input.plannedStart,
              plannedEnd: input.plannedEnd,
              createdAt: now,
              updatedAt: now,
            },
          ],
          projectSettings: ensureSettings(state.projectSettings, projectId),
        }));
        return id;
      },

      updatePlanItem: (id, updates) => set((state) => ({
        planItems: state.planItems.map((item) => item.id !== id ? item : {
          ...item,
          ...updates,
          title: updates.title?.trim() || item.title,
          notes: updates.notes !== undefined ? (updates.notes?.trim() || undefined) : item.notes,
          updatedAt: new Date().toISOString(),
        }),
      })),

      deletePlanItem: (id) => set((state) => ({
        planItems: state.planItems.filter((item) => item.id !== id),
        logOverrides: state.logOverrides.filter((entry) => entry.planItemId !== id),
      })),

      upsertLogOverride: (planItemId, updates) => set((state) => {
        const planItem = state.planItems.find((item) => item.id === planItemId);
        if (!planItem) return state;

        const now = new Date().toISOString();
        const current = state.logOverrides.find((entry) => entry.planItemId === planItemId);
        const nextEntry: PlannerLogOverride = current
          ? {
              ...current,
              ...updates,
              actualTitle: updates.actualTitle !== undefined ? (updates.actualTitle?.trim() || undefined) : current.actualTitle,
              actualNotes: updates.actualNotes !== undefined ? (updates.actualNotes?.trim() || undefined) : current.actualNotes,
              replacementNote: updates.replacementNote !== undefined ? (updates.replacementNote?.trim() || undefined) : current.replacementNote,
              updatedAt: now,
            }
          : {
              id: createId(),
              planItemId,
              projectId: planItem.projectId,
              actualDate: updates.actualDate || planItem.plannedDate,
              actualStart: updates.actualStart || planItem.plannedStart,
              actualEnd: updates.actualEnd || planItem.plannedEnd,
              actualTitle: updates.actualTitle?.trim() || undefined,
              actualNotes: updates.actualNotes?.trim() || undefined,
              replacementNote: updates.replacementNote?.trim() || undefined,
              updatedAt: now,
            };

        return {
          ...state,
          logOverrides: current
            ? state.logOverrides.map((entry) => entry.planItemId === planItemId ? nextEntry : entry)
            : [...state.logOverrides, nextEntry],
        };
      }),

      resetLogOverride: (planItemId) => set((state) => ({
        logOverrides: state.logOverrides.filter((entry) => entry.planItemId !== planItemId),
      })),

      addExtraLogItem: (projectId, projectName, input) => {
        const now = new Date().toISOString();
        const id = createId();
        set((state) => ({
          extraLogItems: [
            ...state.extraLogItems,
            {
              id,
              projectId,
              projectName,
              title: input.title.trim(),
              notes: input.notes?.trim() || undefined,
              color: input.color || DEFAULT_ITEM_COLOR,
              actualDate: input.actualDate,
              actualStart: input.actualStart,
              actualEnd: input.actualEnd,
              createdAt: now,
              updatedAt: now,
            },
          ],
          projectSettings: ensureSettings(state.projectSettings, projectId),
        }));
        return id;
      },

      updateExtraLogItem: (id, updates) => set((state) => ({
        extraLogItems: state.extraLogItems.map((item) => item.id !== id ? item : {
          ...item,
          ...updates,
          title: updates.title?.trim() || item.title,
          notes: updates.notes !== undefined ? (updates.notes?.trim() || undefined) : item.notes,
          updatedAt: new Date().toISOString(),
        }),
      })),

      deleteExtraLogItem: (id) => set((state) => ({
        extraLogItems: state.extraLogItems.filter((item) => item.id !== id),
      })),

      getProjectWeekMode: (projectId) => get().projectSettings[projectId]?.weekMode || 'weekdays',

      getProjectTotals: (projectId) => {
        const planItems = get().planItems.filter((item) => item.projectId === projectId);
        const plannedMinutes = planItems.reduce((sum, item) => sum + getDurationMinutes(item.plannedStart, item.plannedEnd), 0);
        const actualFromPlan = planItems.reduce((sum, item) => {
          const override = get().logOverrides.find((entry) => entry.planItemId === item.id);
          return sum + getDurationMinutes(override?.actualStart || item.plannedStart, override?.actualEnd || item.plannedEnd);
        }, 0);
        const extraMinutes = get().extraLogItems
          .filter((item) => item.projectId === projectId)
          .reduce((sum, item) => sum + getDurationMinutes(item.actualStart, item.actualEnd), 0);

        return {
          plannedMinutes,
          actualMinutes: actualFromPlan + extraMinutes,
          extraMinutes,
          deltaMinutes: actualFromPlan + extraMinutes - plannedMinutes,
        };
      },
    }),
    {
      name: 'planner-storage-v1',
      version: 2,
      migrate: (persistedState: any, version) => {
        if (!persistedState) return persistedState;
        if (version < 2 && Array.isArray(persistedState.sessions)) {
          return migrateLegacySessions(persistedState.sessions as LegacyPlannerSession[]);
        }
        return persistedState;
      },
    }
  )
);
