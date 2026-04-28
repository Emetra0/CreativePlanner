import { useState, useMemo, useEffect, useRef } from 'react';
import {
  CheckSquare, Plus, Trash2, Circle, CheckCircle2, Clock,
  Flag, RotateCcw, ChevronDown, ChevronRight, Star, Layers,
  CalendarClock, X, Tag, User, Check, Settings2, Pencil, Users, Briefcase,
} from 'lucide-react';
import { format, isToday, parseISO, isBefore, startOfDay } from 'date-fns';
import { useTodoStore, TodoItem, TodoPriority, TodoStatus, todayString } from '@/store/useTodoStore';
import { useMindmapStore } from '@/store/useMindmapStore';
import { useTagStore, Tag as TagType, TAG_COLORS } from '@/store/useTagStore';
import { useProjectStore } from '@/store/useProjectStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useAppTranslation } from '@/lib/appTranslations';

// ─── Constants ─────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<TodoPriority, { cls: string }> = {
  low:    { cls: 'text-gray-300 dark:text-gray-600' },
  medium: { cls: 'text-yellow-400' },
  high:   { cls: 'text-red-500' },
};

// ─── TagPicker ───────────────────────────────────────────────────────
// Shown inside the add-form to pick and create tags.

function TagPicker({ selected, onChange }: { selected: string[]; onChange: (tags: string[]) => void }) {
  const { text } = useAppTranslation();
  const { tags, addTag, deleteTag } = useTagStore();
  const { todos, updateTodo } = useTodoStore();
  const [managing, setManaging] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState(TAG_COLORS[0]);

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((t) => t !== id) : [...selected, id]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel.trim()) return;
    const id = addTag(newLabel.trim(), newColor);
    onChange([...selected, id]);
    setNewLabel('');
  };

  const handleDelete = (tagId: string) => {
    deleteTag(tagId);
    onChange(selected.filter((id) => id !== tagId));
    todos.forEach((t) => {
      if (t.tags?.includes(tagId)) {
        updateTodo(t.id, { tags: t.tags.filter((id) => id !== tagId) });
      }
    });
  };

  const templateTags = tags.filter((t) => t.isTemplate);
  const customTags   = tags.filter((t) => !t.isTemplate);

  const TagPill = ({ tag }: { tag: TagType }) => {
    const active = selected.includes(tag.id);
    return (
      <div className="relative inline-flex">
        <button
          type="button"
          onClick={() => toggle(tag.id)}
          className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border transition-all"
          style={{
            backgroundColor: active ? `${tag.color}22` : 'transparent',
            color: tag.color,
            borderColor: active ? `${tag.color}90` : `${tag.color}50`,
          }}
        >
          {active && <Check size={8} strokeWidth={3} />}
          {tag.label}
        </button>
        {managing && (
          <button
            type="button"
            onClick={() => handleDelete(tag.id)}
            className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-sm transition-colors"
            title={text('Delete "{{title}}"', { title: tag.label })}
          >
            <X size={7} />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40">
      {templateTags.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5 flex items-center gap-1">
            <Star size={8} fill="currentColor" className="text-yellow-400" /> {text('Templates')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {templateTags.map((tag) => <TagPill key={tag.id} tag={tag} />)}
          </div>
        </div>
      )}

      {customTags.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">{text('My Tags')}</p>
          <div className="flex flex-wrap gap-1.5">
            {customTags.map((tag) => <TagPill key={tag.id} tag={tag} />)}
          </div>
        </div>
      )}

      <form onSubmit={handleCreate} className="flex items-center gap-2 mb-2 border-t border-gray-100 dark:border-gray-700 pt-2.5">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder={text('New tag name…')}
          className="flex-1 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5 outline-none text-gray-700 dark:text-gray-300 placeholder-gray-400"
        />
        <div className="flex gap-1 shrink-0">
          {TAG_COLORS.slice(0, 8).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setNewColor(c)}
              className={`w-4 h-4 rounded-full transition-transform ${newColor === c ? 'scale-125 ring-2 ring-white dark:ring-gray-800 ring-offset-1' : ''}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <button type="submit" disabled={!newLabel.trim()} className="text-xs px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg transition-colors shrink-0">
          + {text('Add')}
        </button>
      </form>

      <button
        type="button"
        onClick={() => setManaging((v) => !v)}
        className={`text-[10px] flex items-center gap-1 transition-colors ${
          managing ? 'text-red-500 font-semibold' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
        }`}
      >
        <Settings2 size={9} />
        {managing ? text('Done managing') : text('Manage / delete tags')}
      </button>
    </div>
  );
}

// ─── TodoRow ───────────────────────────────────────────────────────────────────

function TodoRow({ todo, onToggle, onDelete, onUpdate }: {
  todo: TodoItem;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<TodoItem>) => void;
}) {
  const { language, text } = useAppTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title);
  const { documents } = useMindmapStore();
  const { tags: allTags } = useTagStore();

  const projectLabel = todo.mindmapId
    ? documents.find((d) => d.id === todo.mindmapId)?.title
    : undefined;

  const todoTags = (todo.tags ?? [])
    .map((id) => allTags.find((t) => t.id === id))
    .filter(Boolean) as TagType[];

  const isOverdue = todo.dueDate && todo.status !== 'done'
    ? isBefore(parseISO(todo.dueDate), startOfDay(new Date()))
    : false;
  const dueDateLabel = todo.dueDate
    ? new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric' }).format(parseISO(todo.dueDate))
    : '';

  const commit = () => {
    if (draft.trim()) onUpdate(todo.id, { title: draft.trim() });
    else setDraft(todo.title);
    setEditing(false);
  };

  const removeTag = (tagId: string) =>
    onUpdate(todo.id, { tags: (todo.tags ?? []).filter((id) => id !== tagId) });

  const isDone = todo.status === 'done';

  return (
    <div className={`group flex flex-col px-4 py-2 rounded-xl transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/30 ${isDone ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-3">
      <button onClick={() => onToggle(todo.id)} className="shrink-0 hover:scale-110 transition-transform">
        {isDone
          ? <CheckCircle2 size={17} className="text-green-500" />
          : todo.status === 'in-progress'
            ? <Clock size={17} className="text-blue-500" />
            : <Circle size={17} className="text-gray-300 dark:text-gray-500 group-hover:text-gray-400" />
        }
      </button>

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setDraft(todo.title); setEditing(false); }
          }}
          className="flex-1 bg-transparent border-b border-blue-400 outline-none text-sm text-gray-800 dark:text-gray-100"
        />
      ) : (
        <span
          onDoubleClick={() => { setDraft(todo.title); setEditing(true); }}
          className={`flex-1 text-sm select-none cursor-text ${isDone ? 'line-through text-gray-400' : 'text-gray-800 dark:text-gray-100'}`}
        >
          {todo.title}
        </span>
      )}

      {todo.rolledOver && !isDone && (
        <span title={`${text('Originally from')} ${todo.originalScheduledDate}`} className="shrink-0">
          <RotateCcw size={11} className="text-amber-400" />
        </span>
      )}

      <Flag size={11} className={`shrink-0 ${PRIORITY_CONFIG[todo.priority].cls}`} />

      <select
        value={todo.status}
        onChange={(e) => onUpdate(todo.id, { status: e.target.value as TodoStatus })}
        className="shrink-0 text-[10px] border border-gray-200 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-700 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
      >
        <option value="todo">{text('To Do')}</option>
        <option value="in-progress">{text('In Progress')}</option>
        <option value="done">{text('Done')}</option>
      </select>

      <button
        onClick={() => onDelete(todo.id)}
        className="shrink-0 text-gray-300 dark:text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Trash2 size={13} />
      </button>
      </div>

      {/* Meta row: project tag + custom tags + assignee + due date */}
      {(projectLabel || todoTags.length > 0 || todo.assignee || todo.dueDate) && (
        <div className="flex items-center gap-1.5 pl-8 pt-1 pb-0.5 flex-wrap">
          {projectLabel && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/25 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-700/50">
              <Layers size={8} className="shrink-0" />
              {projectLabel}
            </span>
          )}
          {todoTags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border"
              style={{ backgroundColor: `${tag.color}18`, color: tag.color, borderColor: `${tag.color}50` }}
            >
              {tag.label}
              {!isDone && (
                <button onClick={() => removeTag(tag.id)} className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity" title={text('Remove tag')}>
                  <X size={7} />
                </button>
              )}
            </span>
          ))}
          {todo.assignee && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-teal-50 dark:bg-teal-900/25 text-teal-600 dark:text-teal-400 border border-teal-200 dark:border-teal-700/50">
              <User size={8} className="shrink-0" />
              {todo.assignee}
            </span>
          )}
          {todo.dueDate && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
              isOverdue
                ? 'bg-red-50 dark:bg-red-900/25 text-red-600 dark:text-red-400 border-red-200 dark:border-red-700/50'
                : 'bg-gray-50 dark:bg-gray-700/40 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600/50'
            }`}>
              <CalendarClock size={8} className="shrink-0" />
              {isOverdue ? `${text('Overdue')} · ` : ''}{dueDateLabel}
              {!isDone && (
                <button onClick={() => onUpdate(todo.id, { dueDate: undefined })} className="ml-0.5 hover:text-red-500 transition-colors" title={text('Remove deadline')}>
                  <X size={7} />
                </button>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── DaySection ────────────────────────────────────────────────────────────────

function DaySection({ dateStr, todos, isCurrentDay, onToggle, onDelete, onUpdate }: {
  dateStr: string;
  todos: TodoItem[];
  isCurrentDay: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<TodoItem>) => void;
}) {
  const { language, text } = useAppTranslation();
  const [collapsed, setCollapsed] = useState(!isCurrentDay && todos.every((t) => t.status === 'done'));

  const done = todos.filter((t) => t.status === 'done').length;
  const rolledCt = todos.filter((t) => t.rolledOver && t.status !== 'done').length;

  let label: string;
  try {
    const d = parseISO(dateStr);
    label = isToday(d)
      ? text('Today')
      : new Intl.DateTimeFormat(language, { weekday: 'long', month: 'long', day: 'numeric' }).format(d);
  } catch {
    label = dateStr;
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl border shadow-sm overflow-hidden ${
      isCurrentDay ? 'border-blue-200 dark:border-blue-800/60' : 'border-gray-100 dark:border-gray-700'
    }`}>
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50/60 dark:hover:bg-gray-700/20 transition-colors text-left"
      >
        {collapsed
          ? <ChevronRight size={14} className="text-gray-400 shrink-0" />
          : <ChevronDown size={14} className="text-gray-400 shrink-0" />
        }
        <span className={`font-semibold text-sm ${isCurrentDay ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-200'}`}>
          {label}
        </span>
        {isCurrentDay && (
          <span className="text-[10px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded-full">
            {text('Today')}
          </span>
        )}
        {rolledCt > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded-full">
            <RotateCcw size={9} /> {rolledCt} {text('rolled over')}
          </span>
        )}
        <span className="ml-auto text-xs text-gray-400 shrink-0">{done}/{todos.length} {text('done')}</span>
      </button>

      {/* Progress bar */}
      <div className="h-0.5 bg-gray-100 dark:bg-gray-700 mx-4">
        <div
          className="h-full bg-green-400 rounded-full transition-all duration-500"
          style={{ width: todos.length ? `${Math.round((done / todos.length) * 100)}%` : '0%' }}
        />
      </div>

      {!collapsed && (
        <div className="py-1">
          {todos.map((todo) => (
            <TodoRow key={todo.id} todo={todo} onToggle={onToggle} onDelete={onDelete} onUpdate={onUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function TodoPage() {
  const { text } = useAppTranslation();
  const { todos, addTodo, updateTodo, deleteTodo, toggleTodo, rolloverTodos } = useTodoStore();
  const { documents, toggleFavorite, updateDocumentMeta } = useMindmapStore();
  const { tags: allTags } = useTagStore();
  const { projects, fetchProjects } = useProjectStore();
  const { user } = useAuthStore();

  useEffect(() => { rolloverTodos(); }, [rolloverTodos]);
  useEffect(() => { fetchProjects(); }, []);

  const [newTitle,    setNewTitle]    = useState('');
  const [newPriority, setNewPriority] = useState<TodoPriority>('medium');
  const [newDueDate,  setNewDueDate]  = useState('');
  const [newTags,     setNewTags]     = useState<string[]>([]);
  const [newAssignee, setNewAssignee] = useState('');
  const [showDue,      setShowDue]      = useState(false);
  const [showTags,     setShowTags]     = useState(false);
  const [showAssignee, setShowAssignee] = useState(false);
  const [activeProject, setActiveProject] = useState<string>('all');
  const [showShared, setShowShared] = useState(false);

  // inline createdBy editing
  const [editingCreatedBy, setEditingCreatedBy] = useState<string | null>(null);
  const [createdByDraft,   setCreatedByDraft]   = useState('');
  const createdByRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editingCreatedBy) createdByRef.current?.focus(); }, [editingCreatedBy]);

  // Sort: favorites first (pinned), then alphabetical
  const sortedDocuments = useMemo(() => {
    const favs = documents.filter((d) => d.isFavorite);
    const rest = documents.filter((d) => !d.isFavorite);
    return { favs, rest };
  }, [documents]);

  const filteredTodos = useMemo(() => {
    if (activeProject === 'all') return todos;
    return todos.filter((t) => t.mindmapId === activeProject);
  }, [todos, activeProject]);

  // Group by scheduledDate, undone first within each day
  const grouped = useMemo(() => {
    const map: Record<string, TodoItem[]> = {};
    filteredTodos.forEach((t) => {
      if (!map[t.scheduledDate]) map[t.scheduledDate] = [];
      map[t.scheduledDate].push(t);
    });
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => {
        if (a.status === 'done' && b.status !== 'done') return 1;
        if (a.status !== 'done' && b.status === 'done') return -1;
        return 0;
      })
    );
    return map;
  }, [filteredTodos]);

  const today = todayString();
  const sortedDates = useMemo(
    () => Object.keys(grouped).sort((a, b) => {
      if (a === today) return -1;
      if (b === today) return 1;
      return b.localeCompare(a);
    }),
    [grouped, today]
  );

  const pendingCount = (docId: string | 'all') =>
    todos.filter((t) => (docId === 'all' || t.mindmapId === docId) && t.status !== 'done').length;

  const totalUndone = todos.filter((t) => t.status !== 'done').length;

  const activeDoc   = documents.find((d) => d.id === activeProject);
  const activeLabel = activeProject === 'all'
    ? text('All Tasks')
    : activeDoc?.title ?? text('Tasks');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    addTodo(
      newTitle.trim(),
      'default',
      newPriority,
      activeProject !== 'all' ? activeProject : undefined,
      undefined,
      undefined,
      newDueDate  || undefined,
      newTags.length ? newTags : undefined,
      newAssignee.trim() || undefined,
    );
    setNewTitle('');
    setNewDueDate('');
    setNewTags([]);
    setNewAssignee('');
  };

  const commitCreatedBy = (id: string) => {
    updateDocumentMeta(id, { createdBy: createdByDraft.trim() || undefined });
    setEditingCreatedBy(null);
  };

  // ── Sidebar project item ────────────────────────────────────────────────────
  const ProjectItem = ({ id, title, isFav }: { id: string; title: string; isFav: boolean }) => {
    const ct       = pendingCount(id);
    const isActive = activeProject === id;
    const doc      = documents.find((d) => d.id === id);
    const isEditing = editingCreatedBy === id;

    return (
      <div
        className={`group rounded-xl cursor-pointer transition-colors ${
          isActive
            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/40'
        }`}
        onClick={() => setActiveProject(id)}
      >
        <div className="flex items-center gap-2 px-3 py-2">
          {/* Star toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); toggleFavorite(id); }}
            title={isFav ? text('Remove from favorites') : text('Add to favorites')}
            className={`shrink-0 transition-colors ${
              isFav
                ? 'text-yellow-400 hover:text-yellow-500'
                : 'text-gray-200 dark:text-gray-700 opacity-0 group-hover:opacity-100 hover:text-yellow-400'
            }`}
          >
            <Star size={13} fill={isFav ? 'currentColor' : 'none'} />
          </button>
          <span className="flex-1 truncate text-sm font-medium">{title}</span>
          {ct > 0 && (
            <span className={`text-xs shrink-0 ${isActive ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400'}`}>
              {ct}
            </span>
          )}
        </div>

        {/* createdBy row — visible when project is active */}
        {isActive && (
          <div className="flex items-center gap-1 px-3 pb-1.5 -mt-1" onClick={(e) => e.stopPropagation()}>
            {isEditing ? (
              <input
                ref={createdByRef}
                value={createdByDraft}
                onChange={(e) => setCreatedByDraft(e.target.value)}
                onBlur={() => commitCreatedBy(id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitCreatedBy(id);
                  if (e.key === 'Escape') setEditingCreatedBy(null);
                }}
                placeholder={text('Creator name…')}
                className="flex-1 text-[10px] bg-white dark:bg-gray-700 border border-blue-300 dark:border-blue-600 rounded px-1.5 py-0.5 outline-none text-gray-700 dark:text-gray-200"
              />
            ) : (
              <span className="flex items-center gap-1 text-[10px] text-blue-400 dark:text-blue-500 truncate max-w-full">
                <User size={8} className="shrink-0" />
                {doc?.createdBy
                  ? <span className="truncate">{doc.createdBy}</span>
                  : <span className="italic opacity-60">{text('No author')}</span>
                }
                <button
                  onClick={() => { setEditingCreatedBy(id); setCreatedByDraft(doc?.createdBy ?? ''); }}
                  className="ml-0.5 opacity-0 group-hover:opacity-100 hover:text-blue-600 transition-opacity shrink-0"
                  title={text('Edit author')}
                >
                  <Pencil size={8} />
                </button>
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex overflow-hidden bg-gray-50 dark:bg-gray-900">

      {/* ── Left sidebar: project list ─────────────────────────────────────── */}
      <aside className="w-56 shrink-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
        <div className="px-4 py-4 border-b border-gray-100 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            <CheckSquare size={16} className="text-blue-500" />
            <span className="font-bold text-sm text-gray-800 dark:text-gray-100">{text('Tasks')}</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {/* "All Tasks" entry */}
          <div
            onClick={() => setActiveProject('all')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-colors ${
              activeProject === 'all'
                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/40'
            }`}
          >
            <Layers size={14} className="shrink-0" />
            <span className="flex-1 text-sm font-medium">{text('All Tasks')}</span>
            {totalUndone > 0 && (
              <span className={`text-xs shrink-0 ${activeProject === 'all' ? 'text-blue-500' : 'text-gray-400'}`}>
                {totalUndone}
              </span>
            )}
          </div>

          {/* Favorites pinned at top */}
          {sortedDocuments.favs.length > 0 && (
            <>
              <div className="px-3 pt-3 pb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 flex items-center gap-1">
                  <Star size={9} fill="currentColor" className="text-yellow-400" /> {text('Favorites')}
                </span>
              </div>
              {sortedDocuments.favs.map((doc) => (
                <ProjectItem key={doc.id} id={doc.id} title={doc.title} isFav={true} />
              ))}
            </>
          )}

          {/* Rest of the projects */}
          {sortedDocuments.rest.length > 0 && (
            <>
              {sortedDocuments.favs.length > 0 && (
                <div className="mx-3 my-1 border-t border-gray-100 dark:border-gray-700" />
              )}
              <div className="px-3 pt-2 pb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  {text('Projects')}
                </span>
              </div>
              {sortedDocuments.rest.map((doc) => (
                <ProjectItem key={doc.id} id={doc.id} title={doc.title} isFav={false} />
              ))}
            </>
          )}

          {documents.length === 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-600 text-center py-6 px-3">
              {text('No mindmap projects yet. Create one in Mindmap.')}
            </p>
          )}

          {/* Shared Tasks nav */}
          <div className="mx-3 my-1 border-t border-gray-100 dark:border-gray-700" />
          <div
            onClick={() => { setShowShared(true); setActiveProject('all'); }}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-colors ${
              showShared
                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/40'
            }`}
          >
            <Users size={14} className="shrink-0" />
            <span className="flex-1 text-sm font-medium">{text('Shared Tasks')}</span>
          </div>
        </nav>
      </aside>

      {/* ── Main area ───────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {showShared ? (
          // ── Shared project todos panel
          <div className="flex-1 overflow-y-auto p-6">
            <div className="flex items-center gap-2 mb-6">
              <Users size={20} className="text-blue-500" />
              <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">{text('Shared Tasks')}</h1>
              <button onClick={() => setShowShared(false)} className="ml-auto text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"><X size={12} /> {text('Back to My Tasks')}</button>
            </div>
            {projects.length === 0 ? (
              <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                <Users size={36} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-gray-400 text-sm">{text('No projects yet.')}</p>
                <p className="text-gray-400 text-xs mt-1">{text('Join or create a project to see shared tasks here.')}</p>
              </div>
            ) : (
              <div className="space-y-6">
                {projects.map((project) => (
                  <SharedProjectTodosPanel key={project.id} project={project} currentUserId={user?.id || ''} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
          {/* Header */}
          <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 shrink-0">
          <div className="flex items-center gap-3 mb-3">
            <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">{activeLabel}</h1>
            {activeDoc?.createdBy && (
              <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                <User size={11} /> {activeDoc.createdBy}
              </span>
            )}
            <span className="text-sm text-gray-400 ml-auto">
              {pendingCount(activeProject)} {text('pending')} · {filteredTodos.filter((t) => t.status === 'done').length} {text('done')}
            </span>
          </div>

          {/* Quick-add form */}
          <form onSubmit={handleAdd} className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            {/* Main row */}
            <div className="flex items-center gap-2 px-4 py-2.5">
              <Plus size={14} className="text-gray-400 shrink-0" />
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={text('Add task…')}
                className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 outline-none"
              />
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as TodoPriority)}
                className="text-xs border border-gray-200 dark:border-gray-600 rounded px-1.5 py-1 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 outline-none cursor-pointer shrink-0"
              >
                <option value="low">{text('Low')}</option>
                <option value="medium">{text('Medium')}</option>
                <option value="high">{text('High')}</option>
              </select>
              {/* Deadline toggle */}
              <button type="button" onClick={() => setShowDue((v) => !v)} title={text('Set deadline')}
                className={`shrink-0 transition-colors ${showDue ? 'text-indigo-500' : 'text-gray-300 dark:text-gray-600 hover:text-indigo-400'}`}>
                <CalendarClock size={14} />
              </button>
              {/* Tags toggle */}
              <button type="button" onClick={() => setShowTags((v) => !v)} title={text('Add tags')}
                className={`shrink-0 relative transition-colors ${showTags ? 'text-purple-500' : 'text-gray-300 dark:text-gray-600 hover:text-purple-400'}`}>
                <Tag size={14} />
                {newTags.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-purple-500 text-white text-[8px] rounded-full flex items-center justify-center font-bold">
                    {newTags.length}
                  </span>
                )}
              </button>
              {/* Assignee toggle */}
              <button type="button" onClick={() => setShowAssignee((v) => !v)} title={text('Assign to person')}
                className={`shrink-0 transition-colors ${showAssignee || newAssignee ? 'text-teal-500' : 'text-gray-300 dark:text-gray-600 hover:text-teal-400'}`}>
                <User size={14} />
              </button>
              <button type="submit" disabled={!newTitle.trim()}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors shrink-0">
                {text('Add')}
              </button>
            </div>

            {/* Deadline row */}
            {showDue && (
              <div className="flex items-center gap-2 px-4 py-2 border-t border-gray-100 dark:border-gray-700 bg-indigo-50/40 dark:bg-indigo-900/10">
                <CalendarClock size={12} className="text-indigo-400 shrink-0" />
                <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{text('Deadline:')}</span>
                <input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)}
                  min={todayString()}
                  className="flex-1 text-xs bg-transparent border-none outline-none text-gray-700 dark:text-gray-300 cursor-pointer" />
                {newDueDate && (
                  <button type="button" onClick={() => setNewDueDate('')} className="text-gray-400 hover:text-red-400 transition-colors shrink-0"><X size={11} /></button>
                )}
              </div>
            )}

            {/* Assignee row */}
            {showAssignee && (
              <div className="flex items-center gap-2 px-4 py-2 border-t border-gray-100 dark:border-gray-700 bg-teal-50/40 dark:bg-teal-900/10">
                <User size={12} className="text-teal-400 shrink-0" />
                <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{text('Assign to:')}</span>
                <input type="text" value={newAssignee} onChange={(e) => setNewAssignee(e.target.value)}
                  placeholder={text("Person's name…")}
                  className="flex-1 text-xs bg-transparent border-none outline-none text-gray-700 dark:text-gray-300 placeholder-gray-400" />
                {newAssignee && (
                  <button type="button" onClick={() => setNewAssignee('')} className="text-gray-400 hover:text-red-400 transition-colors shrink-0"><X size={11} /></button>
                )}
              </div>
            )}

            {/* Tag picker panel */}
            {showTags && <TagPicker selected={newTags} onChange={setNewTags} />}

            {/* Selected tags preview (when tag panel closed) */}
            {newTags.length > 0 && !showTags && (
              <div className="flex items-center gap-1.5 px-4 py-1.5 border-t border-gray-100 dark:border-gray-700 flex-wrap">
                {newTags.map((tid) => {
                  const t = allTags.find((tg) => tg.id === tid);
                  if (!t) return null;
                  return (
                    <span key={tid} className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border"
                      style={{ backgroundColor: `${t.color}18`, color: t.color, borderColor: `${t.color}50` }}>
                      {t.label}
                      <button type="button" onClick={() => setNewTags(newTags.filter((id) => id !== tid))} className="opacity-60 hover:opacity-100"><X size={7} /></button>
                    </span>
                  );
                })}
              </div>
            )}
          </form>
        </header>

        {/* Day sections */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {sortedDates.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 dark:text-gray-600 gap-3">
              <CheckSquare size={32} strokeWidth={1} />
              <p className="text-sm">{text('No tasks yet — add one above!')}</p>
            </div>
          ) : (
            sortedDates.map((dateStr) => (
              <DaySection
                key={dateStr}
                dateStr={dateStr}
                todos={grouped[dateStr]}
                isCurrentDay={dateStr === today}
                onToggle={toggleTodo}
                onDelete={deleteTodo}
                onUpdate={updateTodo}
              />
            ))
          )}
        </div>
          </>
        )} {/* end showShared ternary */}
      </div>
    </div>
  );
}

