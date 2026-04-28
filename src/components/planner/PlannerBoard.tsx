import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addDays,
  addWeeks,
  format,
  getDay,
  isToday,
  parseISO,
  startOfWeek,
  subWeeks,
} from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  GripVertical,
  Plus,
  RotateCcw,
} from 'lucide-react';
import {
  MAX_VISIBLE_DAY_COUNT,
  MIN_VISIBLE_DAY_COUNT,
  getDurationMinutes,
  minutesToTimeString,
  PlannerExtraLogItem,
  PlannerLogOverride,
  PlannerPlanItem,
  PlannerWeekMode,
  sessionTodayString,
  timeStringToMinutes,
  usePlannerStore,
} from '@/store/usePlannerStore';
import { useAppTranslation } from '@/lib/appTranslations';
import ColorPicker from '@/components/ColorPicker';
import ContextMenu, { type ContextMenuItem } from '@/components/ContextMenu';
import { useSettingsStore } from '@/store/useSettingsStore';
import { eventMatchesKeybind } from '@/lib/keybinds';

type PlannerBoardView = 'plan' | 'log';

type PlannerDerivedLogItem = {
  id: string;
  sourceId: string;
  kind: 'planned' | 'extra';
  title: string;
  notes?: string;
  color: string;
  date: string;
  start: string;
  end: string;
  original?: PlannerPlanItem;
  override?: PlannerLogOverride;
  extra?: PlannerExtraLogItem;
};

type DraftMode = 'create-plan' | 'edit-plan' | 'create-log-extra' | 'edit-log-planned' | 'edit-log-extra';

type DraftState = {
  mode: DraftMode;
  itemId?: string;
  title: string;
  notes: string;
  color: string;
  date: string;
  start: string;
  end: string;
  replacementNote: string;
};

type DragState = {
  view: PlannerBoardView;
  itemId: string;
  kind: 'move' | 'resize-start' | 'resize-end';
  source: 'planned' | 'extra';
  duration: number;
  pointerOffsetMinutes: number;
  pointerOffsetX: number;
  pointerOffsetY: number;
  startPointerClientX: number;
  startPointerClientY: number;
  pointerClientX: number;
  pointerClientY: number;
  viewportScale: number;
  originDate: string;
  originalStartMinutes: number;
  originalEndMinutes: number;
  previewWidth: number;
  previewHeight: number;
};

type DragPreviewState = {
  view: PlannerBoardView;
  itemId: string;
  source: 'planned' | 'extra';
  title: string;
  color: string;
  start: string;
  end: string;
  date: string;
  pointerClientX: number;
  pointerClientY: number;
};

type RenderCardOptions = {
  isLockedGhost?: boolean;
};

type ZoomDragState = {
  kind: 'time-zoom';
  startPointer: number;
  startValue: number;
};

type PlannerContextMenuState = {
  x: number;
  y: number;
  date: string;
  startMinutes: number;
};

interface PlannerBoardProps {
  projectId: string;
  projectName: string;
  compact?: boolean;
}

const DEFAULT_COLOR = '#6366f1';
const DAY_BUFFER_WEEKS = 12;
const DEFAULT_HALF_HOUR_HEIGHT = 30;
const MIN_HALF_HOUR_HEIGHT = 6;
const TIMELINE_VERTICAL_PADDING = 24;
const DAY_WINDOW_BUFFER = 1;
const DAY_ANCHOR_NUDGE_PX = 1;
const HOUR_ROW_MINUTES = 60;
const MIN_TIME_SCROLLBAR_THUMB_SIZE = 36;
const clampVisibleDayCount = (value: number) => Math.max(MIN_VISIBLE_DAY_COUNT, Math.min(MAX_VISIBLE_DAY_COUNT, value));

const toSnapMinutes = (value: number, stepMinutes: number) => {
  const safeStep = Math.max(5, stepMinutes);
  return Math.max(0, Math.min(24 * 60 - safeStep, Math.round(value / safeStep) * safeStep));
};

const getTimelineConfig = (zoom: number) => {
  if (zoom >= 2.3) {
    return { labelStepMinutes: 15, gridStepMinutes: 15, snapStepMinutes: 15 };
  }

  if (zoom >= 1.55) {
    return { labelStepMinutes: 30, gridStepMinutes: 15, snapStepMinutes: 15 };
  }

  if (zoom >= 1.15) {
    return { labelStepMinutes: 60, gridStepMinutes: 30, snapStepMinutes: 30 };
  }

  return { labelStepMinutes: 120, gridStepMinutes: 60, snapStepMinutes: 30 };
};

const formatMinutes = (minutes: number) => {
  if (minutes <= 0) return '0m';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${minutes}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
};

const getViewportScale = () => {
  if (typeof window === 'undefined') return 1;
  const zoomValue = window.getComputedStyle(document.body).zoom;
  const scale = Number.parseFloat(zoomValue);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
};

const removeDragPlaceholder = (placeholderRef: React.MutableRefObject<HTMLDivElement | null>) => {
  if (placeholderRef.current) {
    placeholderRef.current.remove();
    placeholderRef.current = null;
  }
};

const getDefaultLogTimeRange = () => {
  const now = new Date();
  const currentMinutes = (now.getHours() * 60) + now.getMinutes();
  const snappedStart = toSnapMinutes(currentMinutes, 30);
  const snappedEnd = Math.min(24 * 60, snappedStart + 30);

  return {
    start: minutesToTimeString(snappedStart),
    end: minutesToTimeString(snappedEnd),
  };
};

const normalizeDraftTimeRange = (start: string, end: string) => {
  const startMinutes = timeStringToMinutes(start);
  const endMinutes = timeStringToMinutes(end);

  if (endMinutes > startMinutes) {
    return { start, end };
  }

  return {
    start,
    end: minutesToTimeString(Math.min(24 * 60, startMinutes + 30)),
  };
};

const isWeekendDay = (day: Date) => {
  const dayOfWeek = getDay(day);
  return dayOfWeek === 0 || dayOfWeek === 6;
};

function buildDraft(mode: DraftMode, projectId: string, value?: PlannerPlanItem | PlannerDerivedLogItem): DraftState {
  if (!value) {
    return {
      mode,
      title: '',
      notes: '',
      color: DEFAULT_COLOR,
      date: sessionTodayString(),
      start: '09:00',
      end: '10:00',
      replacementNote: '',
    };
  }

  if ('plannedDate' in value) {
    return {
      mode,
      itemId: value.id,
      title: value.title,
      notes: value.notes || '',
      color: value.color,
      date: value.plannedDate,
      start: value.plannedStart,
      end: value.plannedEnd,
      replacementNote: '',
    };
  }

  return {
    mode,
    itemId: value.sourceId,
    title: value.title,
    notes: value.notes || '',
    color: value.color,
    date: value.date,
    start: value.start,
    end: value.end,
    replacementNote: value.override?.replacementNote || '',
  };
}

