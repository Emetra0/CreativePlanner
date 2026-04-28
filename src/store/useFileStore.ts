import { create } from 'zustand';

interface FileStore {
    currentPath: string;
    setCurrentPath: (path: string) => void;
    refreshTrigger: number;
    triggerRefresh: () => void;
}

export const useFileStore = create<FileStore>((set) => ({
    currentPath: '',
    setCurrentPath: (path) => set({ currentPath: path }),
    refreshTrigger: 0,
    triggerRefresh: () => set(state => ({ refreshTrigger: state.refreshTrigger + 1 }))
}));
