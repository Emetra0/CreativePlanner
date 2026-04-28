'use client';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useProjectStore, PRESET_ROLES, ProjectMember, ProjectMemberCapabilities } from '@/store/useProjectStore';
import { useMindmapStore } from '@/store/useMindmapStore';
import { useOfficeDocumentStore } from '@/store/useOfficeDocumentStore';
import { useChatStore } from '@/store/useChatStore';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Trash2, Users, FolderOpen, CheckSquare, Search,
  ChevronRight, Crown, Shield, Edit2, Link2, X, Check,
  UserPlus, Briefcase, Globe, MessageSquare, Calendar, Lightbulb, FileText,
  Flag, CircleUser, MoreVertical, Settings2,
} from 'lucide-react';
import { useAppDialogs } from '@/components/AppDialogs';
import { useAppTranslation } from '@/lib/appTranslations';

const PERMISSION_COLORS: Record<string, string> = {
  edit: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  view: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  request_edit: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};
const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-red-600 dark:text-red-400',
  medium: 'text-amber-500 dark:text-amber-400',
  low: 'text-green-600 dark:text-green-400',
};

const DEFAULT_MEMBER_CAPABILITIES: ProjectMemberCapabilities = {
  clearance_level: 10,
  is_page_admin: 0,
  can_share: 0,
  can_create_nodes: 1,
};

function normalizeCapabilities(capabilities?: Partial<ProjectMemberCapabilities>): ProjectMemberCapabilities {
  return {
    clearance_level: Math.max(0, Number(capabilities?.clearance_level ?? DEFAULT_MEMBER_CAPABILITIES.clearance_level) || 0),
    is_page_admin: Number(capabilities?.is_page_admin ?? DEFAULT_MEMBER_CAPABILITIES.is_page_admin) ? 1 : 0,
    can_share: Number(capabilities?.can_share ?? DEFAULT_MEMBER_CAPABILITIES.can_share) ? 1 : 0,
    can_create_nodes: Number(capabilities?.can_create_nodes ?? DEFAULT_MEMBER_CAPABILITIES.can_create_nodes) ? 1 : 0,
  };
}

function getMemberCapabilities(member?: Partial<ProjectMemberCapabilities>): ProjectMemberCapabilities {
  return normalizeCapabilities(member);
}

function formatProjectRelativeTime(ts: string | number, locale: string, fallbackLabel: string) {
  const time = typeof ts === 'number' ? ts : Date.parse(ts);
  if (Number.isNaN(time)) return fallbackLabel;

  const diff = Date.now() - time;
  if (diff < 60_000) return fallbackLabel;

  const relativeTime = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (diff < 3_600_000) return relativeTime.format(-Math.floor(diff / 60_000), 'minute');
  if (diff < 86_400_000) return relativeTime.format(-Math.floor(diff / 3_600_000), 'hour');
  if (diff < 2_592_000_000) return relativeTime.format(-Math.floor(diff / 86_400_000), 'day');

  const date = new Date(time);
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  }).format(date);
}

