import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // ISO date string YYYY-MM-DD
  type: 'deadline' | 'recording' | 'editing' | 'release' | 'task' | 'other';
  description?: string;
  /** When type === 'task', links to the todo entry */
  todoId?: string;
}

interface CalendarState {
  events: CalendarEvent[];
  addEvent: (event: CalendarEvent) => void;
  removeEvent: (id: string) => void;
  updateEvent: (id: string, updates: Partial<CalendarEvent>) => void;
  setEvents: (events: CalendarEvent[]) => void;
}

export const useCalendarStore = create<CalendarState>()(
  persist(
    (set) => ({
      events: [],
      setEvents: (events) => set({ events }),
      addEvent: (event) => set((state) => ({ events: [...state.events, event] })),
      removeEvent: (id) => set((state) => ({ events: state.events.filter((e) => e.id !== id) })),
      updateEvent: (id, updates) =>
        set((state) => ({
          events: state.events.map((e) => (e.id === id ? { ...e, ...updates } : e)),
        })),
    }),
    {
      name: 'creative-planner-calendar',
    }
  )
);
