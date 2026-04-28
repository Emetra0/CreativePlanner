import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, FolderOpen, Search, Star, FolderPlus } from 'lucide-react';
import PlannerBoard from '@/components/planner/PlannerBoard';
import ShortcutHelpPanel from '@/components/ShortcutHelpPanel';
import { useAppTranslation } from '@/lib/appTranslations';
import { useMindmapStore } from '@/store/useMindmapStore';
import { getDurationMinutes, usePlannerStore } from '@/store/usePlannerStore';
import { eventMatchesKeybind, formatKeybindCombo } from '@/lib/keybinds';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useLocation, useNavigate } from 'react-router-dom';

export default function PlannerPage() {
  const { text } = useAppTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { documents, toggleFavorite } = useMindmapStore();
  const keybinds = useSettingsStore((state) => state.keybinds);
  const planItems = usePlannerStore((state) => state.planItems);
  const logOverrides = usePlannerStore((state) => state.logOverrides);
  const extraLogItems = usePlannerStore((state) => state.extraLogItems);
  const projectSettings = usePlannerStore((state) => state.projectSettings);
  const projectCategories = usePlannerStore((state) => state.projectCategories);
  const addProjectCategory = usePlannerStore((state) => state.addProjectCategory);
  const setProjectSidebarCategory = usePlannerStore((state) => state.setProjectSidebarCategory);
  const mindmapDocs = useMemo(() => documents.filter((document) => (document as any).type !== 'moodboard'), [documents]);
  const [projectId, setProjectId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);

  useEffect(() => {
    if (!mindmapDocs.length) {
      setProjectId('');
      return;
    }

    setProjectId((current) => {
      if (current && mindmapDocs.some((document) => document.id === current)) {
        return current;
      }
      return mindmapDocs[0].id;
    });
  }, [mindmapDocs]);

  const selectedProject = mindmapDocs.find((document) => document.id === projectId);

  const projectStats = useMemo(() => {
    return mindmapDocs.map((document) => {
      const projectPlans = planItems.filter((item) => item.projectId === document.id);
      const projectExtras = extraLogItems.filter((item) => item.projectId === document.id);
      const plannedMinutes = projectPlans.reduce((sum, item) => sum + getDurationMinutes(item.plannedStart, item.plannedEnd), 0);
      const actualMinutes = projectPlans.reduce((sum, item) => {
        const override = logOverrides.find((entry) => entry.planItemId === item.id);
        return sum + getDurationMinutes(override?.actualStart || item.plannedStart, override?.actualEnd || item.plannedEnd);
      }, 0) + projectExtras.reduce((sum, item) => sum + getDurationMinutes(item.actualStart, item.actualEnd), 0);

      return {
        id: document.id,
        title: document.title,
        isFavorite: Boolean(document.isFavorite),
        sidebarCategory: projectSettings[document.id]?.sidebarCategory || '',
        plannedMinutes,
        actualMinutes,
        plannedCount: projectPlans.length,
      };
    });
  }, [extraLogItems, logOverrides, mindmapDocs, planItems, projectSettings]);

  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return projectStats;
    return projectStats.filter((project) => {
      const category = project.sidebarCategory || text('Uncategorized');
      return project.title.toLowerCase().includes(query) || category.toLowerCase().includes(query);
    });
  }, [projectStats, searchQuery, text]);

  const favoriteProjects = useMemo(
    () => filteredProjects.filter((project) => project.isFavorite),
    [filteredProjects],
  );

  const groupedProjects = useMemo(() => {
    return filteredProjects.reduce<Record<string, typeof filteredProjects>>((groups, project) => {
      const key = project.sidebarCategory || text('Uncategorized');
      groups[key] = [...(groups[key] || []), project];
      return groups;
    }, {});
  }, [filteredProjects, text]);

  const orderedCategoryNames = useMemo(() => {
    const fromProjects = Object.keys(groupedProjects);
    const merged = [...projectCategories, ...fromProjects];
    return Array.from(new Set(merged.filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [groupedProjects, projectCategories]);

  const selectedCategory = selectedProject ? projectSettings[selectedProject.id]?.sidebarCategory || '' : '';
  const plannerHelpCombo = useMemo(() => formatKeybindCombo('planner.help', keybinds), [keybinds]);
  const plannerNewEventCombo = useMemo(() => formatKeybindCombo('planner.newEvent', keybinds), [keybinds]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || (document.activeElement as HTMLElement | null)?.isContentEditable;

      if (!isTyping && eventMatchesKeybind('planner.help', event, keybinds)) {
        event.preventDefault();
        setShowShortcutHelp((current) => !current);
        return;
      }

      if (event.key === 'Escape' && showShortcutHelp) {
        event.preventDefault();
        setShowShortcutHelp(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [keybinds, showShortcutHelp]);

  const handleCreateCategory = () => {
    const normalized = newCategoryName.trim();
    if (!normalized) return;
    addProjectCategory(normalized);
    if (selectedProject) {
      setProjectSidebarCategory(selectedProject.id, normalized);
    }
    setNewCategoryName('');
  };

  const renderProjectButton = (project: (typeof projectStats)[number]) => {
    const active = project.id === projectId;
    return (
      <div
        key={project.id}
        className={`w-full rounded-2xl border transition-colors ${active ? 'border-indigo-300 bg-indigo-50 text-indigo-950 dark:border-indigo-500/60 dark:bg-indigo-500/10 dark:text-indigo-100' : 'border-stone-200 bg-stone-50 text-stone-700 hover:border-stone-300 hover:bg-white dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-gray-700 dark:hover:bg-gray-800'}`}
      >
        <div className="flex items-start gap-2 px-4 pt-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{project.title}</div>
            <div className="mt-1 flex items-center gap-3 text-[11px] text-stone-500 dark:text-gray-400">
              <span>{project.plannedCount} {text(project.plannedCount === 1 ? 'event' : 'events')}</span>
              <span>{text('Planned')} {Math.round(project.plannedMinutes / 60 * 10) / 10}h</span>
            </div>
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              toggleFavorite(project.id);
            }}
            className={`rounded-full p-1 transition-colors ${project.isFavorite ? 'text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-500/10' : 'text-stone-300 hover:bg-stone-200 hover:text-amber-500 dark:text-gray-600 dark:hover:bg-gray-800'}`}
            aria-label={project.isFavorite ? text('Remove favorite') : text('Add favorite')}
          >
            <Star size={14} fill={project.isFavorite ? 'currentColor' : 'none'} />
          </button>
        </div>
        <button type="button" onClick={() => setProjectId(project.id)} className="w-full px-4 pb-3 text-left">
        <div className="mt-2 flex items-center gap-2 text-[10px] text-stone-500 dark:text-gray-400">
          <span className="rounded-full bg-stone-200 px-2 py-0.5 dark:bg-gray-800">{project.sidebarCategory || text('Uncategorized')}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-gray-800">
          <div
            className={`h-full rounded-full ${project.actualMinutes > project.plannedMinutes ? 'bg-rose-500' : 'bg-emerald-500'}`}
            style={{ width: `${project.plannedMinutes ? Math.min(100, Math.round((project.actualMinutes / project.plannedMinutes) * 100)) : 0}%` }}
          />
        </div>
        </button>
      </div>
    );
  };

  return (
    <div className="flex h-full select-none overflow-hidden bg-stone-100 dark:bg-gray-950">
      <aside className="flex w-72 shrink-0 flex-col border-r border-stone-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-stone-200 px-5 py-4 dark:border-gray-800">
          <div className="flex items-center gap-2 text-stone-900 dark:text-gray-100">
            <ClipboardList size={18} className="text-indigo-600" />
            <h1 className="text-sm font-semibold">{text('Planner')}</h1>
          </div>
          <p className="mt-1 text-xs text-stone-500 dark:text-gray-400">
            {text('Build the week first, then let the log show what actually happened.')}
          </p>
          <div className="mt-3 flex items-center gap-2 rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-950">
            <Search size={14} className="text-stone-400 dark:text-gray-500" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={text('Search projects or categories')}
              className="w-full bg-transparent text-xs text-stone-700 outline-none placeholder:text-stone-400 dark:text-gray-200 dark:placeholder:text-gray-500"
            />
          </div>
          {selectedProject && (
            <div className="mt-3 space-y-2 rounded-2xl border border-stone-200 bg-stone-50 p-3 dark:border-gray-800 dark:bg-gray-950">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-400 dark:text-gray-500">{text('Planner category')}</div>
              <select
                value={selectedCategory}
                onChange={(event) => setProjectSidebarCategory(selectedProject.id, event.target.value || undefined)}
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-700 outline-none dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200"
              >
                <option value="">{text('Uncategorized')}</option>
                {orderedCategoryNames.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <input
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleCreateCategory();
                    }
                  }}
                  placeholder={text('Create category')}
                  className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-700 outline-none dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200"
                />
                <button type="button" onClick={handleCreateCategory} className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700">
                  <FolderPlus size={12} />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {projectStats.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-stone-300 px-6 text-center text-sm text-stone-500 dark:border-gray-700 dark:text-gray-400">
              <FolderOpen size={26} className="mb-3 text-stone-400 dark:text-gray-500" />
              <p>{text('Create a mindmap project first to attach a weekly planner to it.')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {favoriteProjects.length > 0 && (
                <div className="space-y-2">
                  <div className="px-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400 dark:text-gray-500">{text('Favorites')}</div>
                  {favoriteProjects.map(renderProjectButton)}
                </div>
              )}

              {Object.keys(groupedProjects).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stone-300 px-4 py-6 text-center text-xs text-stone-500 dark:border-gray-700 dark:text-gray-400">
                  {text('No planner projects match that search yet.')}
                </div>
              ) : (
                Object.entries(groupedProjects)
                  .sort(([left], [right]) => left.localeCompare(right))
                  .map(([category, projects]) => (
                    <div key={category} className="space-y-2">
                      <div className="px-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400 dark:text-gray-500">{category}</div>
                      {projects.map(renderProjectButton)}
                    </div>
                  ))
              )}
            </div>
          )}
        </div>
      </aside>

      <main className="relative min-w-0 flex-1 overflow-hidden">
        {selectedProject ? (
          <PlannerBoard projectId={selectedProject.id} projectName={selectedProject.title} />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-stone-500 dark:text-gray-400">
            {text('Select a project to plan the week.')}
          </div>
        )}

        <div className="pointer-events-none absolute bottom-4 left-6 z-[1150] text-[11px] font-medium text-stone-500 dark:text-gray-400">
          {text('Press')} {plannerHelpCombo} {text('to open keyboard shortcuts')}
        </div>
      </main>

      {showShortcutHelp && (
        <div className="fixed inset-0 z-[1200] bg-black/20" onClick={() => setShowShortcutHelp(false)}>
          <ShortcutHelpPanel
            scope="planner"
            keybinds={keybinds}
            badge={text('Planner')}
            title={text('Keyboard shortcuts')}
            description={text('This panel reflects the current shortcut settings.')}
            footerText={`${text('Use')} ${plannerNewEventCombo} ${text('to create a new planner event, and')} ${plannerHelpCombo} ${text('to open this help.')}`}
            manageLabel={text('Change hotkeys')}
            onClose={() => setShowShortcutHelp(false)}
            onManage={() => {
              setShowShortcutHelp(false);
              navigate('/settings?section=section-keybind-planner', { state: { from: `${location.pathname}${location.search}${location.hash}` } });
            }}
            className="absolute bottom-6 left-[calc(18rem+1.5rem)] w-[min(28rem,calc(100vw-22rem))] rounded-2xl border border-stone-200 bg-white/96 p-4 shadow-2xl backdrop-blur dark:border-gray-700 dark:bg-gray-900/96"
          />
        </div>
      )}
    </div>
  );
}
