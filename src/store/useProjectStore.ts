import { create } from 'zustand';
import { getWorkerUrl } from '@/lib/cloudSync';
import { useAuthStore } from './useAuthStore';

export interface ProjectMemberCapabilities {
  clearance_level: number;
  is_page_admin: number;
  can_share: number;
  can_create_nodes: number;
}

export interface ProjectMember extends ProjectMemberCapabilities {
  id: string;
  project_id: string;
  user_id: string;
  username: string;
  role: string;           // 'Owner' | 'Designer' | 'Developer' | 'Manager' | 'Editor' | 'Viewer' | custom
  permission: string;     // 'edit' | 'view' | 'request_edit'
  presence?: string | null;
  avatar_url?: string | null;
  banner_color?: string | null;
  joined_at: number;
}

export interface ProjectResource {
  id: string;
  project_id: string;
  resource_type: 'mindmap' | 'todo_list' | 'calendar' | 'document';
  resource_id: string;
  resource_name: string;
  owner_id: string;
  added_at: number;
}

export interface ProjectTodo {
  id: string;
  project_id: string;
  created_by: string;
  created_by_username: string;
  assigned_to: string | null;
  assigned_to_username: string | null;
  title: string;
  done: number;
  priority: 'low' | 'medium' | 'high';
  due_date: string | null;
  created_at: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  owner_username: string;
  created_at: number;
  member_count: number;
  my_role: string;
  my_permission: string;
  my_clearance_level: number;
  my_is_page_admin: number;
  my_can_share: number;
  my_can_create_nodes: number;
  is_owner: boolean;
}

export interface ProjectDetail extends Project {
  members: ProjectMember[];
  resources: ProjectResource[];
  todos: ProjectTodo[];
}

const ROLE_PRESET_GROUPS = [
  {
    label: 'Leadership',
    roles: ['Admin', 'Project Manager', 'Project Planner', 'Program Lead', 'Department Lead'],
  },
  {
    label: 'Planning & Operations',
    roles: ['Planning Coordinator', 'Operations Lead', 'Resource Manager', 'Scheduler', 'Reviewer'],
  },
  {
    label: 'Delivery Team',
    roles: ['Team Lead', 'Designer', 'Developer', 'Researcher', 'Editor', 'Viewer'],
  },
] as const;

const PRESET_ROLES = Array.from(new Set(ROLE_PRESET_GROUPS.flatMap((group) => group.roles)));
export { PRESET_ROLES, ROLE_PRESET_GROUPS };

