import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PresenceStatus = 'online' | 'idle' | 'busy' | 'offline';

interface User {
  id: string;
  email: string;
  username?: string;
  /** 4-digit tag used to distinguish users with the same display name, e.g. "alice#3847" */
  discriminator?: string;
  role?: 'user' | 'admin';
  // DB/backend uses snake_case; frontend may also see camelCase – store both
  two_factor_enabled?: boolean;
  twoFactorEnabled?: boolean;
  status?: 'pending' | 'active' | 'rejected';
  backup_email?: string;
  auth_provider?: string;
  avatar_url?: string | null;
  banner_color?: string | null;
  banner_image?: string | null;
  about?: string | null;
  presence?: PresenceStatus | null;
  last_seen_at?: number | null;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (user: User, token: string) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      login: (user, token) => {
        // 1. Restore User Data
        try {
            const backupKey = `cp_store_backup_${user.id}`;
            const backupData = localStorage.getItem(backupKey);
            
            if (backupData) {
                console.log(`Restoring data for user ${user.id}`);
                localStorage.setItem('creative-planner-storage', backupData);
            } else {
                console.log(`No backup found for user ${user.id}, starting fresh.`);
                localStorage.removeItem('creative-planner-storage');
            }
        } catch (e) {
            console.error("Failed to restore user data", e);
        }

        // 2. Set Auth State
        set({ user, token, isAuthenticated: true });

        // 3. Force Reload to Rehydrate Stores
        // We delay slightly to ensure localStorage write of auth state completes
        setTimeout(() => {
            window.location.assign('/');
        }, 200);
      },
      logout: () => {
        // 1. Backup User Data
        const { user } = get();
        if (user) {
            try {
                const currentData = localStorage.getItem('creative-planner-storage');
                if (currentData) {
                    console.log(`Backing up data for user ${user.id}`);
                    localStorage.setItem(`cp_store_backup_${user.id}`, currentData);
                }
            } catch (e) {
                console.error("Failed to backup user data", e);
            }
        }

        // 2. Clear Shared Storage
        localStorage.removeItem('creative-planner-storage');

        // 3. Clear Auth State
        set({ user: null, token: null, isAuthenticated: false });
        
        // 4. Force Reload
        window.location.href = '/login';
      },
      updateUser: (updates) => set((state) => ({ user: state.user ? { ...state.user, ...updates } : null })),
    }),
    {
      name: 'creative-planner-auth',
    }
  )
);