export default function PlannerBoard({ projectId, projectName, compact = false }: PlannerBoardProps) {
  const { text } = useAppTranslation();
  const keybinds = useSettingsStore((state) => state.keybinds);
  const allPlanItems = usePlannerStore((state) => state.planItems);
  const allLogOverrides = usePlannerStore((state) => state.logOverrides);
  const allExtraLogItems = usePlannerStore((state) => state.extraLogItems);
  const weekMode = usePlannerStore((state) => state.projectSettings[projectId]?.weekMode || 'weekdays');
  const visibleDayCount = usePlannerStore((state) => state.projectSettings[projectId]?.visibleDayCount || 5);
  const setProjectWeekMode = usePlannerStore((state) => state.setProjectWeekMode);
  const setProjectVisibleDayCount = usePlannerStore((state) => state.setProjectVisibleDayCount);
  const addPlanItem = usePlannerStore((state) => state.addPlanItem);
  const updatePlanItem = usePlannerStore((state) => state.updatePlanItem);
  const deletePlanItem = usePlannerStore((state) => state.deletePlanItem);
  const upsertLogOverride = usePlannerStore((state) => state.upsertLogOverride);
  const resetLogOverride = usePlannerStore((state) => state.resetLogOverride);
  const addExtraLogItem = usePlannerStore((state) => state.addExtraLogItem);
  const updateExtraLogItem = usePlannerStore((state) => state.updateExtraLogItem);
  const deleteExtraLogItem = usePlannerStore((state) => state.deleteExtraLogItem);

  const [view, setView] = useState<PlannerBoardView>('plan');
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreviewState | null>(null);
  const [hoverMinutes, setHoverMinutes] = useState<number | null>(null);
  const [timeZoom, setTimeZoom] = useState(1);
  const [scrollTop, setScrollTop] = useState(0);
  const [horizontalScrollLeft, setHorizontalScrollLeft] = useState(0);
  const [visibleRangeStartIndex, setVisibleRangeStartIndex] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [snapMode, setSnapMode] = useState(false);
  const [contextMenu, setContextMenu] = useState<PlannerContextMenuState | null>(null);
  const dayScrollRef = useRef<HTMLDivElement | null>(null);
  const dayTrackRef = useRef<HTMLDivElement | null>(null);
  const dayThumbRef = useRef<HTMLDivElement | null>(null);
  const dayLeftArrowRef = useRef<HTMLSpanElement | null>(null);
  const dayRightArrowRef = useRef<HTMLSpanElement | null>(null);
  const timeTrackRef = useRef<HTMLDivElement | null>(null);
  const timeThumbRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const boardViewportRef = useRef<HTMLDivElement | null>(null);
  const activeDragCardRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const dragPreviewRef = useRef<DragPreviewState | null>(null);
  const dragGhostRef = useRef<HTMLDivElement | null>(null);
  const dragPlaceholderRef = useRef<HTMLDivElement | null>(null);
  const dayHeaderRef = useRef<HTMLDivElement | null>(null);
  const scrollDragRef = useRef<{ active: boolean; startX: number; startLeft: number }>({ active: false, startX: 0, startLeft: 0 });
  const dayJoystickDragRef = useRef<{ active: boolean; startX: number }>({ active: false, startX: 0 });
  const dayResizeRef = useRef<{ active: boolean; edge: 'left' | 'right'; startX: number; startCount: number }>({ active: false, edge: 'right', startX: 0, startCount: 0 });
  const scrollSyncFrameRef = useRef<number | null>(null);
  const snapScrollTimeoutRef = useRef<number | null>(null);
  const timeThumbDragRef = useRef<{ active: boolean; startY: number; startTop: number }>({ active: false, startY: 0, startTop: 0 });
  const pendingVisibleStartIndexRef = useRef<number | null>(null);
  const pendingAnchorDayRef = useRef<string | null>(null);
  const skipResizePreserveRef = useRef(false);
  const zoomDragRef = useRef<ZoomDragState | null>(null);
  const timeZoomRef = useRef(1);
  const hasInitializedTimeZoomRef = useRef(false);
  const hasAdjustedTimeZoomRef = useRef(false);
  const hasInitializedHorizontalScrollRef = useRef(false);
  const lastAutoWeekMondayRef = useRef<string | null>(null);
  const viewportMetricsRef = useRef({ width: 0, height: 0 });
  const [viewportHeight, setViewportHeight] = useState(0);
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  const [timelineAnchorDate] = useState(() => addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), -(DAY_BUFFER_WEEKS * 7)));

  const setGlobalDragSelection = useCallback((active: boolean) => {
    document.body.style.userSelect = active ? 'none' : '';
  }, []);

  const setDayScrollArrowDirection = useCallback((direction: 'left' | 'right' | null) => {
    const arrowNodes = [dayLeftArrowRef.current, dayRightArrowRef.current];
    arrowNodes.forEach((node) => {
      if (!node) return;
      node.classList.toggle('flowing-left', direction === 'left');
      node.classList.toggle('flowing-right', direction === 'right');
    });
  }, []);

  const timelinePadding = compact ? 10 : TIMELINE_VERTICAL_PADDING;
  const baseSlotHeight = compact ? 10 : DEFAULT_HALF_HOUR_HEIGHT;
  const minTimeZoom = useMemo(() => {
    if (compact) return 1;
    const availableGridHeight = Math.max(0, viewportHeight - (timelinePadding * 2));
    return Math.max(availableGridHeight / (24 * 60), MIN_HALF_HOUR_HEIGHT / 30);
  }, [compact, timelinePadding, viewportHeight]);
  const maxTimeZoom = useMemo(() => minTimeZoom * 10, [minTimeZoom]);
  const clampTimeZoom = useCallback((value: number) => Math.max(minTimeZoom, Math.min(maxTimeZoom, value)), [maxTimeZoom, minTimeZoom]);
  const resolvedTimeZoom = compact
    ? 1
    : (viewportHeight > 0 && !hasInitializedTimeZoomRef.current ? minTimeZoom : clampTimeZoom(timeZoom));
  const pixelsPerMinute = compact ? (baseSlotHeight / 30) : resolvedTimeZoom;
  const slotHeight = compact ? baseSlotHeight : baseSlotHeight * resolvedTimeZoom;
  const scheduleHeight = pixelsPerMinute * 1440;
  const boardHeight = scheduleHeight + (timelinePadding * 2);
  const timelineConfig = useMemo(() => getTimelineConfig(resolvedTimeZoom), [resolvedTimeZoom]);
  const hideWeekends = weekMode === 'weekdays';
  const renderedDays = useMemo(
    () => Array.from({ length: MAX_VISIBLE_DAY_COUNT + (DAY_BUFFER_WEEKS * 14) }, (_, index) => addDays(timelineAnchorDate, index)),
    [timelineAnchorDate],
  );
  const renderedDayMap = useMemo(
    () => new Map(renderedDays.map((day, index) => [format(day, 'yyyy-MM-dd'), index])),
    [renderedDays],
  );
  const totalDayCount = renderedDays.length;
  const maxSelectableVisibleDayCount = Math.min(MAX_VISIBLE_DAY_COUNT, totalDayCount);
  const dayColumnWidth = viewportWidth > 0
    ? viewportWidth / Math.max(visibleDayCount, 1)
    : (compact ? 72 : 140);
  const dayJoystickThumbWidth = useMemo(() => {
    if (viewportWidth <= 0) return 56;
    const minWidth = 56;
    const maxWidth = Math.max(minWidth, Math.min(220, viewportWidth * 0.42));
    const ratio = maxSelectableVisibleDayCount > MIN_VISIBLE_DAY_COUNT
      ? (visibleDayCount - MIN_VISIBLE_DAY_COUNT) / (maxSelectableVisibleDayCount - MIN_VISIBLE_DAY_COUNT)
      : 0;
    return minWidth + ((maxWidth - minWidth) * Math.max(0, Math.min(1, ratio)));
  }, [maxSelectableVisibleDayCount, viewportWidth, visibleDayCount]);
  const boardWidth = renderedDays.length * dayColumnWidth;
  const maxHorizontalScrollLeft = Math.max(0, boardWidth - viewportWidth);
  const visibleStartIndex = Math.max(0, Math.min(renderedDays.length - visibleDayCount, visibleRangeStartIndex));
  const weekStartDate = renderedDays[visibleStartIndex] || startOfWeek(new Date(nowTimestamp), { weekStartsOn: 1 });
  const visibleDays = useMemo(
    () => renderedDays.slice(visibleStartIndex, visibleStartIndex + visibleDayCount),
    [renderedDays, visibleDayCount, visibleStartIndex],
  );
  const visibleDayMap = useMemo(
    () => new Map(visibleDays.map((day, index) => [format(day, 'yyyy-MM-dd'), index])),
    [visibleDays],
  );
  const windowStartIndex = Math.max(0, visibleStartIndex - DAY_WINDOW_BUFFER);
  const windowEndIndex = Math.min(renderedDays.length, visibleStartIndex + visibleDayCount + DAY_WINDOW_BUFFER + 1);
  const windowedDays = useMemo(
    () => renderedDays.slice(windowStartIndex, windowEndIndex),
    [renderedDays, windowEndIndex, windowStartIndex],
  );
  const windowedDayMap = useMemo(
    () => new Set(windowedDays.map((day) => format(day, 'yyyy-MM-dd'))),
    [windowedDays],
  );

  const planItems = useMemo(
    () => allPlanItems.filter((item) => item.projectId === projectId),
    [allPlanItems, projectId],
  );

  const logOverrides = useMemo(
    () => allLogOverrides.filter((item) => item.projectId === projectId),
    [allLogOverrides, projectId],
  );

  const extraLogItems = useMemo(
    () => allExtraLogItems.filter((item) => item.projectId === projectId),
    [allExtraLogItems, projectId],
  );

  const derivedLogItems = useMemo<PlannerDerivedLogItem[]>(() => {
    const overrideMap = new Map(logOverrides.map((entry) => [entry.planItemId, entry]));
    const fromPlan = planItems.map((item) => {
      const override = overrideMap.get(item.id);
      return {
        id: `log-${item.id}`,
        sourceId: item.id,
        kind: 'planned' as const,
        title: override?.actualTitle || item.title,
        notes: override?.actualNotes || item.notes,
        color: item.color,
        date: override?.actualDate || item.plannedDate,
        start: override?.actualStart || item.plannedStart,
        end: override?.actualEnd || item.plannedEnd,
        original: item,
        override,
      };
    });
    const extras = extraLogItems.map((item) => ({
      id: `extra-${item.id}`,
      sourceId: item.id,
      kind: 'extra' as const,
      title: item.title,
      notes: item.notes,
      color: item.color,
      date: item.actualDate,
      start: item.actualStart,
      end: item.actualEnd,
      extra: item,
    }));
    return [...fromPlan, ...extras];
  }, [extraLogItems, logOverrides, planItems]);

  const visiblePlanItems = useMemo(
    () => planItems.filter((item) => windowedDayMap.has(item.plannedDate)),
    [planItems, windowedDayMap],
  );
  const visibleLogItems = useMemo(
    () => derivedLogItems.filter((item) => windowedDayMap.has(item.date)),
    [derivedLogItems, windowedDayMap],
  );

  const totals = useMemo(() => {
    const plannedMinutes = planItems.reduce((sum, item) => sum + getDurationMinutes(item.plannedStart, item.plannedEnd), 0);
    const actualMinutes = derivedLogItems.reduce((sum, item) => sum + getDurationMinutes(item.start, item.end), 0);
    return {
      plannedMinutes,
      actualMinutes,
      deltaMinutes: actualMinutes - plannedMinutes,
    };
  }, [derivedLogItems, planItems]);

  const todayIso = sessionTodayString();
  const nowMinutes = timeStringToMinutes(format(nowTimestamp, 'HH:mm'));
  const currentWeekMondayId = format(startOfWeek(new Date(nowTimestamp), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const nowRatio = nowMinutes / 1440;
  const nowContentTop = (boardViewportRef.current?.scrollHeight ?? boardHeight) * nowRatio;
  const viewportIndicatorTop = viewportHeight > 0
    ? Math.max(0, Math.min(viewportHeight - 2, nowContentTop - scrollTop))
    : 0;
  const railIndicatorLabelTop = viewportHeight > 0
    ? Math.max(0, Math.min(viewportHeight - 20, (nowContentTop - scrollTop) - 8))
    : 0;
  const maxVerticalScrollTop = Math.max(0, boardHeight - viewportHeight);
  const todayPlan = planItems.filter((item) => item.plannedDate === todayIso).sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
  const currentPlanItem = todayPlan.find((item) => nowMinutes >= timeStringToMinutes(item.plannedStart) && nowMinutes < timeStringToMinutes(item.plannedEnd));
  const nextPlanItem = todayPlan.find((item) => timeStringToMinutes(item.plannedStart) > nowMinutes);

  useEffect(() => {
    timeZoomRef.current = resolvedTimeZoom;
  }, [resolvedTimeZoom]);

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  useEffect(() => {
    const updateNow = () => setNowTimestamp(Date.now());
    updateNow();
    const intervalId = window.setInterval(updateNow, 30000);
    return () => window.clearInterval(intervalId);
  }, []);

  const updateTimeThumbMetrics = useCallback((scrollTopValue?: number) => {
    const scrollNode = boardViewportRef.current;
    const trackNode = timeTrackRef.current;
    const thumbNode = timeThumbRef.current;
    if (!scrollNode || !trackNode || !thumbNode) return;

    const trackHeight = trackNode.clientHeight;
    const clientHeight = scrollNode.clientHeight;
    const scrollHeight = scrollNode.scrollHeight;
    const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
    const safeScrollTop = Math.max(0, Math.min(maxScrollTop, scrollTopValue ?? scrollNode.scrollTop));
    const nextThumbHeight = trackHeight > 0 && scrollHeight > 0
      ? Math.max(48, (clientHeight / scrollHeight) * trackHeight)
      : 48;
    const nextMaxTop = Math.max(0, trackHeight - nextThumbHeight);
    const nextTop = maxScrollTop > 0
      ? Math.max(0, Math.min(nextMaxTop, (safeScrollTop / maxScrollTop) * nextMaxTop))
      : 0;

    thumbNode.style.height = `${nextThumbHeight}px`;
    thumbNode.style.top = `${nextTop}px`;
  }, []);

  useEffect(() => {
    if (compact) return;

    const observedNodes = new Set<Element>();
    const updateMetrics = () => {
      const verticalNode = boardViewportRef.current;
      const horizontalNode = dayScrollRef.current;
      if (!verticalNode || !horizontalNode) return;

      const nextHeight = verticalNode.clientHeight;
      const nextWidth = horizontalNode.clientWidth;
      const previous = viewportMetricsRef.current;
      const nextMinTimeZoom = Math.max(Math.max(0, nextHeight - (timelinePadding * 2)) / (24 * 60), MIN_HALF_HOUR_HEIGHT / 30);
      const nextMaxTimeZoom = nextMinTimeZoom * 10;

      if (previous.height !== nextHeight) {
        viewportMetricsRef.current.height = nextHeight;
        setViewportHeight(nextHeight);
        setTimeZoom((current) => {
          if (!hasInitializedTimeZoomRef.current || !hasAdjustedTimeZoomRef.current) {
            hasInitializedTimeZoomRef.current = true;
            return nextMinTimeZoom;
          }
          return Math.max(nextMinTimeZoom, Math.min(nextMaxTimeZoom, current));
        });
      }

      if (previous.width !== nextWidth) {
        viewportMetricsRef.current.width = nextWidth;
        setViewportWidth(nextWidth);
      }

      updateTimeThumbMetrics(verticalNode.scrollTop);
    };

    const resizeObserver = new ResizeObserver(() => updateMetrics());
    let frameId = 0;
    const attachObservers = () => {
      const verticalNode = boardViewportRef.current;
      const horizontalNode = dayScrollRef.current;
      const timeTrackNode = timeTrackRef.current;

      if (verticalNode && !observedNodes.has(verticalNode)) {
        resizeObserver.observe(verticalNode);
        observedNodes.add(verticalNode);
      }

      if (horizontalNode && !observedNodes.has(horizontalNode)) {
        resizeObserver.observe(horizontalNode);
        observedNodes.add(horizontalNode);
      }

      if (timeTrackNode && !observedNodes.has(timeTrackNode)) {
        resizeObserver.observe(timeTrackNode);
        observedNodes.add(timeTrackNode);
      }

      updateMetrics();

      if ((!verticalNode || !horizontalNode) && frameId === 0) {
        frameId = window.requestAnimationFrame(() => {
          frameId = 0;
          attachObservers();
        });
      }
    };
    attachObservers();

    const handleResize = () => updateMetrics();
    window.addEventListener('resize', handleResize);
    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [compact, timelinePadding, updateTimeThumbMetrics]);

  useEffect(() => {
    updateTimeThumbMetrics();
  }, [boardHeight, updateTimeThumbMetrics, viewportHeight]);

  useEffect(() => {
    dragPreviewRef.current = dragPreview;
  }, [dragPreview]);

  const syncVisibleRangeFromScroll = useCallback((scrollLeftValue?: number) => {
    const safeScrollLeft = Math.max(0, Math.min(maxHorizontalScrollLeft, scrollLeftValue ?? dayScrollRef.current?.scrollLeft ?? 0));
    setHorizontalScrollLeft(safeScrollLeft);
    const nextStartIndex = Math.max(
      0,
      Math.min(renderedDays.length - visibleDayCount, Math.floor(safeScrollLeft / Math.max(dayColumnWidth, 1))),
    );
    setVisibleRangeStartIndex((previous) => (previous === nextStartIndex ? previous : nextStartIndex));
  }, [dayColumnWidth, maxHorizontalScrollLeft, renderedDays.length, visibleDayCount]);

  const scrollHorizontallyTo = useCallback((value: number, behavior: ScrollBehavior = 'auto') => {
    const scrollNode = dayScrollRef.current;
    const safeScrollLeft = Math.max(0, Math.min(maxHorizontalScrollLeft, value));
    if (!scrollNode) {
      syncVisibleRangeFromScroll(safeScrollLeft);
      return;
    }

    scrollNode.scrollTo({ left: safeScrollLeft, behavior });
    if (behavior === 'auto') {
      syncVisibleRangeFromScroll(safeScrollLeft);
    }
  }, [maxHorizontalScrollLeft, syncVisibleRangeFromScroll]);

  const scheduleSnapToNearestDay = useCallback(() => {
    if (!snapMode || !dayScrollRef.current) return;
    if (dayJoystickDragRef.current.active || dayResizeRef.current.active) return;

    if (snapScrollTimeoutRef.current !== null) {
      window.clearTimeout(snapScrollTimeoutRef.current);
    }

    snapScrollTimeoutRef.current = window.setTimeout(() => {
      const scrollNode = dayScrollRef.current;
      if (!scrollNode) return;
      const nearest = Math.round(scrollNode.scrollLeft / Math.max(dayColumnWidth, 1)) * dayColumnWidth;
      scrollHorizontallyTo(nearest, 'smooth');
    }, 120);
  }, [dayColumnWidth, scrollHorizontallyTo, snapMode]);

  const scrollToRenderedDay = useCallback((dayId: string, behavior: ScrollBehavior = 'smooth') => {
    if (!dayScrollRef.current) return;

    window.setTimeout(() => {
      requestAnimationFrame(() => {
        const scrollNode = dayScrollRef.current;
        const targetColumn = scrollNode
          ? Array.from(scrollNode.querySelectorAll<HTMLElement>('.day-column')).find((column) => column.dataset.plannerDay === dayId)
          : null;

        if (!scrollNode) return;

        if (!targetColumn) {
          const targetIndex = renderedDayMap.get(dayId);
          if (targetIndex === undefined) return;
          const fallbackLeft = Math.max(0, Math.min(maxHorizontalScrollLeft, (targetIndex * dayColumnWidth) + DAY_ANCHOR_NUDGE_PX));
          scrollHorizontallyTo(fallbackLeft, behavior);
          return;
        }

        scrollHorizontallyTo(targetColumn.offsetLeft + DAY_ANCHOR_NUDGE_PX, behavior);
      });
    }, 0);
  }, [dayColumnWidth, maxHorizontalScrollLeft, renderedDayMap, scrollHorizontallyTo, syncVisibleRangeFromScroll]);

  const applyVisibleDayCount = useCallback((nextCount: number, options?: { anchorDayId?: string; preserveStartIndex?: number }) => {
    const safeCount = Math.max(1, Math.min(maxSelectableVisibleDayCount, nextCount));
    pendingAnchorDayRef.current = options?.anchorDayId ?? null;
    pendingVisibleStartIndexRef.current = options?.anchorDayId ? null : (options?.preserveStartIndex ?? visibleStartIndex);
    setProjectVisibleDayCount(projectId, safeCount);
  }, [maxSelectableVisibleDayCount, projectId, setProjectVisibleDayCount, visibleStartIndex]);

  const resizeVisibleDayCountAroundCenter = useCallback((nextCount: number) => {
    const safeCount = clampVisibleDayCount(Math.min(maxSelectableVisibleDayCount, nextCount));
    const centeredStartIndex = Math.round(visibleStartIndex + ((visibleDayCount - safeCount) / 2));
    applyVisibleDayCount(safeCount, { preserveStartIndex: centeredStartIndex });
  }, [applyVisibleDayCount, maxSelectableVisibleDayCount, visibleDayCount, visibleStartIndex]);

  const scrollToWeekStart = useCallback((date: Date, behavior: ScrollBehavior = 'smooth') => {
    const normalizedDate = startOfWeek(date, { weekStartsOn: 1 });
    scrollToRenderedDay(format(normalizedDate, 'yyyy-MM-dd'), behavior);
  }, [scrollToRenderedDay]);

  useEffect(() => {
    if (compact || !boardViewportRef.current || !dayScrollRef.current || viewportWidth <= 0) return;
    if (lastAutoWeekMondayRef.current === currentWeekMondayId) return;

    hasInitializedHorizontalScrollRef.current = true;
    const behavior: ScrollBehavior = lastAutoWeekMondayRef.current === null ? 'auto' : 'smooth';
    lastAutoWeekMondayRef.current = currentWeekMondayId;
    scrollToRenderedDay(currentWeekMondayId, behavior);
  }, [compact, currentWeekMondayId, scrollToRenderedDay, viewportWidth]);

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const timeoutId = window.setTimeout(() => {
      setNowTimestamp(Date.now());
    }, Math.max(0, nextMidnight.getTime() - now.getTime()) + 50);

    return () => window.clearTimeout(timeoutId);
  }, [currentWeekMondayId]);

  useEffect(() => () => {
    if (scrollSyncFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollSyncFrameRef.current);
    }
    if (snapScrollTimeoutRef.current !== null) {
      window.clearTimeout(snapScrollTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (!dayScrollRef.current || viewportWidth <= 0) return;
    if (pendingAnchorDayRef.current) {
      const anchorDayId = pendingAnchorDayRef.current;
      pendingAnchorDayRef.current = null;
      pendingVisibleStartIndexRef.current = null;
      skipResizePreserveRef.current = true;
      scrollToRenderedDay(anchorDayId);
      return;
    }
    if (pendingVisibleStartIndexRef.current === null) return;

    const nextLeft = pendingVisibleStartIndexRef.current * dayColumnWidth;
    pendingVisibleStartIndexRef.current = null;
    skipResizePreserveRef.current = true;
    scrollHorizontallyTo(nextLeft, 'auto');
  }, [dayColumnWidth, scrollHorizontallyTo, viewportWidth]);

  useEffect(() => {
    if (!hasInitializedHorizontalScrollRef.current || viewportWidth <= 0) return;
    if (pendingVisibleStartIndexRef.current !== null) return;
    if (skipResizePreserveRef.current) {
      skipResizePreserveRef.current = false;
      return;
    }
    scrollHorizontallyTo(visibleStartIndex * dayColumnWidth, 'auto');
  }, [dayColumnWidth, scrollHorizontallyTo, viewportWidth]);

  useEffect(() => {
    if (!snapMode) return;
    scheduleSnapToNearestDay();
  }, [scheduleSnapToNearestDay, snapMode]);

  const getPointerMinutesFromClientY = useCallback((clientY: number) => {
    const scrollContainer = boardViewportRef.current;
    if (!scrollContainer) return null;

    const allRows = Array.from(scrollContainer.querySelectorAll<HTMLElement>('.hour-row'));
    const hoveredRow = allRows.find((row) => {
      const rect = row.getBoundingClientRect();
      return clientY >= rect.top && clientY <= rect.bottom;
    });
    if (!hoveredRow) return null;

    const rowMinute = Number.parseInt(hoveredRow.dataset.minute ?? '', 10);
    const minutesPerRow = Number.parseInt(hoveredRow.dataset.minutesPerRow ?? '', 10) || HOUR_ROW_MINUTES;
    if (!Number.isFinite(rowMinute)) return null;

    const rowRect = hoveredRow.getBoundingClientRect();
    const offsetWithinRow = Math.max(0, Math.min(rowRect.height, clientY - rowRect.top));
    const fineMinutes = rowRect.height > 0 ? (offsetWithinRow / rowRect.height) * minutesPerRow : 0;
    return Math.max(0, Math.min(24 * 60, rowMinute + fineMinutes));
  }, []);

  const getPointerSlotFromClientPosition = useCallback((clientX: number, clientY: number) => {
    const boardNode = boardRef.current;
    if (!boardNode) return null;

    const hoveredColumn = Array.from(boardNode.querySelectorAll<HTMLElement>('.day-column')).find((column) => {
      const rect = column.getBoundingClientRect();
      return clientX >= rect.left && clientX <= rect.right;
    });
    if (!hoveredColumn) return null;

    const pointerMinutes = getPointerMinutesFromClientY(clientY);
    if (pointerMinutes === null) return null;

    const targetDate = hoveredColumn.getAttribute('data-planner-day');
    if (!targetDate) return null;

    return {
      date: targetDate,
      startMinutes: toSnapMinutes(pointerMinutes, timelineConfig.snapStepMinutes),
    };
  }, [getPointerMinutesFromClientY, timelineConfig.snapStepMinutes]);

  const applyTimeZoom = useCallback((nextZoom: number, options?: { anchorClientY?: number; anchorMinutes?: number }) => {
    if (compact) return;

    const viewportNode = boardViewportRef.current;
    const clampedZoom = clampTimeZoom(nextZoom);
    const previousZoom = timeZoomRef.current;
    hasAdjustedTimeZoomRef.current = true;

    if (!viewportNode || Math.abs(clampedZoom - previousZoom) < 0.001) {
      setTimeZoom(clampedZoom);
      return;
    }

    const viewportRect = viewportNode.getBoundingClientRect();
    const anchorOffset = options?.anchorClientY === undefined
      ? viewportRect.height / 2
      : Math.max(0, Math.min(viewportRect.height, options.anchorClientY - viewportRect.top));
    const previousScheduleHeight = previousZoom * 1440;
    const nextScheduleHeight = clampedZoom * 1440;
    const anchorMinutes = options?.anchorMinutes
      ?? Math.max(0, Math.min(1440, (((viewportNode.scrollTop + anchorOffset - timelinePadding) / Math.max(previousScheduleHeight, 1)) * 1440)));

    setTimeZoom(clampedZoom);

    requestAnimationFrame(() => {
      if (!boardViewportRef.current) return;
      const nextScrollTop = timelinePadding + ((anchorMinutes / 1440) * nextScheduleHeight) - anchorOffset;
      boardViewportRef.current.scrollTop = Math.max(0, Math.min(nextScheduleHeight + (timelinePadding * 2), nextScrollTop));
    });
  }, [clampTimeZoom, compact, timelinePadding]);

  useEffect(() => {
    const handlePointerMove = (event: MouseEvent) => {
      if (!zoomDragRef.current) return;
      const timeGridHeight = Math.max(1, boardViewportRef.current?.clientHeight ?? viewportHeight);
      const delta = zoomDragRef.current.startPointer - event.clientY;
      const range = maxTimeZoom - minTimeZoom;
      applyTimeZoom(zoomDragRef.current.startValue + ((delta / timeGridHeight) * range), { anchorClientY: event.clientY });
    };

    const handlePointerUp = () => {
      setGlobalDragSelection(false);
      zoomDragRef.current = null;
    };

    document.addEventListener('mousemove', handlePointerMove);
    document.addEventListener('mouseup', handlePointerUp);
    return () => {
      document.removeEventListener('mousemove', handlePointerMove);
      document.removeEventListener('mouseup', handlePointerUp);
    };
  }, [applyTimeZoom, maxTimeZoom, minTimeZoom, setGlobalDragSelection, viewportHeight]);

  useEffect(() => {
    const handlePointerMove = (event: MouseEvent) => {
      if (!scrollDragRef.current.active || !dayScrollRef.current) return;
      const deltaX = event.clientX - scrollDragRef.current.startX;
      const nextScrollLeft = Math.max(0, Math.min(maxHorizontalScrollLeft, scrollDragRef.current.startLeft - deltaX));
      scrollHorizontallyTo(nextScrollLeft, 'auto');
    };

    const handlePointerUp = () => {
      if (!scrollDragRef.current.active) return;
      scrollDragRef.current.active = false;
      setGlobalDragSelection(false);
      syncVisibleRangeFromScroll();
      scheduleSnapToNearestDay();
    };

    document.addEventListener('mousemove', handlePointerMove);
    document.addEventListener('mouseup', handlePointerUp);
    return () => {
      document.removeEventListener('mousemove', handlePointerMove);
      document.removeEventListener('mouseup', handlePointerUp);
    };
  }, [maxHorizontalScrollLeft, scheduleSnapToNearestDay, scrollHorizontallyTo, setGlobalDragSelection, syncVisibleRangeFromScroll]);

  useEffect(() => {
    const handlePointerMove = (event: MouseEvent) => {
      if (dayResizeRef.current.active) {
        const resizeStep = Math.max(12, Math.min(80, dayColumnWidth * 0.35));
        const delta = dayResizeRef.current.edge === 'left'
          ? dayResizeRef.current.startX - event.clientX
          : event.clientX - dayResizeRef.current.startX;
        const dayDelta = Math.round(delta / resizeStep);
        resizeVisibleDayCountAroundCenter(dayResizeRef.current.startCount + dayDelta);
        return;
      }

      if (!dayJoystickDragRef.current.active || !dayScrollRef.current) return;
      const delta = event.clientX - dayJoystickDragRef.current.startX;
      if (Math.abs(delta) > 1) {
        setDayScrollArrowDirection(delta > 0 ? 'right' : 'left');
      }
      const nextScrollLeft = Math.max(0, Math.min(maxHorizontalScrollLeft, dayScrollRef.current.scrollLeft + (delta * 0.8)));
      dayScrollRef.current.scrollLeft = nextScrollLeft;
      syncVisibleRangeFromScroll(nextScrollLeft);
      dayJoystickDragRef.current.startX = event.clientX;
    };

    const handlePointerUp = () => {
      if (!dayJoystickDragRef.current.active && !dayResizeRef.current.active) return;
      dayJoystickDragRef.current.active = false;
      dayResizeRef.current.active = false;
      setDayScrollArrowDirection(null);
      setGlobalDragSelection(false);
      syncVisibleRangeFromScroll();
      scheduleSnapToNearestDay();
    };

    document.addEventListener('mousemove', handlePointerMove);
    document.addEventListener('mouseup', handlePointerUp);
    return () => {
      document.removeEventListener('mousemove', handlePointerMove);
      document.removeEventListener('mouseup', handlePointerUp);
    };
  }, [dayColumnWidth, maxHorizontalScrollLeft, resizeVisibleDayCountAroundCenter, scheduleSnapToNearestDay, setDayScrollArrowDirection, setGlobalDragSelection, syncVisibleRangeFromScroll]);

  useEffect(() => {
    const handlePointerMove = (event: MouseEvent) => {
      if (!timeThumbDragRef.current.active || !boardViewportRef.current) return;

      const trackHeight = timeTrackRef.current?.clientHeight ?? 0;
      const thumbHeight = timeThumbRef.current?.clientHeight ?? 0;
      const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
      const nextTop = Math.max(0, Math.min(maxThumbTop, timeThumbDragRef.current.startTop + (event.clientY - timeThumbDragRef.current.startY)));
      const ratio = maxThumbTop > 0 ? nextTop / maxThumbTop : 0;
      const nextScrollTop = ratio * maxVerticalScrollTop;

      if (timeThumbRef.current) {
        timeThumbRef.current.style.top = `${nextTop}px`;
      }
      boardViewportRef.current.scrollTop = nextScrollTop;
      updateTimeThumbMetrics(nextScrollTop);
    };

    const handlePointerUp = () => {
      if (!timeThumbDragRef.current.active) return;
      timeThumbDragRef.current.active = false;
      setGlobalDragSelection(false);
      updateTimeThumbMetrics();
    };

    document.addEventListener('mousemove', handlePointerMove);
    document.addEventListener('mouseup', handlePointerUp);
    return () => {
      document.removeEventListener('mousemove', handlePointerMove);
      document.removeEventListener('mouseup', handlePointerUp);
    };
  }, [maxVerticalScrollTop, setGlobalDragSelection, updateTimeThumbMetrics]);

  useEffect(() => {
    if (!dragState) {
      if (dragGhostRef.current) {
        dragGhostRef.current.remove();
        dragGhostRef.current = null;
      }
      dragPreviewRef.current = null;
      removeDragPlaceholder(dragPlaceholderRef);
      setDragPreview(null);
      return;
    }

    const handlePointerMove = (event: MouseEvent) => {
      const ghostLeft = (event.clientX - dragState.pointerOffsetX) / dragState.viewportScale;
      const ghostTop = (event.clientY - dragState.pointerOffsetY) / dragState.viewportScale;

      if (dragState.kind === 'move' && dragGhostRef.current) {
        dragGhostRef.current.style.left = `${ghostLeft}px`;
        dragGhostRef.current.style.top = `${ghostTop}px`;
        dragGhostRef.current.style.width = `${dragState.previewWidth}px`;
        dragGhostRef.current.style.height = `${dragState.previewHeight}px`;
        dragGhostRef.current.style.margin = '0';
        dragGhostRef.current.style.position = 'fixed';
        dragGhostRef.current.style.pointerEvents = 'none';
        dragGhostRef.current.style.opacity = '0.85';
        dragGhostRef.current.style.zIndex = '9999';
        dragGhostRef.current.style.boxSizing = 'border-box';
      }

      if (dragState.kind === 'move') {
        const pointerSlot = getPointerSlotFromClientPosition(event.clientX, event.clientY);
        if (!pointerSlot) return;

        const snappedStart = toSnapMinutes(
          pointerSlot.startMinutes - dragState.pointerOffsetMinutes,
          timelineConfig.snapStepMinutes,
        );
        const targetDate = pointerSlot.date;
        const previewStart = minutesToTimeString(snappedStart);
        const previewEnd = minutesToTimeString(snappedStart + dragState.duration);
        if (dragState.view === 'plan') {
          const item = planItems.find((entry) => entry.id === dragState.itemId);
          if (!item) return;
          setDragPreview({
            view: dragState.view,
            itemId: item.id,
            source: 'planned',
            title: item.title,
            color: item.color,
            date: targetDate,
            start: previewStart,
            end: previewEnd,
            pointerClientX: event.clientX,
            pointerClientY: event.clientY,
          });
          return;
        }

        const item = derivedLogItems.find((entry) => entry.sourceId === dragState.itemId && entry.kind === dragState.source);
        if (!item) return;

        if (dragState.source === 'planned') {
          setDragPreview({
            view: dragState.view,
            itemId: item.sourceId,
            source: dragState.source,
            title: item.title,
            color: item.color,
            date: targetDate,
            start: previewStart,
            end: previewEnd,
            pointerClientX: event.clientX,
            pointerClientY: event.clientY,
          });
          return;
        }

        if (item.extra) {
          setDragPreview({
            view: dragState.view,
            itemId: item.sourceId,
            source: dragState.source,
            title: item.title,
            color: item.color,
            date: targetDate,
            start: previewStart,
            end: previewEnd,
            pointerClientX: event.clientX,
            pointerClientY: event.clientY,
          });
        }
        return;
      }

      const pointerDeltaMinutes = ((event.clientY - dragState.startPointerClientY) / dragState.viewportScale) / Math.max(pixelsPerMinute, 0.0001);
      const minimumDuration = Math.max(30, timelineConfig.snapStepMinutes);

      if (dragState.view === 'plan') {
        const item = planItems.find((entry) => entry.id === dragState.itemId);
        if (!item) return;
        let rawStart = dragState.originalStartMinutes;
        let rawEnd = dragState.originalEndMinutes;
        if (dragState.kind === 'resize-start') {
          rawStart = Math.min(dragState.originalEndMinutes - minimumDuration, dragState.originalStartMinutes + pointerDeltaMinutes);
        } else {
          rawEnd = Math.max(dragState.originalStartMinutes + minimumDuration, dragState.originalEndMinutes + pointerDeltaMinutes);
        }
        const previewStart = minutesToTimeString(Math.round(rawStart));
        const previewEnd = minutesToTimeString(Math.round(rawEnd));
        setDragPreview({
          view: dragState.view,
          itemId: item.id,
          source: 'planned',
          title: item.title,
          color: item.color,
          date: dragState.originDate,
          start: previewStart,
          end: previewEnd,
          pointerClientX: event.clientX,
          pointerClientY: event.clientY,
        });
        return;
      }

      const item = derivedLogItems.find((entry) => entry.sourceId === dragState.itemId && entry.kind === dragState.source);
      if (!item) return;

      let rawStart = dragState.originalStartMinutes;
      let rawEnd = dragState.originalEndMinutes;
      if (dragState.kind === 'resize-start') {
        rawStart = Math.min(dragState.originalEndMinutes - minimumDuration, dragState.originalStartMinutes + pointerDeltaMinutes);
      } else {
        rawEnd = Math.max(dragState.originalStartMinutes + minimumDuration, dragState.originalEndMinutes + pointerDeltaMinutes);
      }

      const previewStart = minutesToTimeString(Math.round(rawStart));
      const previewEnd = minutesToTimeString(Math.round(rawEnd));
      setDragPreview({
        view: dragState.view,
        itemId: item.sourceId,
        source: dragState.source,
        title: item.title,
        color: item.color,
        date: dragState.originDate,
        start: previewStart,
        end: previewEnd,
        pointerClientX: event.clientX,
        pointerClientY: event.clientY,
      });
    };

    const handlePointerUp = (event: MouseEvent) => {
      if (dragGhostRef.current) {
        dragGhostRef.current.remove();
        dragGhostRef.current = null;
      }
      const committedPreview = dragPreviewRef.current;
      if (dragState.kind === 'move' && committedPreview) {
        const scrollContainer = boardViewportRef.current;
        const containerRect = scrollContainer?.getBoundingClientRect();
        const allDayColumns = scrollContainer
          ? Array.from(scrollContainer.querySelectorAll<HTMLElement>('.day-column'))
          : [];
        const hoveredColumn = allDayColumns.find((column) => {
          const rect = column.getBoundingClientRect();
          return event.clientX >= rect.left && event.clientX <= rect.right;
        });

        if (!scrollContainer || !containerRect || !hoveredColumn) {
          dragPreviewRef.current = null;
          removeDragPlaceholder(dragPlaceholderRef);
          setDragPreview(null);
          setGlobalDragSelection(false);
          setDragState(null);
          return;
        }

        const targetDate = hoveredColumn.getAttribute('data-planner-day') || committedPreview.date;
        const minutesFromStart = getPointerMinutesFromClientY(event.clientY);
        if (minutesFromStart === null) {
          dragPreviewRef.current = null;
          removeDragPlaceholder(dragPlaceholderRef);
          setDragPreview(null);
          setGlobalDragSelection(false);
          setDragState(null);
          return;
        }
        const snappedMinutes = toSnapMinutes(minutesFromStart, timelineConfig.snapStepMinutes);
        const startMinutes = Math.max(
          0,
          Math.min(
            (24 * 60) - dragState.duration,
            toSnapMinutes(snappedMinutes - dragState.pointerOffsetMinutes, timelineConfig.snapStepMinutes),
          ),
        );
        const endMinutes = Math.min(24 * 60, startMinutes + dragState.duration);
        const finalStart = minutesToTimeString(startMinutes);
        const finalEnd = minutesToTimeString(endMinutes);

        if (committedPreview.view === 'plan') {
          updatePlanItem(committedPreview.itemId, {
            plannedDate: targetDate,
            plannedStart: finalStart,
            plannedEnd: finalEnd,
          });
        } else if (committedPreview.source === 'planned') {
          upsertLogOverride(committedPreview.itemId, {
            actualDate: targetDate,
            actualStart: finalStart,
            actualEnd: finalEnd,
          });
        } else {
          updateExtraLogItem(committedPreview.itemId, {
            actualDate: targetDate,
            actualStart: finalStart,
            actualEnd: finalEnd,
          });
        }
      } else if (committedPreview) {
        const snappedStartMinutes = toSnapMinutes(timeStringToMinutes(committedPreview.start), timelineConfig.snapStepMinutes);
        const snappedEndMinutes = toSnapMinutes(timeStringToMinutes(committedPreview.end), timelineConfig.snapStepMinutes);
        const safeDuration = Math.max(Math.max(30, timelineConfig.snapStepMinutes), snappedEndMinutes - snappedStartMinutes);
        const safeStart = dragState.kind === 'resize-end'
          ? dragState.originalStartMinutes
          : snappedStartMinutes;
        const safeEnd = dragState.kind === 'resize-start'
          ? dragState.originalEndMinutes
          : Math.max(safeStart + safeDuration, snappedEndMinutes);
        const finalStart = minutesToTimeString(safeStart);
        const finalEnd = minutesToTimeString(safeEnd);
        if (committedPreview.view === 'plan') {
          updatePlanItem(committedPreview.itemId, {
            plannedDate: committedPreview.date,
            plannedStart: finalStart,
            plannedEnd: finalEnd,
          });
        } else if (committedPreview.source === 'planned') {
          upsertLogOverride(committedPreview.itemId, {
            actualDate: committedPreview.date,
            actualStart: finalStart,
            actualEnd: finalEnd,
          });
        } else {
          updateExtraLogItem(committedPreview.itemId, {
            actualDate: committedPreview.date,
            actualStart: finalStart,
            actualEnd: finalEnd,
          });
        }
      }
      dragPreviewRef.current = null;
      removeDragPlaceholder(dragPlaceholderRef);
      setDragPreview(null);
      setGlobalDragSelection(false);
      setDragState(null);
    };

    document.addEventListener('mousemove', handlePointerMove);
    document.addEventListener('mouseup', handlePointerUp);
    return () => {
      document.removeEventListener('mousemove', handlePointerMove);
      document.removeEventListener('mouseup', handlePointerUp);
    };
  }, [derivedLogItems, dragState, getPointerMinutesFromClientY, getPointerSlotFromClientPosition, planItems, setGlobalDragSelection, timelineConfig.snapStepMinutes, updateExtraLogItem, updatePlanItem, upsertLogOverride]);

  const openCreateDraft = useCallback(() => {
    const firstDay = format(visibleDays[0], 'yyyy-MM-dd');
    const todayVisible = visibleDayMap.has(todayIso) ? todayIso : firstDay;
    const defaultLogTimeRange = getDefaultLogTimeRange();
    setDraft({
      mode: view === 'plan' ? 'create-plan' : 'create-log-extra',
      title: '',
      notes: '',
      color: DEFAULT_COLOR,
      date: view === 'plan' ? firstDay : todayVisible,
      start: view === 'plan' ? '00:00' : defaultLogTimeRange.start,
      end: view === 'plan' ? '00:00' : defaultLogTimeRange.end,
      replacementNote: '',
    });
  }, [todayIso, view, visibleDayMap, visibleDays]);

  const openCreateDraftAt = useCallback((date: string, startMinutes: number) => {
    const duration = view === 'plan' ? 60 : 30;
    setDraft({
      mode: view === 'plan' ? 'create-plan' : 'create-log-extra',
      title: '',
      notes: '',
      color: DEFAULT_COLOR,
      date,
      start: minutesToTimeString(startMinutes),
      end: minutesToTimeString(Math.min(24 * 60, startMinutes + duration)),
      replacementNote: '',
    });
  }, [view]);

  const contextMenuItems = useMemo<ContextMenuItem[]>(() => {
    if (!contextMenu) return [];

    return [
      {
        label: text('Add Event'),
        action: () => openCreateDraftAt(contextMenu.date, contextMenu.startMinutes),
      },
    ];
  }, [contextMenu, openCreateDraftAt, text]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || (document.activeElement as HTMLElement | null)?.isContentEditable;
      if (isTyping) return;

      if (eventMatchesKeybind('planner.newEvent', event, keybinds)) {
        event.preventDefault();
        openCreateDraft();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [keybinds, openCreateDraft]);

  const saveDraft = () => {
    if (!draft || !draft.title.trim()) return;
    const normalizedTimeRange = normalizeDraftTimeRange(draft.start, draft.end);

    if (draft.mode === 'create-plan') {
      addPlanItem(projectId, projectName, {
        title: draft.title,
        notes: draft.notes,
        color: draft.color,
        plannedDate: draft.date,
        plannedStart: normalizedTimeRange.start,
        plannedEnd: normalizedTimeRange.end,
      });
    } else if (draft.mode === 'edit-plan' && draft.itemId) {
      updatePlanItem(draft.itemId, {
        title: draft.title,
        notes: draft.notes,
        color: draft.color,
        plannedDate: draft.date,
        plannedStart: normalizedTimeRange.start,
        plannedEnd: normalizedTimeRange.end,
      });
    } else if (draft.mode === 'create-log-extra') {
      addExtraLogItem(projectId, projectName, {
        title: draft.title,
        notes: draft.notes,
        color: draft.color,
        actualDate: draft.date,
        actualStart: normalizedTimeRange.start,
        actualEnd: normalizedTimeRange.end,
      });
    } else if (draft.mode === 'edit-log-extra' && draft.itemId) {
      updateExtraLogItem(draft.itemId, {
        title: draft.title,
        notes: draft.notes,
        color: draft.color,
        actualDate: draft.date,
        actualStart: normalizedTimeRange.start,
        actualEnd: normalizedTimeRange.end,
      });
    } else if (draft.mode === 'edit-log-planned' && draft.itemId) {
      upsertLogOverride(draft.itemId, {
        actualDate: draft.date,
        actualStart: normalizedTimeRange.start,
        actualEnd: normalizedTimeRange.end,
        actualTitle: draft.title,
        actualNotes: draft.notes,
        replacementNote: draft.replacementNote,
      });
    }

    setDraft(null);
  };

  const renderCard = (
    item: PlannerPlanItem | PlannerDerivedLogItem,
    currentView: PlannerBoardView,
    options: RenderCardOptions = {},
  ) => {
    const date = 'plannedDate' in item ? item.plannedDate : item.date;
    const start = 'plannedDate' in item ? item.plannedStart : item.start;
    const end = 'plannedDate' in item ? item.plannedEnd : item.end;
    const title = item.title;
    const notes = item.notes;
    const color = item.color;
    const dayIndex = renderedDayMap.get(date);
    if (dayIndex === undefined) return null;

    const startMinutes = timeStringToMinutes(start);
    const durationMinutes = getDurationMinutes(start, end);
    const top = timelinePadding + (startMinutes * pixelsPerMinute);
    const minimumEventHeight = Math.max(24, timelineConfig.gridStepMinutes * pixelsPerMinute);
    const height = Math.max(minimumEventHeight, durationMinutes * pixelsPerMinute);
    const left = dayIndex * dayColumnWidth;
    const width = dayColumnWidth;
    const logItem = !('plannedDate' in item) ? item : null;
    const originalItem = logItem?.original;
    const isLockedGhost = options.isLockedGhost === true;
    const itemKey = 'plannedDate' in item ? item.id : item.sourceId;
    const moved = logItem?.kind === 'planned' && originalItem && (
      originalItem.plannedDate !== logItem.date ||
      originalItem.plannedStart !== logItem.start ||
      originalItem.plannedEnd !== logItem.end
    );
    const isActiveDraggedItem = !isLockedGhost
      && dragState?.kind === 'move'
      && dragState.view === currentView
      && dragState.itemId === itemKey;
    const wrapperStyle = { top, left, width, height };

    const cardBackground = isLockedGhost
      ? 'rgba(100, 116, 139, 0.28)'
      : color;
    const cardBorder = isLockedGhost ? '1px dashed rgba(100, 116, 139, 0.55)' : '1px solid rgba(255,255,255,0.45)';
    const cardOpacity = isActiveDraggedItem ? 0 : (isLockedGhost ? 0.48 : 0.75);
    const isTinyCard = height < 48;
    const isShortCard = height < 72;
    const isMediumCard = height < 108;
    const showBadges = !compact && !isShortCard;
    const showTime = !isTinyCard;
    const showNotes = !compact && !isMediumCard && Boolean(notes);
    const showMovedFrom = !compact && !isMediumCard && moved && originalItem && !isLockedGhost;
    const titleLineClamp = isTinyCard ? 1 : isShortCard ? 2 : 3;
    const titleSizeClass = compact ? 'text-[12px]' : isTinyCard ? 'text-[12px]' : isShortCard ? 'text-[13px]' : 'text-[14px]';
    const metaSizeClass = compact ? 'text-[11px]' : isTinyCard ? 'text-[11px]' : 'text-[12px]';

    return (
      <div
        key={`card-${currentView}-${'plannedDate' in item ? item.id : item.id}-${isLockedGhost ? 'ghost' : 'active'}`}
        className="absolute px-1.5"
        data-planner-card-wrapper={isActiveDraggedItem ? 'active-drag' : isLockedGhost ? 'ghost' : 'card'}
        style={wrapperStyle}
      >
        <div
          className={`group relative h-full rounded-xl text-white shadow-sm ${isLockedGhost ? 'cursor-default transition-transform duration-150' : isActiveDraggedItem ? 'cursor-grabbing shadow-2xl transition-none' : 'cursor-grab transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-lg active:cursor-grabbing'}`}
          data-planner-event-card={isLockedGhost ? 'ghost' : 'live'}
          draggable={false}
          style={{ backgroundColor: cardBackground, border: cardBorder, opacity: cardOpacity }}
          onDoubleClick={() => {
            if (isLockedGhost) return;
            if ('plannedDate' in item) {
              setDraft(buildDraft('edit-plan', projectId, item));
              return;
            }
            setDraft(buildDraft(item.kind === 'planned' ? 'edit-log-planned' : 'edit-log-extra', projectId, item));
          }}
          onMouseDown={(event) => {
            if (isLockedGhost || (event.target as HTMLElement).closest('[data-resize]')) return;
            const pointerMinutes = getPointerMinutesFromClientY(event.clientY);
            if (pointerMinutes === null) return;
            const itemStartMinutes = timeStringToMinutes(start);
            const itemRect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
            const wrapperRect = (event.currentTarget.parentElement as HTMLDivElement | null)?.getBoundingClientRect() ?? itemRect;
            const scrollContainer = boardViewportRef.current;
            const viewportScale = getViewportScale();
            const normalizedRect = {
              left: itemRect.left / viewportScale,
              top: itemRect.top / viewportScale,
              width: itemRect.width / viewportScale,
              height: itemRect.height / viewportScale,
            };
            const grabOffsetX = Math.max(0, Math.min(itemRect.width, event.clientX - itemRect.left));
            const grabOffsetY = Math.max(0, Math.min(itemRect.height, event.clientY - itemRect.top));
            const borderRadius = window.getComputedStyle(event.currentTarget as HTMLDivElement).borderRadius;
            const ghost = event.currentTarget.cloneNode(true) as HTMLDivElement;
            ghost.setAttribute('data-planner-drag-ghost', 'true');
            ghost.style.position = 'fixed';
            ghost.style.left = `${normalizedRect.left}px`;
            ghost.style.top = `${normalizedRect.top}px`;
            ghost.style.width = `${normalizedRect.width}px`;
            ghost.style.height = `${normalizedRect.height}px`;
            ghost.style.pointerEvents = 'none';
            ghost.style.opacity = '0.85';
            ghost.style.zIndex = '9999';
            ghost.style.margin = '0';
            ghost.style.boxSizing = 'border-box';
            dragGhostRef.current?.remove();
            dragGhostRef.current = ghost;
            document.body.appendChild(ghost);
            removeDragPlaceholder(dragPlaceholderRef);
            setGlobalDragSelection(true);
            setDragState({
              view: currentView,
              itemId: 'plannedDate' in item ? item.id : item.sourceId,
              kind: 'move',
              source: 'plannedDate' in item ? 'planned' : item.kind,
              duration: durationMinutes,
              pointerOffsetMinutes: Math.max(0, Math.min(durationMinutes - 30, pointerMinutes - itemStartMinutes)),
              pointerOffsetX: grabOffsetX,
              pointerOffsetY: grabOffsetY,
              startPointerClientX: event.clientX,
              startPointerClientY: event.clientY,
              pointerClientX: event.clientX,
              pointerClientY: event.clientY,
              viewportScale,
              originDate: date,
              originalStartMinutes: startMinutes,
              originalEndMinutes: startMinutes + durationMinutes,
              previewWidth: wrapperRect.width / viewportScale,
              previewHeight: wrapperRect.height / viewportScale,
            });
          }}
          onContextMenu={(event) => {
            if (isLockedGhost) return;
            event.preventDefault();
            if ('plannedDate' in item) {
              setDraft(buildDraft('edit-plan', projectId, item));
              return;
            }
            setDraft(buildDraft(item.kind === 'planned' ? 'edit-log-planned' : 'edit-log-extra', projectId, item));
          }}
        >
          {!isLockedGhost && (
            <div className="pointer-events-none absolute right-2 top-2 z-20 flex items-center rounded-full bg-black/15 px-1 py-0.5 opacity-80 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] transition-opacity group-hover:opacity-100">
              <GripVertical size={10} className="text-white/90" />
            </div>
          )}
          {!isLockedGhost && (
            <>
              <button
                type="button"
                data-resize="start"
                className="absolute left-1.5 right-1.5 top-0 z-20 h-4 cursor-ns-resize rounded-t-xl"
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const viewportScale = getViewportScale();
                  setGlobalDragSelection(true);
                  setDragState({
                    view: currentView,
                    itemId: 'plannedDate' in item ? item.id : item.sourceId,
                    kind: 'resize-start',
                    source: 'plannedDate' in item ? 'planned' : item.kind,
                    duration: durationMinutes,
                    pointerOffsetMinutes: 0,
                    pointerOffsetX: 0,
                    pointerOffsetY: 0,
                    startPointerClientX: event.clientX,
                    startPointerClientY: event.clientY,
                    pointerClientX: event.clientX,
                    pointerClientY: event.clientY,
                    viewportScale,
                    originDate: date,
                    originalStartMinutes: startMinutes,
                    originalEndMinutes: startMinutes + durationMinutes,
                    previewWidth: 0,
                    previewHeight: 0,
                  });
                }}
              >
                <span className="mx-auto mt-1 block h-1 w-10 rounded-full bg-white/75 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
              <button
                type="button"
                data-resize="end"
                className="absolute left-1.5 right-1.5 bottom-0 z-20 h-4 cursor-ns-resize rounded-b-xl"
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const viewportScale = getViewportScale();
                  setGlobalDragSelection(true);
                  setDragState({
                    view: currentView,
                    itemId: 'plannedDate' in item ? item.id : item.sourceId,
                    kind: 'resize-end',
                    source: 'plannedDate' in item ? 'planned' : item.kind,
                    duration: durationMinutes,
                    pointerOffsetMinutes: 0,
                    pointerOffsetX: 0,
                    pointerOffsetY: 0,
                    startPointerClientX: event.clientX,
                    startPointerClientY: event.clientY,
                    pointerClientX: event.clientX,
                    pointerClientY: event.clientY,
                    viewportScale,
                    originDate: date,
                    originalStartMinutes: startMinutes,
                    originalEndMinutes: startMinutes + durationMinutes,
                    previewWidth: 0,
                    previewHeight: 0,
                  });
                }}
              >
                <span className="mx-auto mt-2 block h-1 w-10 rounded-full bg-white/75 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            </>
          )}
          <div className={`relative z-10 flex h-full min-h-0 flex-col overflow-hidden rounded-xl px-3 py-2.5 ${isLockedGhost ? 'bg-slate-700/30' : 'bg-black/8'} ${compact ? 'text-[12px]' : 'text-[13px]'}`}>
            <div className="flex min-w-0 items-start gap-1 font-semibold">
              <span
                className={`min-w-0 flex-1 overflow-hidden break-words leading-tight ${titleSizeClass}`}
                style={{
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: titleLineClamp,
                }}
              >
                {title}
              </span>
              {showBadges && isLockedGhost && <span className="shrink-0 rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-bold uppercase">Planned</span>}
              {showBadges && logItem?.kind === 'extra' && <span className="shrink-0 rounded-full bg-white/25 px-1.5 py-0.5 text-[9px] font-bold uppercase">Extra</span>}
              {showBadges && currentView === 'log' && !isLockedGhost && <span className="shrink-0 rounded-full bg-white/25 px-1.5 py-0.5 text-[9px] font-bold uppercase">Actual</span>}
              {showBadges && moved && !isLockedGhost && <span className="shrink-0 rounded-full bg-white/25 px-1.5 py-0.5 text-[9px] font-bold uppercase">Moved</span>}
            </div>
            {showTime && (
              <div className={`mt-1.5 flex min-w-0 items-center gap-1.5 font-medium opacity-95 ${metaSizeClass}`}>
                <Clock3 size={compact ? 11 : isTinyCard ? 11 : 12} className="shrink-0" />
                <span className="truncate font-mono">{start} - {end}</span>
              </div>
            )}
            {showNotes && (
              <div
                className="mt-2 overflow-hidden break-words text-[12px] leading-tight opacity-92"
                style={{
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: moved ? 1 : 2,
                }}
              >
                {notes}
              </div>
            )}
            {showMovedFrom && (
              <div className="mt-auto truncate pt-1 text-[11px] font-medium opacity-90">
                {text('Moved from')} {format(parseISO(originalItem.plannedDate), 'EEE')} {originalItem.plannedStart}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const timeMarkers = useMemo(() => {
    const entries: Array<{ minute: number; label: string }> = [];
    for (let minute = 0; minute <= 1440; minute += timelineConfig.labelStepMinutes) {
      entries.push({
        minute,
        label: minutesToTimeString(Math.min(1440, minute)),
      });
    }
    return entries;
  }, [timelineConfig.labelStepMinutes]);
  const gridLines = useMemo(() => {
    const entries: number[] = [];
    for (let minute = 0; minute <= 1440; minute += timelineConfig.gridStepMinutes) {
      entries.push(minute);
    }
    return entries;
  }, [timelineConfig.gridStepMinutes]);
  const hourRows = useMemo(
    () => Array.from({ length: 24 }, (_, index) => index * HOUR_ROW_MINUTES),
    [],
  );
  const dragPreviewLayout = useMemo(() => {
    if (!dragPreview) return null;
    const dayIndex = renderedDayMap.get(dragPreview.date);
    if (dayIndex === undefined) return null;

    const startMinutes = timeStringToMinutes(dragPreview.start);
    const durationMinutes = getDurationMinutes(dragPreview.start, dragPreview.end);
    return {
      top: timelinePadding + (startMinutes * pixelsPerMinute),
      height: Math.max(Math.max(18, timelineConfig.gridStepMinutes * pixelsPerMinute), durationMinutes * pixelsPerMinute),
      left: dayIndex * dayColumnWidth,
      width: dayColumnWidth,
    };
  }, [dayColumnWidth, dragPreview, pixelsPerMinute, renderedDayMap, timelineConfig.gridStepMinutes, timelinePadding]);

  return (
    <div className={`flex h-full min-h-0 select-none flex-col ${compact ? 'text-xs' : 'text-sm'}`}>
      <div className={`flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800 ${compact ? 'px-2 py-2' : ''}`}>
        <div>
          <div className={`font-semibold text-gray-900 dark:text-gray-100 ${compact ? 'text-xs' : 'text-sm'}`}>{projectName}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {currentPlanItem
              ? `${text('Current')}: ${currentPlanItem.title} (${currentPlanItem.plannedStart}-${currentPlanItem.plannedEnd})`
              : nextPlanItem
                ? `${text('Next')}: ${nextPlanItem.title} (${nextPlanItem.plannedStart})`
                : text('No more planned time today')}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-700/60">
            {(['plan', 'log'] as PlannerBoardView[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setView(tab)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${view === tab ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-300'}`}
              >
                {tab === 'plan' ? text('Plan') : text('Log')}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-700/60">
            {([
              { value: 'weekdays', label: text('Workdays'), dayCount: 5 },
              { value: 'weekdays-weekends', label: text('Weekdays'), dayCount: 7 },
            ] as { value: PlannerWeekMode; label: string; dayCount: number }[]).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  const mondayId = format(startOfWeek(weekStartDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
                  setProjectWeekMode(projectId, option.value);
                  applyVisibleDayCount(option.dayCount, { anchorDayId: mondayId });
                }}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${weekMode === option.value && visibleDayCount === option.dayCount ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-300'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={openCreateDraft} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            <Plus size={12} /> {text('Add Event')}
          </button>
        </div>
      </div>

      <div className={`flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs dark:border-gray-700 dark:bg-gray-900/50 ${compact ? 'px-2' : ''}`}>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => scrollToWeekStart(subWeeks(weekStartDate, 1))} className="rounded-md p-1 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700"><ChevronLeft size={14} /></button>
            <button type="button" onClick={() => scrollToWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))} className="rounded-md border border-gray-200 px-2 py-1 font-medium text-gray-600 hover:bg-white dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">{text('Today')}</button>
            <button type="button" onClick={() => scrollToWeekStart(addWeeks(weekStartDate, 1))} className="rounded-md p-1 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700"><ChevronRight size={14} /></button>
            <span className="ml-2 font-semibold text-gray-700 dark:text-gray-200">{format(weekStartDate, 'MMM d')} - {format(addDays(weekStartDate, visibleDayCount - 1), 'MMM d, yyyy')}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-gray-500 dark:text-gray-300">
          <span>{text('Planned')}: <strong className="text-gray-900 dark:text-white">{formatMinutes(totals.plannedMinutes)}</strong></span>
          <span>{text('Actual')}: <strong className="text-gray-900 dark:text-white">{formatMinutes(totals.actualMinutes)}</strong></span>
          <span className={totals.deltaMinutes > 0 ? 'text-red-500' : totals.deltaMinutes < 0 ? 'text-green-600' : ''}>{text('Delta')}: <strong>{totals.deltaMinutes > 0 ? '+' : ''}{formatMinutes(Math.abs(totals.deltaMinutes))}</strong></span>
        </div>
      </div>

      {!compact && (
        <div className="border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div
                ref={dayTrackRef}
                data-planner-scroll-track="true"
                className="planner-scrollbar-track h-12"
                style={{ width: viewportWidth > 0 ? `${viewportWidth}px` : '100%' }}
                onWheel={(event) => {
                  event.preventDefault();
                  const direction = event.deltaY > 0 ? 1 : -1;
                  resizeVisibleDayCountAroundCenter(visibleDayCount + direction);
                }}
              >
                <div className="planner-scrollbar-rail inset-x-4 top-1/2 h-1.5 -translate-y-1/2" />
                <div
                  ref={dayThumbRef}
                  data-planner-scroll-thumb="true"
                  className="planner-scrollbar-thumb planner-scrollbar-thumb-horizontal day-scroll-thumb"
                  style={{ width: `${dayJoystickThumbWidth}px` }}
                >
                  <button
                    type="button"
                    data-planner-scroll-resize="left"
                    aria-label={text('Show more or fewer days from the left edge')}
                    className="planner-scrollbar-handle planner-scrollbar-handle-horizontal planner-scrollbar-handle-horizontal-left cursor-ew-resize"
                    onMouseDown={(event) => {
                      dayResizeRef.current = {
                        active: true,
                        edge: 'left',
                        startX: event.clientX,
                        startCount: visibleDayCount,
                      };
                      setGlobalDragSelection(true);
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                  >
                    <span className="h-5 w-1 rounded-full bg-indigo-600/75 dark:bg-indigo-100/75" />
                  </button>
                  <button
                    type="button"
                    data-planner-scroll-thumb-center="true"
                    className="planner-scrollbar-center planner-scrollbar-center-horizontal cursor-ew-resize"
                    onMouseDown={(event) => {
                      dayJoystickDragRef.current = {
                        active: true,
                        startX: event.clientX,
                      };
                      setDayScrollArrowDirection(null);
                      setGlobalDragSelection(true);
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    aria-label={text('Drag to scroll days')}
                  >
                    <span ref={dayLeftArrowRef} className="day-thumb-arrow day-thumb-arrow-left" />
                    <span className="planner-scrollbar-grip">
                      <GripVertical size={11} />
                      <GripVertical size={11} />
                    </span>
                    <span ref={dayRightArrowRef} className="day-thumb-arrow day-thumb-arrow-right" />
                  </button>
                  <button
                    type="button"
                    data-planner-scroll-resize="right"
                    aria-label={text('Show more or fewer days from the right edge')}
                    className="planner-scrollbar-handle planner-scrollbar-handle-horizontal planner-scrollbar-handle-horizontal-right cursor-ew-resize"
                    onMouseDown={(event) => {
                      dayResizeRef.current = {
                        active: true,
                        edge: 'right',
                        startX: event.clientX,
                        startCount: visibleDayCount,
                      };
                      setGlobalDragSelection(true);
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                  >
                    <span className="h-5 w-1 rounded-full bg-indigo-600/75 dark:bg-indigo-100/75" />
                  </button>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                data-planner-snap-toggle="true"
                onClick={() => setSnapMode((current) => !current)}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${snapMode ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200'}`}
              >
                {snapMode ? text('Snap') : text('Smooth')}
              </button>
              <div className="shrink-0 rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                {visibleDayCount} {text('days')}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 p-3 md:p-4">
        <div className="flex h-full min-h-0 overflow-hidden rounded-2xl border border-slate-300/80 bg-slate-50/70 shadow-[0_0_0_1px_rgba(15,23,42,0.05),0_18px_40px_rgba(15,23,42,0.14)] dark:border-slate-700/90 dark:bg-slate-950/55 dark:shadow-[0_0_0_1px_rgba(148,163,184,0.08),0_18px_40px_rgba(2,6,23,0.42)]">
          <div
            className="relative flex w-[68px] shrink-0 flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/70"
            onWheel={(event) => {
              if (compact || !boardViewportRef.current) return;
              event.preventDefault();
              if (event.altKey) {
                applyTimeZoom(timeZoomRef.current + (event.deltaY < 0 ? 0.12 : -0.12), {
                  anchorClientY: event.clientY,
                });
                return;
              }
              if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
                if (!dayScrollRef.current) return;
                scrollHorizontallyTo(dayScrollRef.current.scrollLeft + (event.deltaX || event.deltaY), 'auto');
                return;
              }
              boardViewportRef.current.scrollTop += event.deltaY;
            }}
          >
            <div className="shrink-0 border-b border-gray-200 dark:border-gray-700" style={{ height: 57 }} />
            <div className="time-axis min-h-0 flex-1 overflow-hidden">
              <div className="time-labels">
                <div className="relative" style={{ height: boardHeight, transform: `translateY(-${scrollTop}px)` }}>
                {timeMarkers.map((marker) => (
                  <div key={`${marker.minute}-${marker.label}`} className="absolute left-0 right-0 text-[12px] text-gray-600 dark:text-gray-200" style={{ top: timelinePadding + (marker.minute * pixelsPerMinute) - 9 }}>
                    <div className="px-0.5">
                      <span className="inline-flex w-full justify-center px-0 py-0.5 font-mono text-[11px] font-semibold">{marker.label}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div
                className="pointer-events-none absolute left-1.5 z-40 flex items-center gap-1"
                style={{ top: railIndicatorLabelTop }}
              >
                <div className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_0_2px_rgba(255,255,255,0.85)] dark:shadow-[0_0_0_2px_rgba(15,23,42,0.85)]" />
                <div className="rounded-full bg-red-500 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white shadow-[0_6px_18px_rgba(239,68,68,0.32)]">
                  {minutesToTimeString(nowMinutes)}
                </div>
              </div>
            </div>
              <div className="time-scrollbar planner-scrollbar-bar px-0 py-2">
                <div
                  ref={timeTrackRef}
                  data-planner-time-scroll-track="true"
                  className="planner-scrollbar-track time-scroll-track h-full w-full"
                >
                  <div className="planner-scrollbar-rail left-1/2 top-4 bottom-4 w-1.5 -translate-x-1/2" />
                  <div
                    ref={timeThumbRef}
                    data-planner-time-scroll-thumb="true"
                    className="planner-scrollbar-thumb time-scroll-thumb"
                  >
                    <button
                      type="button"
                      data-planner-time-zoom-handle-top="true"
                      className="planner-scrollbar-handle planner-scrollbar-handle-vertical planner-scrollbar-handle-vertical-top cursor-ns-resize"
                      title={text('Drag up or down to adjust time scale')}
                      onMouseDown={(event) => {
                        zoomDragRef.current = {
                          kind: 'time-zoom',
                          startPointer: event.clientY,
                          startValue: timeZoomRef.current,
                        };
                        setGlobalDragSelection(true);
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                    />
                    <button
                      type="button"
                      data-planner-time-scroll-thumb-center="true"
                      className="planner-scrollbar-center planner-scrollbar-center-vertical cursor-grab active:cursor-grabbing"
                      aria-label={text('Drag to scroll time grid')}
                      onMouseDown={(event) => {
                        timeThumbDragRef.current = {
                          active: true,
                          startY: event.clientY,
                          startTop: Number.parseFloat(timeThumbRef.current?.style.top ?? '0') || 0,
                        };
                        setGlobalDragSelection(true);
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                    >
                      <span className="planner-scrollbar-grip planner-scrollbar-grip-vertical">
                        <GripVertical size={10} />
                        <GripVertical size={10} />
                      </span>
                    </button>
                    <button
                      type="button"
                      data-planner-time-zoom-handle-bottom="true"
                      className="planner-scrollbar-handle planner-scrollbar-handle-vertical planner-scrollbar-handle-vertical-bottom cursor-ns-resize"
                      title={text('Drag up or down to adjust time scale')}
                      onMouseDown={(event) => {
                        zoomDragRef.current = {
                          kind: 'time-zoom',
                          startPointer: event.clientY,
                          startValue: timeZoomRef.current,
                        };
                        setGlobalDragSelection(true);
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            ref={dayScrollRef}
            className="day-scroll-container relative min-h-0 flex-1 overflow-x-auto overflow-y-hidden"
            onScroll={(event) => {
              const nextScrollLeft = event.currentTarget.scrollLeft;
              if (scrollSyncFrameRef.current !== null) {
                window.cancelAnimationFrame(scrollSyncFrameRef.current);
              }
              scrollSyncFrameRef.current = window.requestAnimationFrame(() => {
                syncVisibleRangeFromScroll(nextScrollLeft);
                scheduleSnapToNearestDay();
              });
            }}
            onMouseDown={(event) => {
              if (!dayScrollRef.current || dragStateRef.current) return;
              const target = event.target as HTMLElement;
              if (target.closest('[data-planner-event-card="live"], [data-resize], button, input, textarea, select, a')) return;
              scrollDragRef.current = {
                active: true,
                startX: event.clientX,
                startLeft: dayScrollRef.current.scrollLeft,
              };
              setGlobalDragSelection(true);
              event.preventDefault();
            }}
          >
            <div className="flex h-full min-h-0 flex-col" style={{ width: boardWidth }}>
              <div
                ref={dayHeaderRef}
                data-planner-day-header="true"
                className="planner-day-header-glass"
                style={{ width: boardWidth, height: 57 }}
              >
                {windowedDays.map((day, windowIndex) => {
                  const mutedWeekend = hideWeekends && isWeekendDay(day);
                  return (
                    <div
                      key={day.toISOString()}
                      className={`absolute bottom-0 top-0 box-border overflow-hidden border-l border-gray-200 px-2 py-2 first:border-l-0 dark:border-slate-700/80 ${isToday(day) ? 'bg-indigo-500/14' : mutedWeekend ? 'bg-gray-100/90 dark:bg-slate-800/70' : ''}`}
                      style={{
                        left: (windowStartIndex + windowIndex) * dayColumnWidth,
                        width: dayColumnWidth,
                        minWidth: dayColumnWidth,
                        maxWidth: dayColumnWidth,
                      }}
                    >
                      <div className={`min-w-0 truncate text-sm font-semibold ${!mutedWeekend ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>{format(day, 'EEEE')}</div>
                      <div className={`min-w-0 truncate text-xs font-medium ${!mutedWeekend ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}`}>{format(day, 'MMM d')}</div>
                    </div>
                  );
                })}
              </div>
              <div className="relative min-h-0 flex-1">
                <div
                  data-planner-now-line="true"
                  className="pointer-events-none absolute left-0 right-0 z-20"
                  style={{ top: viewportIndicatorTop }}
                >
                  <div className="h-0.5 bg-red-500/90 shadow-[0_0_12px_rgba(239,68,68,0.55)]" />
                </div>
                <div
                  ref={boardViewportRef}
                  data-planner-scroll-container="true"
                  className="relative min-h-0 h-full overflow-y-auto overflow-x-hidden"
                  onScroll={(event) => {
                    setScrollTop(event.currentTarget.scrollTop);
                    updateTimeThumbMetrics(event.currentTarget.scrollTop);
                  }}
                  onWheel={(event) => {
                    if (compact) return;
                    if (event.altKey) {
                      event.preventDefault();
                      const pointerMinutes = getPointerMinutesFromClientY(event.clientY);
                      applyTimeZoom(timeZoomRef.current + (event.deltaY < 0 ? 0.12 : -0.12), {
                        anchorClientY: event.clientY,
                        anchorMinutes: pointerMinutes ?? undefined,
                      });
                      return;
                    }

                    if ((event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) && dayScrollRef.current) {
                      event.preventDefault();
                      scrollHorizontallyTo(dayScrollRef.current.scrollLeft + (event.deltaX || event.deltaY), 'auto');
                    }
                  }}
                >
                  <div className="overflow-hidden rounded-r-2xl border-l border-slate-300/80 bg-white/75 dark:border-slate-700/90 dark:bg-slate-900/45" style={{ width: boardWidth }}>
                    <div
                      ref={boardRef}
                      data-planner-grid="true"
                      className="relative bg-white dark:bg-slate-900"
                      style={{
                        width: boardWidth,
                        height: boardHeight,
                      }}
                  onMouseMove={(event) => {
                    const pointerMinutes = getPointerMinutesFromClientY(event.clientY);
                    if (pointerMinutes === null) return;
                    setHoverMinutes(toSnapMinutes(pointerMinutes, timelineConfig.snapStepMinutes));
                  }}
                  onMouseLeave={() => setHoverMinutes(null)}
                  onContextMenu={(event) => {
                    const pointerSlot = getPointerSlotFromClientPosition(event.clientX, event.clientY);
                    if (!pointerSlot) return;
                    event.preventDefault();
                    setContextMenu({
                      x: event.clientX,
                      y: event.clientY,
                      date: pointerSlot.date,
                      startMinutes: pointerSlot.startMinutes,
                    });
                  }}
                  onMouseDown={() => {
                    if (contextMenu) setContextMenu(null);
                  }}
                >
                  {hourRows.map((minute) => (
                    <div
                      key={`hour-row-${minute}`}
                      className="hour-row pointer-events-none absolute left-0 right-0"
                      data-minute={minute}
                      data-minutes-per-row={HOUR_ROW_MINUTES}
                      style={{
                        top: timelinePadding + (minute * pixelsPerMinute),
                        height: HOUR_ROW_MINUTES * pixelsPerMinute,
                      }}
                    />
                  ))}
                  {windowedDays.map((day, windowIndex) => {
                    const mutedWeekend = hideWeekends && isWeekendDay(day);
                    return (
                      <div
                        key={day.toISOString()}
                        data-planner-day-column="true"
                        data-planner-day={format(day, 'yyyy-MM-dd')}
                        className="day-column absolute border-l border-gray-200 first:border-l-0 dark:border-slate-700/80"
                        style={{
                          left: (windowStartIndex + windowIndex) * dayColumnWidth,
                          width: dayColumnWidth,
                          minWidth: dayColumnWidth,
                          height: boardHeight,
                        }}
                      >
                        <div
                          className={`absolute inset-x-0 ${isToday(day) ? 'bg-indigo-50/40 dark:bg-indigo-900/10' : mutedWeekend ? 'bg-gray-100/70 dark:bg-gray-950/70' : ''}`}
                          style={{ top: timelinePadding, bottom: timelinePadding }}
                        >
                          {gridLines.map((minute, minuteIndex) => {
                            const isLabelBoundary = minute % timelineConfig.labelStepMinutes === 0;
                            return (
                              <div
                                key={`${day.toISOString()}-${minute}`}
                                className={`planner-grid-band absolute left-0 right-0 border-b ${isLabelBoundary ? 'border-gray-300/90 dark:border-slate-600/70' : 'border-gray-200 dark:border-slate-700/55'} ${minuteIndex % 2 === 0 ? 'bg-transparent' : 'planner-grid-band--striped'}`}
                                style={{ top: minute * pixelsPerMinute, height: timelineConfig.gridStepMinutes * pixelsPerMinute }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {view === 'log' && visiblePlanItems.map((item) => renderCard(item, 'log', { isLockedGhost: true }))}
                  {dragPreview && dragPreviewLayout && (
                    <div
                      data-planner-drag-placeholder="true"
                      className="pointer-events-none absolute px-1.5"
                      style={{
                        top: dragPreviewLayout.top,
                        left: dragPreviewLayout.left,
                        width: dragPreviewLayout.width,
                        height: dragPreviewLayout.height,
                      }}
                    >
                      <div className="h-full rounded-xl border-2 border-dashed border-slate-400/90 bg-slate-400/12 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.18)] dark:border-slate-300/70 dark:bg-slate-200/10" />
                    </div>
                  )}
                  {(view === 'plan' ? visiblePlanItems : visibleLogItems).map((item) => renderCard(item as PlannerPlanItem & PlannerDerivedLogItem, view))}

                  {hoverMinutes !== null && !compact && (
                    <div className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/70 px-2 py-1 text-[10px] font-mono text-white">
                      {minutesToTimeString(hoverMinutes)}
                    </div>
                  )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {contextMenu && contextMenuItems.length > 0 && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}

      {draft && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl dark:bg-gray-800">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-900 dark:text-white">
                  {draft.mode.startsWith('create') ? text('Add event') : text('Edit event')}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {draft.mode.includes('log') ? text('Log view event details') : text('Planned schedule details')}
                </div>
              </div>
              {draft.mode === 'edit-log-planned' && (
                <button type="button" onClick={() => { if (draft.itemId) resetLogOverride(draft.itemId); setDraft(null); }} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700">
                  <RotateCcw size={12} /> {text('Reset to plan')}
                </button>
              )}
            </div>

            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-[1fr_17rem]">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">{text('Event name')}</label>
                  <input value={draft.title} onChange={(event) => setDraft((current) => current ? { ...current, title: event.target.value } : current)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">{text('Event color')}</label>
                  <ColorPicker
                    color={draft.color}
                    onChange={(color) => setDraft((current) => current ? { ...current, color } : current)}
                    buttonLabel={text('Pick event color')}
                    paletteMode="office"
                    commitMode="live"
                    panelZIndex={1400}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">{text('Date')}</label>
                  <input type="date" value={draft.date} onChange={(event) => setDraft((current) => current ? { ...current, date: event.target.value } : current)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">{text('From')}</label>
                  <input type="time" value={draft.start} onChange={(event) => setDraft((current) => current ? { ...current, start: event.target.value } : current)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">{text('To')}</label>
                  <input type="time" value={draft.end} onChange={(event) => setDraft((current) => current ? { ...current, end: event.target.value } : current)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">{text('Notes')}</label>
                <textarea value={draft.notes} rows={4} onChange={(event) => setDraft((current) => current ? { ...current, notes: event.target.value } : current)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
              </div>

              {draft.mode === 'edit-log-planned' && (
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">{text('Why this changed in the log')}</label>
                  <textarea value={draft.replacementNote} rows={2} onChange={(event) => setDraft((current) => current ? { ...current, replacementNote: event.target.value } : current)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  if (draft.mode === 'edit-plan' && draft.itemId) deletePlanItem(draft.itemId);
                  if (draft.mode === 'edit-log-extra' && draft.itemId) deleteExtraLogItem(draft.itemId);
                  setDraft(null);
                }}
                className={`rounded-xl px-3 py-2 text-xs font-semibold ${draft.mode.startsWith('edit') ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20' : 'text-transparent'}`}
              >
                {draft.mode.startsWith('edit') ? text('Delete') : '.'}
              </button>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setDraft(null)} className="rounded-xl px-4 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">{text('Cancel')}</button>
                <button type="button" onClick={saveDraft} className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700">{text('Save')}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}