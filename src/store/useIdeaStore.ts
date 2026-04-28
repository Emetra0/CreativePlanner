import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Idea {
  id: string;
  content: string;
  createdAt: string;
  tags: string[];
}

interface IdeaState {
  ideas: Idea[];
  setIdeas: (ideas: Idea[]) => void;
  addIdea: (content: string, tags?: string[]) => void;
  removeIdea: (id: string) => void;
  updateIdea: (id: string, content: string) => void;
}

export const useIdeaStore = create<IdeaState>()(
  persist(
    (set) => ({
      ideas: [],
      setIdeas: (ideas) => set({ ideas }),
      addIdea: (content, tags = []) =>
        set((state) => ({
          ideas: [
            {
              id: Date.now().toString(),
              content,
              createdAt: new Date().toISOString(),
              tags,
            },
            ...state.ideas,
          ],
        })),
      removeIdea: (id) =>
        set((state) => ({
          ideas: state.ideas.filter((idea) => idea.id !== id),
        })),
      updateIdea: (id, content) =>
        set((state) => ({
          ideas: state.ideas.map((idea) =>
            idea.id === id ? { ...idea, content } : idea
          ),
        })),
    }),
    {
      name: 'creative-planner-ideas',
    }
  )
);