// ─── SharedProjectTodosPanel ────────────────────────────────────────────────
function SharedProjectTodosPanel({ project, currentUserId }: { project: import('@/store/useProjectStore').Project; currentUserId: string }) {
  const { text } = useAppTranslation();
  const { openProjectById, openProject, toggleTodo, deleteTodo } = useProjectStore();
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  const handleToggle = async () => {
    if (!open && !loaded) {
      await openProjectById(project.id);
      setLoaded(true);
    }
    setOpen((x) => !x);
  };

  const todos = openProject?.id === project.id ? openProject.todos : [];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button onClick={handleToggle} className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
        <Briefcase size={16} className="text-blue-500 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-bold text-gray-800 dark:text-white">{project.name}</p>
          <p className="text-xs text-gray-400">{text(project.my_role)} · {text('Click to load tasks')}</p>
        </div>
        {open ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
      </button>
      {open && (
        <div className="border-t border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
          {todos.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">{text('No tasks in this project')}</p>
          ) : todos.map((t) => (
            <div key={t.id} className={`flex items-center gap-3 px-4 py-3 ${t.done ? 'opacity-60' : ''}`}>
              <button onClick={() => toggleTodo(project.id, t.id)}
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                  t.done ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-gray-600 hover:border-green-400'
                }`}>
                {!!t.done && <Check size={10} className="text-white" strokeWidth={3} />}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${t.done ? 'line-through text-gray-400' : 'text-gray-800 dark:text-white'}`}>{t.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {t.assigned_to_username && <span className="text-xs text-gray-400">→ {t.assigned_to_username}</span>}
                  {t.due_date && <span className="text-xs text-gray-400">{text('Due')} {t.due_date}</span>}
                  <span className="text-xs text-gray-400">{text('by')} {t.created_by_username}</span>
                </div>
              </div>
              {(t.created_by === currentUserId || project.is_owner) && (
                <button onClick={() => deleteTodo(project.id, t.id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

