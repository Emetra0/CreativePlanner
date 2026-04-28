import { 
  format, startOfMonth, endOfMonth, eachDayOfInterval, 
  isSameDay, addMonths, subMonths, 
  isToday, parseISO, isBefore, startOfDay
} from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, Clock, Trash2, X, CheckCircle2, Circle, CheckSquare, RotateCcw, Flag, Users, Briefcase } from 'lucide-react';
import { useCalendarStore, CalendarEvent } from '@/store/useCalendarStore';
import { useEffect, useState, useMemo } from 'react';
import { useTodoStore, TodoPriority } from '@/store/useTodoStore';
import { useProjectStore } from '@/store/useProjectStore';
import { useAppDialogs } from '@/components/AppDialogs';
import { useAppTranslation } from '@/lib/appTranslations';

export default function CalendarPage() {
  const dialogs = useAppDialogs();
  const { language, text } = useAppTranslation();
  const { events, addEvent, removeEvent } = useCalendarStore();
  const { todos, addTodo, toggleTodo, deleteTodo } = useTodoStore();
  const { projects, fetchProjects } = useProjectStore();
  const [showShared, setShowShared] = useState(false);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date());

  // Add-event form
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventType, setEventType] = useState<CalendarEvent['type']>('other');
  const [eventDesc, setEventDesc] = useState('');

  // Add-todo inline form in panel
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [newTodoPriority, setNewTodoPriority] = useState<TodoPriority>('medium');

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const paddingDays = Array(monthStart.getDay()).fill(null);

  const getEventsForDay = (day: Date) =>
    events.filter(e => isSameDay(parseISO(e.date), day));

  const getTodosForDay = (day: Date) => {
    const d = format(day, 'yyyy-MM-dd');
    return todos.filter(t => t.scheduledDate === d);
  };

  const selectedDayStr = selectedDay ? format(selectedDay, 'yyyy-MM-dd') : null;
  const selectedEvents = selectedDay ? getEventsForDay(selectedDay) : [];
  const selectedTodos  = selectedDay ? getTodosForDay(selectedDay) : [];

  const handleAddEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle || !selectedDay) return;
    const dateStr = format(selectedDay, 'yyyy-MM-dd');
    const newEvent: CalendarEvent = {
      id: Date.now().toString(),
      title: eventTitle,
      date: dateStr,
      type: eventType,
      description: eventDesc,
    };
    if (eventType === 'task') {
      const todoId = addTodo(eventTitle, 'default', 'medium', undefined, undefined, dateStr);
      newEvent.todoId = todoId;
    }
    addEvent(newEvent);
    setShowEventModal(false);
    setEventTitle('');
    setEventDesc('');
    setEventType('other');
  };

  const handleAddTodo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodoTitle.trim() || !selectedDayStr) return;
    addTodo(newTodoTitle.trim(), 'default', newTodoPriority, undefined, undefined, selectedDayStr);
    setNewTodoTitle('');
  };

  const typeColors: Record<string, string> = {
    deadline:  'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
    recording: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800',
    editing:   'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
    release:   'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
    task:      'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800',
    other:     'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600',
  };
  const eventTypeLabels: Record<CalendarEvent['type'], string> = {
    deadline: text('Deadline'),
    recording: text('Recording'),
    editing: text('Editing'),
    release: text('Release'),
    task: text('Task'),
    other: text('Other'),
  };

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const pendingTodosToday = useMemo(
    () => todos.filter(t => t.scheduledDate === format(new Date(), 'yyyy-MM-dd') && t.status !== 'done').length,
    [todos]
  );
  const monthLabel = new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric' }).format(currentDate);
  const weekdayLabels = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(2024, 0, 7 + index);
    return new Intl.DateTimeFormat(language, { weekday: 'short' }).format(day);
  });
  const formatLocalizedDate = (date: Date, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(language, options).format(date);

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 overflow-hidden">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header className="flex justify-between items-center px-8 py-5 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">{text('Calendar')}</h1>
          {pendingTodosToday > 0 && (
            <p className="text-sm text-amber-600 dark:text-amber-400 mt-0.5 flex items-center gap-1">
              <CheckSquare size={13} /> {pendingTodosToday} {text('tasks')} {text('pending today')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-1">
            <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-gray-600 dark:text-gray-300">
              <ChevronLeft size={18} />
            </button>
            <span className="px-4 font-bold text-gray-800 dark:text-white min-w-[130px] text-center text-sm">
              {monthLabel}
            </span>
            <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-gray-600 dark:text-gray-300">
              <ChevronRight size={18} />
            </button>
          </div>
          {/* My / Shared toggle */}
          <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 text-sm">
            <button
              onClick={() => setShowShared(false)}
              className={`px-3 py-1.5 flex items-center gap-1.5 transition-colors ${
                !showShared ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <CalendarIcon size={13} /> {text('My Calendar')}
            </button>
            <button
              onClick={() => { setShowShared(true); fetchProjects(); }}
              className={`px-3 py-1.5 flex items-center gap-1.5 transition-colors ${
                showShared ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <Users size={13} /> {text('Shared')}
            </button>
          </div>

          {!showShared && (
            <button
              onClick={() => { setSelectedDay(selectedDay ?? new Date()); setShowEventModal(true); }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm"
            >
              <Plus size={16} /> {text('Add Event')}
            </button>
          )}
        </div>
      </header>

      {/* ── Main: calendar grid + side panel ──────────────────────────────── */}
      {showShared ? (
        /* ── Shared Calendar view ── */
        <div className="flex-1 overflow-y-auto px-8 pb-8">
          <div className="flex items-center gap-2 mb-6">
            <Users size={20} className="text-blue-500" />
            <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">{text('Shared Calendars')}</h2>
          </div>
          {projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
              <Users size={40} className="text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-gray-400 text-sm">{text('No projects yet.')}</p>
              <p className="text-gray-400 text-xs mt-1">{text('Join or create a project to see shared content here.')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {projects.map((project) => (
                <div key={project.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <Briefcase size={16} className="text-blue-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-800 dark:text-white text-sm">{project.name}</p>
                      {project.description && <p className="text-xs text-gray-400 truncate mt-0.5">{project.description}</p>}
                    </div>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-800">{project.my_role ?? (project.is_owner ? text('Owner') : text('Member'))}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Users size={11} />
                    <span>{project.member_count} {text(project.member_count === 1 ? 'member' : 'members')}</span>
                    {project.is_owner && <span className="ml-1 text-purple-400 font-medium">({text('You own this')})</span>}
                  </div>
                  <p className="mt-3 text-xs text-gray-400 italic">{text('Shared calendar integration - project events and deadlines will appear here in a future update.')}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
      <div className="flex flex-1 overflow-hidden px-8 pb-8 gap-4">

        {/* Calendar grid */}
        <div className="flex-1 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col min-w-0">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 shrink-0">
            {weekdayLabels.map(d => (
              <div key={d} className="py-2.5 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{d}</div>
            ))}
          </div>

          {/* Days */}
          <div className="flex-1 grid grid-cols-7 auto-rows-fr overflow-hidden">
            {paddingDays.map((_, i) => (
              <div key={`pad-${i}`} className="bg-gray-50/30 dark:bg-gray-900/30 border-b border-r border-gray-100 dark:border-gray-800" />
            ))}

            {days.map(day => {
              const dayEvents = getEventsForDay(day);
              const dayTodos  = getTodosForDay(day);
              const pendingTodos = dayTodos.filter(t => t.status !== 'done');
              const doneTodos    = dayTodos.filter(t => t.status === 'done');
              const isTodayDate  = isToday(day);
              const isSelected   = selectedDay ? isSameDay(day, selectedDay) : false;
              const isPast       = isBefore(startOfDay(day), startOfDay(new Date()));
              const hasOverdue   = isPast && pendingTodos.length > 0;

              return (
                <div
                  key={day.toString()}
                  onClick={() => setSelectedDay(day)}
                  className={`border-b border-r border-gray-100 dark:border-gray-700 p-1.5 cursor-pointer transition-colors overflow-hidden
                    ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20 ring-2 ring-inset ring-blue-400' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'}
                    ${isTodayDate && !isSelected ? 'bg-blue-50/40 dark:bg-blue-900/10' : ''}
                    ${hasOverdue && !isSelected ? 'bg-amber-50/40 dark:bg-amber-900/10' : ''}
                  `}
                >
                  {/* Day number */}
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full
                      ${isTodayDate ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-300'}`}>
                      {format(day, 'd')}
                    </span>
                    {/* Summary indicator */}
                    {(dayEvents.length > 0 || dayTodos.length > 0) && (
                      <div className="flex gap-0.5">
                        {dayEvents.length > 0 && (
                          <span className="text-[9px] bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 rounded px-1">{dayEvents.length}</span>
                        )}
                        {pendingTodos.length > 0 && (
                          <span className={`text-[9px] rounded px-1 ${hasOverdue ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : 'bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400'}`}>
                            {pendingTodos.length}✓
                          </span>
                        )}
                        {doneTodos.length > 0 && pendingTodos.length === 0 && (
                          <CheckCircle2 size={10} className="text-green-400" />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Event/todo chips — show up to 2 */}
                  <div className="space-y-0.5 overflow-hidden">
                    {dayEvents.slice(0, 2).map(ev => (
                      <div key={ev.id} className={`text-[9px] px-1 py-px rounded truncate border ${typeColors[ev.type] ?? typeColors.other}`}>
                        {ev.title}
                      </div>
                    ))}
                    {pendingTodos.slice(0, Math.max(0, 2 - dayEvents.length)).map(t => (
                      <div key={t.id} className="flex items-center gap-0.5 text-[9px] px-1 py-px rounded truncate border bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/20 dark:text-teal-300 dark:border-teal-800">
                        <Circle size={6} className="shrink-0" />{t.title}
                      </div>
                    ))}
                    {(dayEvents.length + dayTodos.length) > 2 && (
                      <div className="text-[9px] text-gray-400 pl-1">+{dayEvents.length + dayTodos.length - 2} {text('more')}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Day detail side panel ──────────────────────────────────────── */}
        {selectedDay && (
          <div className="w-72 shrink-0 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
            {/* Panel header */}
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <div className={`font-bold text-sm ${isToday(selectedDay) ? 'text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-gray-100'}`}>
                    {isToday(selectedDay) ? text('Today') : formatLocalizedDate(selectedDay, { weekday: 'long' })}
                  </div>
                  <div className="text-xs text-gray-400">{formatLocalizedDate(selectedDay, { month: 'long', day: 'numeric', year: 'numeric' })}</div>
                </div>
                <button onClick={() => { setSelectedDay(selectedDay); setShowEventModal(true); }}
                  className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500 transition-colors"
                  title={text('Add calendar event')}>
                  <Plus size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">

              {/* ── Tasks section ─────────────────────────────────────────── */}
              <div className="px-4 pt-3 pb-2">
                <div className="flex items-center gap-1.5 mb-2">
                  <CheckSquare size={12} className="text-teal-500" />
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{text('Tasks')}</span>
                  {selectedTodos.length > 0 && (
                    <span className="text-[10px] text-gray-400 ml-auto">
                      {selectedTodos.filter(t => t.status === 'done').length}/{selectedTodos.length}
                    </span>
                  )}
                </div>

                {/* Add todo inline */}
                <form onSubmit={handleAddTodo} className="flex items-center gap-1.5 mb-2">
                  <input
                    value={newTodoTitle}
                    onChange={(e) => setNewTodoTitle(e.target.value)}
                    placeholder={text('Add task…')}
                    className="flex-1 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-800 dark:text-gray-100 outline-none focus:border-teal-400 min-w-0"
                  />
                  <select
                    value={newTodoPriority}
                    onChange={(e) => setNewTodoPriority(e.target.value as TodoPriority)}
                    className="text-[10px] border border-gray-200 dark:border-gray-600 rounded-lg px-1 py-1.5 bg-white dark:bg-gray-700 text-gray-500 outline-none cursor-pointer shrink-0"
                  >
                    <option value="low">{text('Low')}</option>
                    <option value="medium">{text('Medium')}</option>
                    <option value="high">{text('High')}</option>
                  </select>
                  <button type="submit" disabled={!newTodoTitle.trim()}
                    className="shrink-0 p-1.5 bg-teal-500 hover:bg-teal-600 disabled:opacity-30 text-white rounded-lg transition-colors">
                    <Plus size={13} />
                  </button>
                </form>

                {/* Todo list */}
                {selectedTodos.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-gray-600 py-2 text-center">{text('No tasks for this day')}</p>
                ) : (
                  <div className="space-y-0.5">
                    {selectedTodos
                      .sort((a, b) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0))
                      .map(todo => (
                      <div key={todo.id} className="group flex items-center gap-2 py-1.5 px-1 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <button onClick={() => toggleTodo(todo.id)} className="shrink-0 hover:scale-110 transition-transform">
                          {todo.status === 'done'
                            ? <CheckCircle2 size={15} className="text-green-500" />
                            : <Circle size={15} className="text-gray-300 dark:text-gray-500 group-hover:text-teal-400" />
                          }
                        </button>
                        <span className={`flex-1 text-xs truncate ${todo.status === 'done' ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-200'}`}>
                          {todo.title}
                        </span>
                        {todo.rolledOver && todo.status !== 'done' && (
                          <span title={text('Rolled over')}><RotateCcw size={9} className="text-amber-400 shrink-0" /></span>
                        )}
                        <Flag size={9} className={`shrink-0 ${todo.priority === 'high' ? 'text-red-500' : todo.priority === 'medium' ? 'text-yellow-400' : 'text-gray-200 dark:text-gray-700'}`} />
                        <button
                          onClick={() => deleteTodo(todo.id)}
                          className="shrink-0 text-gray-200 dark:text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Events section ────────────────────────────────────────── */}
              {selectedEvents.length > 0 && (
                <div className="px-4 pt-1 pb-3 border-t border-gray-100 dark:border-gray-700 mt-1">
                  <div className="flex items-center gap-1.5 mb-2 mt-2">
                    <CalendarIcon size={12} className="text-blue-500" />
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{text('Events')}</span>
                  </div>
                  <div className="space-y-1">
                    {selectedEvents.map(ev => (
                      <div key={ev.id} className={`group flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg border ${typeColors[ev.type] ?? typeColors.other}`}>
                        <span className="flex-1 truncate capitalize font-medium">{ev.title}</span>
                        <span className="text-[9px] opacity-60 shrink-0">{eventTypeLabels[ev.type] ?? text('Other')}</span>
                        <button
                          onClick={async () => {
                            if (await dialogs.confirm({ title: text('Delete Event'), message: `${text('Delete')} "${ev.title}"?`, confirmLabel: text('Delete'), isDanger: true })) {
                              removeEvent(ev.id);
                            }
                          }}
                          className="shrink-0 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity ml-1"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedEvents.length === 0 && selectedTodos.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-600 text-center py-8">
                  {text('Nothing scheduled.')}<br />{text('Add a task or event above.')}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
      )} {/* end showShared ternary */}

      {/* ── Add Event Modal ──────────────────────────────────────────────── */}
      {showEventModal && selectedDay && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm" onClick={() => setShowEventModal(false)}>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl w-96 max-w-full mx-4 border border-gray-100 dark:border-gray-700" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <CalendarIcon size={18} className="text-blue-500" /> {text('New Event')}
              </h3>
              <button onClick={() => setShowEventModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X size={22} />
              </button>
            </div>

            <div className="mb-4 text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
              <Clock size={13} />
              {formatLocalizedDate(selectedDay, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </div>

            <form onSubmit={handleAddEvent} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{text('Title')}</label>
                <input
                  type="text" value={eventTitle} onChange={(e) => setEventTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-gray-900 dark:text-white text-sm"
                  placeholder={text('e.g. Record Episode 1')} autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{text('Type')}</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['deadline','recording','editing','release','task','other'] as const).map(type => (
                    <button key={type} type="button" onClick={() => setEventType(type)}
                      className={`text-xs py-1.5 px-2 rounded border capitalize transition-all
                        ${eventType === type
                          ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                          : 'bg-gray-50 border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 hover:bg-gray-100'}`}>
                      {eventTypeLabels[type]}
                    </button>
                  ))}
                </div>
                {eventType === 'task' && (
                  <p className="text-[11px] text-teal-600 dark:text-teal-400 mt-1.5">{text('This will also create a task in your todo list')}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{text('Description (optional)')}</label>
                <textarea value={eventDesc} onChange={(e) => setEventDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-gray-900 dark:text-white resize-none h-16 text-sm"
                  placeholder={text('Details…')} />
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => setShowEventModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                  {text('Cancel')}
                </button>
                <button type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg">
                  {text('Add Event')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}