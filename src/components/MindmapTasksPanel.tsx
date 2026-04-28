import { useState } from 'react';
import { CheckCircle2, Circle, Clock, Plus, Trash2, Link, Flag, ExternalLink, Calendar, Tag, UserCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { useAppTranslation } from '@/lib/appTranslations';
import { useTodoStore, TodoItem, TodoPriority, TodoStatus } from '@/store/useTodoStore';
import { PRESET_ROLES, useProjectStore } from '@/store/useProjectStore';
import { useNavigate } from 'react-router-dom';

const PRIORITY_COLORS: Record<TodoPriority, string> = {
  low:    'text-gray-400',
  medium: 'text-yellow-500',
  high:   'text-red-500',
};

function StatusIcon({ status }: { status: TodoStatus }) {
  if (status === 'done')        return <CheckCircle2 size={15} className="text-green-500 shrink-0" />;
  if (status === 'in-progress') return <Clock size={15} className="text-blue-500 shrink-0" />;
  return <Circle size={15} className="text-gray-400 shrink-0" />;
}

interface Props {
  documentId?: string;
  selectedNodeId?: string | null;
}

export default function MindmapTasksPanel({ documentId, selectedNodeId }: Props) {
  const navigate = useNavigate();
  const { t, text, language } = useAppTranslation();
  const { todos, addTodo, toggleTodo, deleteTodo } = useTodoStore();
  const { openProject } = useProjectStore();
  const presetRoleSet = new Set(PRESET_ROLES.map((role) => role.toLowerCase()));

  // Project members available for assignment
  const projectMembers = openProject?.members ?? [];

  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<TodoPriority>('medium');
  const [newDueDate, setNewDueDate] = useState('');
  const [newTags, setNewTags] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [linkToNode, setLinkToNode] = useState(false);
  const [filter, setFilter] = useState<'all' | 'node'>('all');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Todos for this mindmap
  const mindmapTodos = todos.filter((t: any) =>
    !documentId || (t as any).mindmapId === documentId
  );

  // Todos linked to selected node
  const nodeTodos = selectedNodeId
    ? mindmapTodos.filter((t: any) => (t as any).linkedNodeId === selectedNodeId)
    : [];

  const formatDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(language).format(date);
  };

  const describeRole = (role: string) => (presetRoleSet.has(role.toLowerCase()) ? text(role) : role);

  const displayTodos = filter === 'node' && selectedNodeId ? nodeTodos : mindmapTodos;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const tagArray = newTags.split(',').map(t => t.trim()).filter(Boolean);
    addTodo(
      newTitle.trim(),
      'default',
      newPriority,
      documentId,
      linkToNode && selectedNodeId ? selectedNodeId : undefined,
      undefined,          // scheduledDate
      newDueDate || undefined,
      tagArray.length > 0 ? tagArray : undefined,
      newAssignee || undefined,
    );
    setNewTitle('');
    setNewDueDate('');
    setNewTags('');
    setNewAssignee('');
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('mindmapTasksPanel.title')}</span>
        <button
          onClick={() => navigate('/todo')}
          className="text-gray-400 hover:text-blue-500 transition-colors"
          title={t('mindmapTasksPanel.openFullTodoPage')}
        >
          <ExternalLink size={14} />
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 shrink-0">
        <button
          onClick={() => setFilter('all')}
          className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
            filter === 'all'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
              : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
          }`}
        >
          {t('mindmapTasksPanel.filterAll', { count: String(mindmapTodos.length) })}
        </button>
        <button
          onClick={() => setFilter('node')}
          disabled={!selectedNodeId}
          className={`flex-1 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
            filter === 'node'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
              : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
          }`}
          title={selectedNodeId ? t('mindmapTasksPanel.tasksLinkedToSelectedNode') : t('mindmapTasksPanel.selectNodeFirst')}
        >
          {t('mindmapTasksPanel.filterNode', { count: String(nodeTodos.length) })}
        </button>
      </div>

      {/* Add task form */}
      <form onSubmit={handleAdd} className="p-2 border-b border-gray-200 dark:border-gray-700 shrink-0 space-y-1.5">
        <div className="flex gap-1.5 items-center">
          <Plus size={13} className="text-gray-400 shrink-0" />
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={t('mindmapTasksPanel.addTaskPlaceholder')}
            className="flex-1 text-xs bg-transparent text-gray-800 dark:text-gray-100 placeholder-gray-400 outline-none"
          />
          <select
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value as TodoPriority)}
            className="text-[10px] border border-gray-200 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 outline-none cursor-pointer"
          >
            <option value="low">{t('mindmapTasksPanel.priorityLow')}</option>
            <option value="medium">{t('mindmapTasksPanel.priorityMedium')}</option>
            <option value="high">{t('mindmapTasksPanel.priorityHigh')}</option>
          </select>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            title={t('mindmapTasksPanel.moreOptions')}
          >
            {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>

        {showAdvanced && (
          <div className="space-y-1.5 pl-5">
            {/* Due date */}
            <div className="flex items-center gap-1.5">
              <Calendar size={11} className="text-gray-400 shrink-0" />
              <input
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className="flex-1 text-[10px] bg-transparent text-gray-600 dark:text-gray-300 outline-none cursor-pointer"
              />
            </div>

            {/* Tags */}
            <div className="flex items-center gap-1.5">
              <Tag size={11} className="text-gray-400 shrink-0" />
              <input
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder={t('mindmapTasksPanel.tagsPlaceholder')}
                className="flex-1 text-[10px] bg-transparent text-gray-600 dark:text-gray-300 placeholder-gray-400 outline-none"
              />
            </div>

            {/* Assignee */}
            <div className="flex items-center gap-1.5">
              <UserCircle2 size={11} className="text-gray-400 shrink-0" />
              {projectMembers.length > 0 ? (
                <select
                  value={newAssignee}
                  onChange={(e) => setNewAssignee(e.target.value)}
                  className="flex-1 text-[10px] bg-transparent text-gray-600 dark:text-gray-300 outline-none cursor-pointer border-none"
                >
                  <option value="">{t('mindmapTasksPanel.unassigned')}</option>
                  {projectMembers.map((m) => (
                    <option key={m.id} value={m.username}>{m.username} — {describeRole(m.role)}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={newAssignee}
                  onChange={(e) => setNewAssignee(e.target.value)}
                  placeholder={t('mindmapTasksPanel.assignToPlaceholder')}
                  className="flex-1 text-[10px] bg-transparent text-gray-600 dark:text-gray-300 placeholder-gray-400 outline-none"
                />
              )}
            </div>

            {/* Link to node */}
            {selectedNodeId && (
              <label className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={linkToNode}
                  onChange={(e) => setLinkToNode(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <Link size={10} />
                {t('mindmapTasksPanel.linkToSelectedNode')}
              </label>
            )}
          </div>
        )}

        {!showAdvanced && selectedNodeId && (
          <label className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400 cursor-pointer pl-5">
            <input
              type="checkbox"
              checked={linkToNode}
              onChange={(e) => setLinkToNode(e.target.checked)}
              className="rounded border-gray-300"
            />
            <Link size={10} />
            {t('mindmapTasksPanel.linkToSelectedNode')}
          </label>
        )}

        <button
          type="submit"
          disabled={!newTitle.trim()}
          className="w-full text-xs py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-md transition-colors font-medium"
        >
          {t('mindmapTasksPanel.addTask')}
        </button>
      </form>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-1 space-y-0.5">
        {displayTodos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 text-gray-400 dark:text-gray-600 gap-2">
            <CheckCircle2 size={22} strokeWidth={1} />
            <p className="text-xs">{t('mindmapTasksPanel.empty')}</p>
          </div>
        ) : (
          displayTodos.map((todo) => (
            <div
              key={todo.id}
              className={`group flex flex-col gap-0.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors ${
                todo.status === 'done' ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-start gap-2">
                <button onClick={() => toggleTodo(todo.id)} className="mt-0.5 hover:scale-110 transition-transform">
                  <StatusIcon status={todo.status} />
                </button>
                <span
                  className={`flex-1 text-xs text-gray-700 dark:text-gray-200 leading-snug ${
                    todo.status === 'done' ? 'line-through text-gray-400' : ''
                  }`}
                >
                  {todo.title}
                </span>
                <Flag size={10} className={`shrink-0 mt-1 ${PRIORITY_COLORS[todo.priority]}`} />
                {todo.linkedNodeId && (
                  <span title={t('mindmapTasksPanel.linkedToNode')}><Link size={10} className="shrink-0 mt-1 text-blue-400" /></span>
                )}
                <button
                  onClick={() => deleteTodo(todo.id)}
                  className="shrink-0 mt-0.5 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={11} />
                </button>
              </div>
              {/* Meta row */}
              {(todo.dueDate || todo.assignee || (todo.tags && todo.tags.length > 0)) && (
                <div className="flex flex-wrap items-center gap-1.5 pl-5">
                  {todo.dueDate && (
                    <span className="flex items-center gap-0.5 text-[10px] text-amber-500">
                      <Calendar size={9} /> {formatDate(todo.dueDate)}
                    </span>
                  )}
                  {todo.assignee && (
                    <span className="flex items-center gap-0.5 text-[10px] text-blue-400">
                      <UserCircle2 size={9} /> {todo.assignee}
                    </span>
                  )}
                  {todo.tags?.map((tag) => (
                    <span key={tag} className="text-[9px] px-1 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