function authHeaders() {
  const token = useAuthStore.getState().token;
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

interface ProjectState {
  projects: Project[];
  openProject: ProjectDetail | null;
  projectResources: Record<string, ProjectResource[]>; // projectId -> resources[]
  loading: boolean;
  error: string | null;

  fetchProjects: () => Promise<void>;
  fetchProjectResources: (projectId: string) => Promise<void>;
  createProject: (name: string, description: string) => Promise<Project | null>;
  deleteProject: (projectId: string) => Promise<void>;
  updateProject: (projectId: string, name: string, description: string) => Promise<void>;

  openProjectById: (projectId: string) => Promise<void>;
  clearOpenProject: () => void;

  inviteMember: (projectId: string, usernameOrEmail: string, role: string, permission: string, capabilities?: Partial<ProjectMemberCapabilities>) => Promise<ProjectMember | null>;
  updateMember: (projectId: string, memberId: string, role: string, permission: string, capabilities?: Partial<ProjectMemberCapabilities>) => Promise<void>;
  removeMember: (projectId: string, memberId: string) => Promise<void>;

  addResource: (projectId: string, resourceType: ProjectResource['resource_type'], resourceId: string, resourceName: string) => Promise<void>;
  removeResource: (projectId: string, resourceId: string) => Promise<void>;

  addTodo: (projectId: string, title: string, assignedTo: string | null, priority: string, dueDate: string | null) => Promise<void>;
  toggleTodo: (projectId: string, todoId: string) => Promise<void>;
  deleteTodo: (projectId: string, todoId: string) => Promise<void>;

  searchUsers: (q: string) => Promise<{ id: string; username: string; email: string; discriminator?: string }[]>;
  /** Send a share invite via DM. Returns { channelId } on success or null on failure. */
  sendShareInvite: (
    toUserId: string,
    resourceId: string,
    resourceType: string,
    resourceName: string,
    permission: string,
    role: string,
    existingProjectId?: string,
  ) => Promise<{ inviteId: string; channelId: string } | null>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  openProject: null,
  projectResources: {},
  loading: false,
  error: null,

  fetchProjectResources: async (projectId) => {
    try {
      const res = await fetch(`${getWorkerUrl()}/projects/${projectId}/resources`, { headers: authHeaders() });
      if (!res.ok) return;
      const { resources } = await res.json();
      set((s) => ({ projectResources: { ...s.projectResources, [projectId]: resources || [] } }));

      try {
        const { useMindmapStore } = await import('./useMindmapStore');
        await Promise.all(
          (resources || [])
            .filter((resource: ProjectResource) => resource.resource_type === 'mindmap')
            .map((resource: ProjectResource) => useMindmapStore.getState().syncSharedDocument(projectId, resource.resource_id)),
        );
      } catch {
        // Keep project resources loaded even if document sync fails.
      }
    } catch { /* silent */ }
  },

  fetchProjects: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${getWorkerUrl()}/projects`, { headers: authHeaders() });
      if (!res.ok) throw new Error(await res.text());
      const { projects } = await res.json();
      const validIds = new Set<string>((projects || []).map((p: any) => p.id));
      // Prune cached resources for projects that no longer exist (e.g. deleted by owner)
      set((s) => {
        const prunedResources: typeof s.projectResources = {};
        for (const key of Object.keys(s.projectResources)) {
          if (validIds.has(key)) prunedResources[key] = s.projectResources[key];
        }
        return {
          projects: projects || [],
          projectResources: prunedResources,
          // Clear openProject if it no longer exists on the server
          openProject: s.openProject && !validIds.has(s.openProject.id) ? null : s.openProject,
          loading: false,
        };
      });
    } catch (e: any) {
      set({ loading: false, error: e.message });
    }
  },

  createProject: async (name, description) => {
    try {
      const res = await fetch(`${getWorkerUrl()}/projects`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name, description }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { project } = await res.json();
      set((s) => ({ projects: [project, ...s.projects] }));
      return project;
    } catch (e: any) {
      set({ error: e.message });
      return null;
    }
  },

  deleteProject: async (projectId) => {
    const res = await fetch(`${getWorkerUrl()}/projects/${projectId}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) return;
    // Purge project + its resource cache from local state
    set((s) => {
      const updatedResources = { ...s.projectResources };
      delete updatedResources[projectId];
      return {
        projects: s.projects.filter((p) => p.id !== projectId),
        openProject: s.openProject?.id === projectId ? null : s.openProject,
        projectResources: updatedResources,
      };
    });
    // Refresh chat channels so the deleted project channel disappears from the sidebar
    try {
      const { useChatStore } = await import('@/store/useChatStore');
      await useChatStore.getState().fetchChannels();
    } catch { /* chat store may not be initialised yet */ }
  },

  updateProject: async (projectId, name, description) => {
    await fetch(`${getWorkerUrl()}/projects/${projectId}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ name, description }),
    });
    set((s) => ({
      projects: s.projects.map((p) => p.id === projectId ? { ...p, name, description } : p),
      openProject: s.openProject?.id === projectId ? { ...s.openProject, name, description } : s.openProject,
    }));
  },

  openProjectById: async (projectId) => {
    set({ loading: true });
    try {
      const res = await fetch(`${getWorkerUrl()}/projects/${projectId}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      set({ openProject: { ...data.project, members: data.members, resources: data.resources, todos: data.todos }, loading: false });
    } catch (e: any) {
      set({ loading: false, error: e.message });
    }
  },

  clearOpenProject: () => set({ openProject: null }),

  inviteMember: async (projectId, usernameOrEmail, role, permission, capabilities = {}) => {
    try {
      const res = await fetch(`${getWorkerUrl()}/projects/${projectId}/invite`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ username_or_email: usernameOrEmail, role, permission, ...capabilities }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed'); }
      const { member } = await res.json();
      set((s) => s.openProject?.id === projectId ? {
        openProject: { ...s.openProject, members: [...s.openProject.members, member], member_count: s.openProject.member_count + 1 },
      } : {});
      return member;
    } catch (e: any) {
      set({ error: e.message });
      return null;
    }
  },

  updateMember: async (projectId, memberId, role, permission, capabilities = {}) => {
    await fetch(`${getWorkerUrl()}/projects/${projectId}/members/${memberId}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ role, permission, ...capabilities }),
    });
    set((s) => s.openProject?.id === projectId ? {
      openProject: {
        ...s.openProject,
        members: s.openProject.members.map((m) => m.id === memberId ? {
          ...m,
          role,
          permission,
          ...capabilities,
        } : m),
      },
    } : {});
  },

  removeMember: async (projectId, memberId) => {
    await fetch(`${getWorkerUrl()}/projects/${projectId}/members/${memberId}`, { method: 'DELETE', headers: authHeaders() });
    set((s) => s.openProject?.id === projectId ? {
      openProject: { ...s.openProject, members: s.openProject.members.filter((m) => m.id !== memberId), member_count: Math.max(0, s.openProject.member_count - 1) },
    } : {});
  },

  addResource: async (projectId, resourceType, resourceId, resourceName) => {
    const res = await fetch(`${getWorkerUrl()}/projects/${projectId}/resources`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ resource_type: resourceType, resource_id: resourceId, resource_name: resourceName }),
    });
    if (!res.ok) return;
    const { resource } = await res.json();
    set((s) => {
      const updatedProjectResources = {
        ...s.projectResources,
        [projectId]: [...(s.projectResources[projectId] || []), resource],
      };
      return {
        projectResources: updatedProjectResources,
        ...(s.openProject?.id === projectId ? {
          openProject: { ...s.openProject, resources: [...s.openProject.resources, resource] },
        } : {}),
      };
    });
  },

  removeResource: async (projectId, resourceId) => {
    await fetch(`${getWorkerUrl()}/projects/${projectId}/resources/${resourceId}`, { method: 'DELETE', headers: authHeaders() });
    set((s) => s.openProject?.id === projectId ? {
      openProject: { ...s.openProject, resources: s.openProject.resources.filter((r) => r.id !== resourceId) },
    } : {});
  },

  addTodo: async (projectId, title, assignedTo, priority, dueDate) => {
    const res = await fetch(`${getWorkerUrl()}/projects/${projectId}/todos`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ title, assigned_to: assignedTo, priority, due_date: dueDate }),
    });
    if (!res.ok) return;
    const { todo } = await res.json();
    set((s) => s.openProject?.id === projectId ? {
      openProject: { ...s.openProject, todos: [todo, ...s.openProject.todos] },
    } : {});
  },

  toggleTodo: async (projectId, todoId) => {
    await fetch(`${getWorkerUrl()}/projects/${projectId}/todos/${todoId}/toggle`, { method: 'POST', headers: authHeaders() });
    set((s) => s.openProject?.id === projectId ? {
      openProject: { ...s.openProject, todos: s.openProject.todos.map((t) => t.id === todoId ? { ...t, done: t.done ? 0 : 1 } : t) },
    } : {});
  },

  deleteTodo: async (projectId, todoId) => {
    await fetch(`${getWorkerUrl()}/projects/${projectId}/todos/${todoId}`, { method: 'DELETE', headers: authHeaders() });
    set((s) => s.openProject?.id === projectId ? {
      openProject: { ...s.openProject, todos: s.openProject.todos.filter((t) => t.id !== todoId) },
    } : {});
  },

  searchUsers: async (q) => {
    if (q.length < 2) return [];
    const res = await fetch(`${getWorkerUrl()}/users/search?q=${encodeURIComponent(q)}`, { headers: authHeaders() });
    if (!res.ok) return [];
    const { users } = await res.json();
    return users || [];
  },

  sendShareInvite: async (toUserId, resourceId, resourceType, resourceName, permission, role, existingProjectId) => {
    try {
      let resourceDocument: any = undefined;
      let resourceData: any = undefined;

      if (resourceType === 'mindmap') {
        try {
          const { useMindmapStore } = await import('./useMindmapStore');
          const snapshot = await useMindmapStore.getState().getDocumentSnapshot(resourceId);
          resourceDocument = snapshot?.document;
          resourceData = snapshot?.data;
        } catch {
          // Fallback to backend-stored data if the local snapshot cannot be read.
        }
      }

      if (resourceType === 'document') {
        try {
          const { useOfficeDocumentStore } = await import('./useOfficeDocumentStore');
          const snapshot = await useOfficeDocumentStore.getState().getDocumentSnapshot(resourceId);
          resourceDocument = snapshot?.document;
          resourceData = snapshot?.data;
        } catch {
          // Fallback to backend-stored data if the local snapshot cannot be read.
        }
      }

      const res = await fetch(`${getWorkerUrl()}/invites`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          to_user_id: toUserId,
          resource_id: resourceId,
          resource_type: resourceType,
          resource_name: resourceName,
          permission,
          role,
          existing_project_id: existingProjectId,
          resource_document: resourceDocument,
          resource_data: resourceData,
        }),
      });
      if (!res.ok) return null;
      const { invite } = await res.json();
      return { inviteId: invite.id, channelId: invite.channelId };
    } catch {
      return null;
    }
  },
}));
