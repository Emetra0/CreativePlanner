import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type TodoPriority = 'low' | 'medium' | 'high';
export type TodoStatus = 'todo' | 'in-progress' | 'done';

export interface TodoItem {
  id: string;
  listId: string;
  title: string;
  notes?: string;
  status: TodoStatus;
  priority: TodoPriority;
  /** Mindmap project this task belongs to */
  mindmapId?: string;
  /** Specific mindmap node this is linked to */
  linkedNodeId?: string;
  /** Optional deadline for this task (YYYY-MM-DD) */
  dueDate?: string;
  /** Tag IDs from useTagStore attached to this todo */
  tags?: string[];
  /** Person this todo is assigned to */
  assignee?: string;
  /** The day this task is scheduled for (YYYY-MM-DD) — moves forward on rollover */
  scheduledDate: string;
  /** The date it was first created/scheduled — never changes */
  originalScheduledDate: string;
  /** True if this task was automatically rolled forward from a past day */
  rolledOver: boolean;
  createdAt: string;
  completedAt?: string;
}

export interface TodoList {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── State Interface ──────────────────────────────────────────────────────────

interface TodoState {
  lists: TodoList[];
  todos: TodoItem[];
  addList: (name: string, color?: string) => string;
  updateList: (id: string, updates: Partial<Pick<TodoList, 'name' | 'color'>>) => void;
  deleteList: (id: string) => void;
  addTodo: (
    title: string,
    listId?: string,
    priority?: TodoPriority,
    mindmapId?: string,
    linkedNodeId?: string,
    scheduledDate?: string,
    dueDate?: string,
    tags?: string[],
    assignee?: string,
  ) => string;
  updateTodo: (id: string, updates: Partial<TodoItem>) => void;
  deleteTodo: (id: string) => void;
  toggleTodo: (id: string) => void;
  /** Move all undone past-dated todos to today */
  rolloverTodos: () => void;
  getTodosByDate: (date: string) => TodoItem[];
  getTodosForMindmap: (mindmapId: string) => TodoItem[];
  getTodosForNode: (nodeId: string) => TodoItem[];
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useTodoStore = create<TodoState>()(
  persist(
    (set, get) => ({
      lists: [
        { id: 'default', name: 'My Tasks', color: '#3b82f6', createdAt: new Date().toISOString() },
      ],
      todos: [],

      addList: (name, color = '#6366f1') => {
        const id = Math.random().toString(36).substr(2, 9);
        set((s) => ({ lists: [...s.lists, { id, name, color, createdAt: new Date().toISOString() }] }));
        return id;
      },

      updateList: (id, updates) =>
        set((s) => ({ lists: s.lists.map((l) => (l.id === id ? { ...l, ...updates } : l)) })),

      deleteList: (id) =>
        set((s) => ({
          lists: s.lists.filter((l) => l.id !== id),
          todos: s.todos.filter((t) => t.listId !== id),
        })),

      addTodo: (title, listId = 'default', priority = 'medium', mindmapId, linkedNodeId, scheduledDate, dueDate, tags, assignee) => {
        const id = Math.random().toString(36).substr(2, 9);
        const date = scheduledDate || todayString();
        const todo: TodoItem = {
          id, listId, title,
          status: 'todo', priority,
          mindmapId, linkedNodeId,
          dueDate,
          tags: tags && tags.length > 0 ? tags : undefined,
          assignee: assignee?.trim() || undefined,
          scheduledDate: date,
          originalScheduledDate: date,
          rolledOver: false,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ todos: [...s.todos, todo] }));
        return id;
      },

      updateTodo: (id, updates) =>
        set((s) => ({ todos: s.todos.map((t) => (t.id === id ? { ...t, ...updates } : t)) })),

      deleteTodo: (id) =>
        set((s) => ({ todos: s.todos.filter((t) => t.id !== id) })),

      toggleTodo: (id) =>
        set((s) => ({
          todos: s.todos.map((t) => {
            if (t.id !== id) return t;
            const done = t.status !== 'done';
            return { ...t, status: done ? 'done' : 'todo', completedAt: done ? new Date().toISOString() : undefined };
          }),
        })),

      rolloverTodos: () => {
        const today = todayString();
        set((s) => ({
          todos: s.todos.map((t) => {
            if (t.status === 'done' || t.scheduledDate >= today) return t;
            return { ...t, scheduledDate: today, rolledOver: true };
          }),
        }));
      },

      getTodosByDate: (date) => get().todos.filter((t) => t.scheduledDate === date),
      getTodosForMindmap: (mindmapId) => get().todos.filter((t) => t.mindmapId === mindmapId),
      getTodosForNode: (nodeId) => get().todos.filter((t) => t.linkedNodeId === nodeId),
    }),
    { name: 'todo-storage-v2' }
  )
);