export default function ProjectsPage() {
  const dialogs = useAppDialogs();
  const { t, text, language } = useAppTranslation();
  const { user } = useAuthStore();
  const { projects, openProject, loading, fetchProjects, createProject, deleteProject, openProjectById, clearOpenProject,
    inviteMember, updateMember, removeMember, addResource, removeResource, addTodo, toggleTodo, deleteTodo,
    searchUsers, updateProject } = useProjectStore();
  const { documents, loadDocuments } = useMindmapStore();
  const { documents: officeDocuments, loadDocuments: loadOfficeDocuments } = useOfficeDocumentStore();
  const { openOrCreateDm } = useChatStore();
  const navigate = useNavigate();

  const [tab, setTab] = useState<'members' | 'resources' | 'todos'>('members');
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');

  // Invite flow
  const [showInvite, setShowInvite] = useState(false);
  const [inviteQuery, setInviteQuery] = useState('');
  const [inviteResults, setInviteResults] = useState<{ id: string; username: string; email: string }[]>([]);
  const [inviteRole, setInviteRole] = useState('Viewer');
  const [customRole, setCustomRole] = useState('');
  const [invitePermission, setInvitePermission] = useState('view');
  const [inviteCapabilities, setInviteCapabilities] = useState<ProjectMemberCapabilities>(DEFAULT_MEMBER_CAPABILITIES);
  const [inviteError, setInviteError] = useState('');

  // Edit member
  const [editMemberId, setEditMemberId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editCustomRole, setEditCustomRole] = useState('');
  const [editPermission, setEditPermission] = useState('view');
  const [editCapabilities, setEditCapabilities] = useState<ProjectMemberCapabilities>(DEFAULT_MEMBER_CAPABILITIES);

  // Add resource
  const [showAddResource, setShowAddResource] = useState(false);
  const [resourceType, setResourceType] = useState<'mindmap' | 'document'>('mindmap');

  // Add project todo
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [newTodoPriority, setNewTodoPriority] = useState('medium');
  const [newTodoDue, setNewTodoDue] = useState('');
  const [newTodoAssignee, setNewTodoAssignee] = useState('');

  const permissionOptions = [
    { value: 'edit', label: t('projects.permissionEdit') },
    { value: 'view', label: t('projects.permissionView') },
    { value: 'request_edit', label: t('projects.permissionRequestEdit') },
  ];

  const permissionLabels = Object.fromEntries(permissionOptions.map((option) => [option.value, option.label]));

  const tabItems = [
    { id: 'members' as const, Icon: Users, label: t('projects.tabMembers') },
    { id: 'resources' as const, Icon: Link2, label: t('projects.tabResources') },
    { id: 'todos' as const, Icon: CheckSquare, label: t('projects.tabTodos') },
  ];

  const translateRoleLabel = (role: string) => {
    switch (role) {
      case 'Owner':
        return t('projects.owner');
      case 'Viewer':
        return t('projects.roleViewer');
      case 'Editor':
        return t('projects.roleEditor');
      case 'Admin':
        return t('projects.roleAdmin');
      default:
        return role;
    }
  };

  const translatePriorityLabel = (priority: string) => {
    switch (priority) {
      case 'low':
        return t('projects.priorityLow');
      case 'medium':
        return t('projects.priorityMedium');
      case 'high':
        return t('projects.priorityHigh');
      default:
        return priority;
    }
  };

  const formatCreatedAgo = (timestamp: string | number) => formatProjectRelativeTime(timestamp, language, text('just now'));

  useEffect(() => {
    fetchProjects();
    loadDocuments();
    loadOfficeDocuments();
  }, []);

  // User search debounce
  useEffect(() => {
    if (inviteQuery.length < 2) { setInviteResults([]); return; }
    const t = setTimeout(async () => {
      const results = await searchUsers(inviteQuery);
      setInviteResults(results);
    }, 300);
    return () => clearTimeout(t);
  }, [inviteQuery]);

  const handleCreate = async () => {
    if (!createName.trim()) return;
    await createProject(createName.trim(), createDesc.trim());
    setShowCreate(false);
    setCreateName('');
    setCreateDesc('');
  };

  const handleInvite = async (targetUser: { id: string; username: string }) => {
    setInviteError('');
    const finalRole = inviteRole === '__custom__' ? customRole.trim() : inviteRole;
    if (!finalRole) { setInviteError(t('projects.errorRoleRequired')); return; }
    if (!openProject) return;
    const result = await inviteMember(openProject.id, targetUser.username, finalRole, invitePermission, normalizeCapabilities(inviteCapabilities));
    if (!result) {
      setInviteError(useProjectStore.getState().error || t('projects.errorInviteFailed'));
    } else {
      setInviteQuery('');
      setInviteResults([]);
      setShowInvite(false);
      setInviteCapabilities(DEFAULT_MEMBER_CAPABILITIES);
    }
  };

  const handleSaveEditMember = async (m: ProjectMember) => {
    if (!openProject) return;
    const finalRole = editRole === '__custom__' ? editCustomRole.trim() : editRole;
    await updateMember(openProject.id, m.id, finalRole, editPermission, normalizeCapabilities(editCapabilities));
    setEditMemberId(null);
  };

  const handleAddTodo = async () => {
    if (!newTodoTitle.trim() || !openProject) return;
    const assignee = newTodoAssignee || null;
    await addTodo(openProject.id, newTodoTitle.trim(), assignee, newTodoPriority, newTodoDue || null);
    setNewTodoTitle('');
    setNewTodoDue('');
    setNewTodoPriority('medium');
    setNewTodoAssignee('');
  };

  const handleDmMember = async (memberId: string) => {
    const channelId = await openOrCreateDm(memberId);
    if (channelId) navigate(`/chat?channel=${channelId}`);
  };

  const allMembers = openProject ? [
    {
      id: '__owner__',
      user_id: openProject.owner_id,
      username: openProject.owner_username,
      role: 'Owner',
      permission: 'edit',
      joined_at: openProject.created_at,
      project_id: openProject.id,
      clearance_level: 999,
      is_page_admin: 1,
      can_share: 1,
      can_create_nodes: 1,
    },
    ...openProject.members,
  ] : [];

  return (
    <div className="h-full flex bg-gray-50 dark:bg-gray-900 overflow-hidden">
      {/* Left: project list */}
      <aside className="w-72 shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Briefcase size={18} className="text-blue-500" />
            <h2 className="font-bold text-gray-800 dark:text-white text-sm">{t('projects.title')}</h2>
          </div>
          <button onClick={() => setShowCreate(true)} className="p-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white transition-colors">
            <Plus size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading && !projects.length ? (
            <p className="text-center text-gray-400 text-xs py-8">{t('projects.loading')}</p>
          ) : projects.length === 0 ? (
            <div className="text-center py-12 px-4">
              <Briefcase size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('projects.emptyTitle')}</p>
              <button onClick={() => setShowCreate(true)} className="mt-3 text-xs text-blue-500 hover:underline">{t('projects.emptyAction')}</button>
            </div>
          ) : (
            projects.map((p) => (
              <button key={p.id} onClick={() => { openProjectById(p.id); setTab('members'); }}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors group ${openProject?.id === p.id ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}>
                <div className="flex items-center gap-2">
                  {p.is_owner ? <Crown size={12} className="text-amber-500 shrink-0" /> : <Users size={12} className="text-blue-400 shrink-0" />}
                  <span className="text-sm font-medium text-gray-800 dark:text-white truncate flex-1">{p.name}</span>
                  <ChevronRight size={12} className="text-gray-400 opacity-0 group-hover:opacity-100" />
                </div>
                <div className="mt-0.5 flex items-center gap-2 ml-4">
                  <span className="text-xs text-gray-400">{t(p.member_count === 1 ? 'projects.memberCountOne' : 'projects.memberCountOther', { count: String(p.member_count) })}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${PERMISSION_COLORS[p.my_permission] || ''}`}>{translateRoleLabel(p.my_role)}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Main: project detail */}
      <div className="flex-1 overflow-y-auto">
        {!openProject ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <Briefcase size={48} className="text-gray-300 dark:text-gray-600 mb-4" />
            <h3 className="text-lg font-bold text-gray-700 dark:text-gray-300 mb-2">{t('projects.selectTitle')}</h3>
            <p className="text-sm text-gray-400 max-w-xs">{t('projects.selectDescription')}</p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">{openProject.name}</h1>
                  {openProject.is_owner && <span title={t('projects.youOwnThisProject')}><Crown size={16} className="text-amber-500" /></span>}
                </div>
                {openProject.description && <p className="text-sm text-gray-500 dark:text-gray-400">{openProject.description}</p>}
                <p className="text-xs text-gray-400 mt-1">{t('projects.createdBy', { owner: openProject.owner_username, timeAgo: formatCreatedAgo(openProject.created_at) })}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-600 dark:bg-gray-700 dark:text-gray-300">{t('projects.yourRole', { role: translateRoleLabel(openProject.my_role) })}</span>
                  {!!openProject.my_is_page_admin && <span className="rounded-full bg-purple-100 px-2 py-1 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">{t('projects.pageAdmin')}</span>}
                  {!!openProject.my_can_share && <span className="rounded-full bg-blue-100 px-2 py-1 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{t('projects.canShare')}</span>}
                  {!!openProject.my_can_create_nodes && <span className="rounded-full bg-green-100 px-2 py-1 text-green-700 dark:bg-green-900/30 dark:text-green-300">{t('projects.canCreateNodes')}</span>}
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">{t('projects.clearanceLevel', { level: String(openProject.my_clearance_level) })}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => navigate(`/chat`)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors">
                  <MessageSquare size={13} /> {t('projects.projectChat')}
                </button>
                {openProject.is_owner && (
                  <button onClick={async () => {
                    if (await dialogs.confirm({ title: t('projects.deleteProjectTitle'), message: t('projects.deleteProjectMessage', { name: openProject.name }), confirmLabel: t('projects.delete'), isDanger: true })) {
                      deleteProject(openProject.id);
                      clearOpenProject();
                    }
                  }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 transition-colors">
                    <Trash2 size={13} /> {t('projects.delete')}
                  </button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-700/60 p-1 rounded-xl mb-6 w-fit">
              {tabItems.map(({ id, Icon, label }) => (
                <button key={id} onClick={() => setTab(id)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === id ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                  <Icon size={14} /> {label}
                  {id === 'members' && <span className="ml-1 text-xs bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 px-1.5 rounded-full">{allMembers.length}</span>}
                  {id === 'todos' && openProject.todos.length > 0 && <span className="ml-1 text-xs bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 px-1.5 rounded-full">{openProject.todos.length}</span>}
                </button>
              ))}
            </div>

            {/* MEMBERS TAB */}
            {tab === 'members' && (
              <div className="space-y-4">
                {openProject.is_owner && (
                  <button onClick={() => setShowInvite(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-medium transition-colors">
                    <UserPlus size={16} /> {t('projects.inviteMember')}
                  </button>
                )}

                {/* Invite panel */}
                {showInvite && (
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                    <h3 className="text-sm font-bold text-gray-800 dark:text-white mb-4">{t('projects.invitePanelTitle')}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">{t('projects.searchByUsernameOrEmail')}</label>
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input value={inviteQuery} onChange={(e) => setInviteQuery(e.target.value)} placeholder={t('projects.searchPlaceholder')}
                            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        {inviteResults.length > 0 && (
                          <div className="mt-1 border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                            {inviteResults.map((u) => (
                              <button key={u.id} onClick={() => handleInvite(u)}
                                className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-2 text-sm border-b last:border-b-0 border-gray-100 dark:border-gray-600">
                                <CircleUser size={16} className="text-gray-400" />
                                <div>
                                  <p className="font-medium text-gray-800 dark:text-white">{u.username}</p>
                                  <p className="text-xs text-gray-400">{u.email}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">{t('projects.role')}</label>
                          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white">
                            {PRESET_ROLES.map((r) => <option key={r} value={r}>{translateRoleLabel(r)}</option>)}
                            <option value="__custom__">{t('projects.custom')}</option>
                          </select>
                          {inviteRole === '__custom__' && (
                            <input value={customRole} onChange={(e) => setCustomRole(e.target.value)} placeholder={t('projects.enterCustomRole')}
                              className="mt-2 w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          )}
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">{t('projects.permission')}</label>
                          <select value={invitePermission} onChange={(e) => setInvitePermission(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white">
                            {permissionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">{t('projects.clearance')}</label>
                            <input
                              type="number"
                              min={0}
                              value={inviteCapabilities.clearance_level}
                              onChange={(e) => setInviteCapabilities((prev) => ({ ...prev, clearance_level: Number(e.target.value) || 0 }))}
                              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                            />
                          </div>
                          <div className="space-y-2 pt-5">
                            <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                              <input
                                type="checkbox"
                                checked={!!inviteCapabilities.is_page_admin}
                                onChange={(e) => setInviteCapabilities((prev) => ({
                                  ...prev,
                                  is_page_admin: e.target.checked ? 1 : 0,
                                  can_share: e.target.checked ? 1 : prev.can_share,
                                }))}
                                className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                              />
                              {t('projects.pageAdmin')}
                            </label>
                            <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                              <input
                                type="checkbox"
                                checked={!!inviteCapabilities.can_share}
                                onChange={(e) => setInviteCapabilities((prev) => ({ ...prev, can_share: e.target.checked ? 1 : 0 }))}
                                className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                              />
                              {t('projects.canShare')}
                            </label>
                            <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                              <input
                                type="checkbox"
                                checked={!!inviteCapabilities.can_create_nodes}
                                onChange={(e) => setInviteCapabilities((prev) => ({ ...prev, can_create_nodes: e.target.checked ? 1 : 0 }))}
                                className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                              />
                              {t('projects.canCreateNodes')}
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                    {inviteError && <p className="text-xs text-red-500 mt-2">{inviteError}</p>}
                    <div className="flex gap-2 mt-4">
                      <button onClick={() => { setShowInvite(false); setInviteQuery(''); setInviteResults([]); setInviteError(''); setInviteCapabilities(DEFAULT_MEMBER_CAPABILITIES); }}
                        className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">{t('projects.cancel')}</button>
                    </div>
                  </div>
                )}

                {/* Members list */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
                  {allMembers.map((m) => (
                    <div key={m.id} className="p-4">
                      {editMemberId === m.id ? (
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center gap-2">
                            <CircleUser size={18} className="text-gray-400" />
                            <span className="font-medium text-gray-800 dark:text-white text-sm">{m.username}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs text-gray-500 mb-1 block">{t('projects.role')}</label>
                              <select value={editRole} onChange={(e) => setEditRole(e.target.value)}
                                className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white">
                                {PRESET_ROLES.map((r) => <option key={r} value={r}>{translateRoleLabel(r)}</option>)}
                                <option value="__custom__">{t('projects.custom')}</option>
                              </select>
                              {editRole === '__custom__' && (
                                <input value={editCustomRole} onChange={(e) => setEditCustomRole(e.target.value)} placeholder={t('projects.customRole')}
                                  className="mt-1 w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                              )}
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 mb-1 block">{t('projects.permission')}</label>
                              <select value={editPermission} onChange={(e) => setEditPermission(e.target.value)}
                                className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white">
                                {permissionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                              </select>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs text-gray-500 mb-1 block">{t('projects.clearance')}</label>
                              <input
                                type="number"
                                min={0}
                                value={editCapabilities.clearance_level}
                                onChange={(e) => setEditCapabilities((prev) => ({ ...prev, clearance_level: Number(e.target.value) || 0 }))}
                                className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                              />
                            </div>
                            <div className="space-y-2 pt-5">
                              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                                <input
                                  type="checkbox"
                                  checked={!!editCapabilities.is_page_admin}
                                  onChange={(e) => setEditCapabilities((prev) => ({
                                    ...prev,
                                    is_page_admin: e.target.checked ? 1 : 0,
                                    can_share: e.target.checked ? 1 : prev.can_share,
                                  }))}
                                  className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                                />
                                {t('projects.pageAdmin')}
                              </label>
                              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                                <input
                                  type="checkbox"
                                  checked={!!editCapabilities.can_share}
                                  onChange={(e) => setEditCapabilities((prev) => ({ ...prev, can_share: e.target.checked ? 1 : 0 }))}
                                  className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                                />
                                {t('projects.canShare')}
                              </label>
                              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                                <input
                                  type="checkbox"
                                  checked={!!editCapabilities.can_create_nodes}
                                  onChange={(e) => setEditCapabilities((prev) => ({ ...prev, can_create_nodes: e.target.checked ? 1 : 0 }))}
                                  className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                                />
                                {t('projects.canCreateNodes')}
                              </label>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleSaveEditMember(m as ProjectMember)} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600"><Check size={12} /> {t('projects.save')}</button>
                            <button onClick={() => setEditMemberId(null)} className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300"><X size={12} /> {t('projects.cancel')}</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <CircleUser size={32} className="text-gray-300 dark:text-gray-600 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-800 dark:text-white text-sm">{m.username}</span>
                              {m.user_id === user?.id && <span className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded">{t('projects.you')}</span>}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-gray-500">{translateRoleLabel(m.id === '__owner__' ? 'Owner' : m.role)}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${PERMISSION_COLORS[m.permission] || ''}`}>{permissionLabels[m.permission] || m.permission}</span>
                              {!!m.is_page_admin && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">{t('projects.pageAdmin')}</span>}
                              {!!m.can_share && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{t('projects.canShare')}</span>}
                              {!!m.can_create_nodes && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">{t('projects.createNodes')}</span>}
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">{t('projects.clearanceBadge', { level: String(getMemberCapabilities(m).clearance_level) })}</span>
                            </div>
                          </div>
                          {m.user_id !== user?.id && (
                            <div className="flex gap-1.5">
                              <button onClick={() => handleDmMember(m.user_id)} title={t('projects.sendDm')}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                                <MessageSquare size={14} />
                              </button>
                              {openProject.is_owner && m.id !== '__owner__' && (
                                <>
                                  <button onClick={() => {
                                    setEditMemberId(m.id);
                                    setEditRole(m.role);
                                    setEditPermission(m.permission);
                                    setEditCustomRole('');
                                    setEditCapabilities(getMemberCapabilities(m));
                                  }} title={t('projects.edit')}
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                                    <Settings2 size={14} />
                                  </button>
                                  <button onClick={async () => {
                                    if (await dialogs.confirm({ title: t('projects.removeMemberTitle'), message: t('projects.removeMemberMessage', { username: m.username, project: openProject.name }), confirmLabel: t('projects.remove'), isDanger: true })) {
                                      removeMember(openProject.id, m.id);
                                    }
                                  }} title={t('projects.remove')}
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                                    <X size={14} />
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* RESOURCES TAB */}
            {tab === 'resources' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500 dark:text-gray-400">{t('projects.resourcesDescription')}</p>
                  <button onClick={() => setShowAddResource(true)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-xs font-medium">
                    <Plus size={13} /> {t('projects.addResource')}
                  </button>
                </div>

                {showAddResource && (
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                    <h3 className="text-sm font-bold text-gray-800 dark:text-white mb-4">{t('projects.linkResourceTitle')}</h3>
                    <div className="mb-3">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">{t('projects.type')}</label>
                      <div className="flex gap-2">
                        <button onClick={() => setResourceType('mindmap')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium ${resourceType === 'mindmap' ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                          {t('projects.resourceMindmap')}
                        </button>
                        <button onClick={() => setResourceType('document')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium ${resourceType === 'document' ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                          {text('Document')}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {resourceType === 'mindmap' && documents.filter((d) => !openProject.resources.some((r) => r.resource_id === d.id)).map((doc) => (
                        <button key={doc.id} onClick={async () => {
                          await addResource(openProject.id, 'mindmap', doc.id, doc.title);
                          setShowAddResource(false);
                        }}
                          className="w-full flex items-center gap-3 p-3 text-left border border-gray-200 dark:border-gray-600 rounded-lg hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors">
                          <Lightbulb size={16} className="text-amber-500 shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-gray-800 dark:text-white">{doc.title}</p>
                            <p className="text-xs text-gray-400">{t('projects.resourceMindmap')}</p>
                          </div>
                        </button>
                      ))}
                      {resourceType === 'document' && officeDocuments.filter((doc) => !openProject.resources.some((r) => r.resource_id === doc.id)).map((doc) => (
                        <button key={doc.id} onClick={async () => {
                          await addResource(openProject.id, 'document', doc.id, doc.title);
                          setShowAddResource(false);
                        }}
                          className="w-full flex items-center gap-3 p-3 text-left border border-gray-200 dark:border-gray-600 rounded-lg hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors">
                          <FileText size={16} className="text-slate-500 shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-gray-800 dark:text-white">{doc.title}</p>
                            <p className="text-xs text-gray-400">{text('Document')}</p>
                          </div>
                        </button>
                      ))}
                      {resourceType === 'mindmap' && documents.length === 0 && <p className="text-xs text-gray-400 py-4 text-center">{t('projects.noMindmapsFound')}</p>}
                      {resourceType === 'document' && officeDocuments.length === 0 && <p className="text-xs text-gray-400 py-4 text-center">{text('No office documents yet. Create one from Documents, Spreadsheets, or Presentations first.')}</p>}
                    </div>
                    <button onClick={() => setShowAddResource(false)} className="mt-4 px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">{t('projects.cancel')}</button>
                  </div>
                )}

                {openProject.resources.length === 0 ? (
                  <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                    <Link2 size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('projects.noResources')}</p>
                  </div>
                ) : (
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
                    {openProject.resources.map((r) => (
                      <div key={r.id} className="p-4 flex items-center gap-3">
                        {r.resource_type === 'mindmap' && <Lightbulb size={18} className="text-amber-500 shrink-0" />}
                        {r.resource_type === 'calendar' && <Calendar size={18} className="text-blue-500 shrink-0" />}
                        {r.resource_type === 'document' && <FileText size={18} className="text-slate-500 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{r.resource_name}</p>
                          <p className="text-xs text-gray-400 capitalize">{r.resource_type.replace('_', ' ')}</p>
                        </div>
                        <div className="flex gap-1">
                          {r.resource_type === 'mindmap' && (
                            <button onClick={() => navigate(`/mindmap/editor?id=${r.resource_id}`)}
                              className="px-2.5 py-1.5 text-xs rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 transition-colors">
                              {t('projects.open')}
                            </button>
                          )}
                          {r.resource_type === 'document' && (
                            <button onClick={() => navigate(`/office/editor?id=${r.resource_id}`)}
                              className="px-2.5 py-1.5 text-xs rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 transition-colors">
                              {t('projects.open')}
                            </button>
                          )}
                          {(openProject.is_owner || r.owner_id === user?.id) && (
                            <button onClick={() => removeResource(openProject.id, r.id)}
                              className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TODOS TAB */}
            {tab === 'todos' && (
              <div className="space-y-4">
                {/* Add todo form */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <h3 className="text-sm font-bold text-gray-800 dark:text-white mb-3">{t('projects.addTaskTitle')}</h3>
                  <div className="flex gap-2 mb-3">
                    <input value={newTodoTitle} onChange={(e) => setNewTodoTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddTodo()}
                      placeholder={t('projects.taskDescriptionPlaceholder')}
                      className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <button onClick={handleAddTodo} className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium">{t('projects.add')}</button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-gray-500 mb-0.5 block">{t('projects.assignTo')}</label>
                      <select value={newTodoAssignee} onChange={(e) => setNewTodoAssignee(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white">
                        <option value="">{t('projects.everyone')}</option>
                        {allMembers.map((m) => <option key={m.user_id} value={m.user_id}>{m.username}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-0.5 block">{t('projects.priority')}</label>
                      <select value={newTodoPriority} onChange={(e) => setNewTodoPriority(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white">
                        <option value="low">{t('projects.priorityLow')}</option>
                        <option value="medium">{t('projects.priorityMedium')}</option>
                        <option value="high">{t('projects.priorityHigh')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-0.5 block">{t('projects.dueDate')}</label>
                      <input type="date" value={newTodoDue} onChange={(e) => setNewTodoDue(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white" />
                    </div>
                  </div>
                </div>

                {/* Todos list */}
                {openProject.todos.length === 0 ? (
                  <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                    <CheckSquare size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('projects.noTasks')}</p>
                  </div>
                ) : (
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
                    {openProject.todos.map((todo) => (
                      <div key={todo.id} className={`p-4 flex items-start gap-3 ${todo.done ? 'opacity-60' : ''}`}>
                        <button onClick={() => toggleTodo(openProject.id, todo.id)}
                          className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${todo.done ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-gray-600 hover:border-green-400'}`}>
                          {!!todo.done && <Check size={10} className="text-white" strokeWidth={3} />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm text-gray-800 dark:text-white ${todo.done ? 'line-through text-gray-400' : ''}`}>{todo.title}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span className={`text-xs font-medium ${PRIORITY_COLORS[todo.priority]}`}>⚑ {translatePriorityLabel(todo.priority)}</span>
                            {todo.assigned_to_username && <span className="text-xs text-gray-400">{t('projects.assignedToName', { name: todo.assigned_to_username })}</span>}
                            {todo.due_date && <span className="text-xs text-gray-400">{t('projects.dueDateValue', { date: todo.due_date })}</span>}
                            <span className="text-xs text-gray-400">{t('projects.createdByUser', { username: todo.created_by_username })}</span>
                          </div>
                        </div>
                        {(todo.created_by === user?.id || openProject.is_owner) && (
                          <button onClick={() => deleteTodo(openProject.id, todo.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Project Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t('projects.createProjectTitle')}</h2>
              <div className="space-y-3">
                <input value={createName} onChange={(e) => setCreateName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreate()} placeholder={t('projects.projectNamePlaceholder')}
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
                <textarea value={createDesc} onChange={(e) => setCreateDesc(e.target.value)} placeholder={t('projects.projectDescriptionPlaceholder')} rows={3}
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => { setShowCreate(false); setCreateName(''); setCreateDesc(''); }}
                  className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl text-sm hover:bg-gray-50 dark:hover:bg-gray-700">{t('projects.cancel')}</button>
                <button onClick={handleCreate} disabled={!createName.trim()}
                  className="flex-1 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl text-sm font-medium">{t('projects.create')}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
