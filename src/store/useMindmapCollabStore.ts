import { create } from 'zustand';

export interface MindmapCollaborator {
  userId: string;
  username?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  bannerColor?: string | null;
  presence?: string | null;
  selectedNodeIds: string[];
  editingNodeIds: string[];
}

interface MindmapCollabState {
  participants: MindmapCollaborator[];
  localSelectedNodeIds: string[];
  localEditingNodeIds: string[];
  setParticipants: (participants: MindmapCollaborator[]) => void;
  setLocalSelectedNodeIds: (nodeIds: string[]) => void;
  setLocalEditingNodeIds: (nodeIds: string[]) => void;
  reset: () => void;
}

export const useMindmapCollabStore = create<MindmapCollabState>((set) => ({
  participants: [],
  localSelectedNodeIds: [],
  localEditingNodeIds: [],
  setParticipants: (participants) => set({ participants }),
  setLocalSelectedNodeIds: (nodeIds) => set({ localSelectedNodeIds: Array.from(new Set(nodeIds)) }),
  setLocalEditingNodeIds: (nodeIds) => set({ localEditingNodeIds: Array.from(new Set(nodeIds)) }),
  reset: () => set({ participants: [], localSelectedNodeIds: [], localEditingNodeIds: [] }),
}));
