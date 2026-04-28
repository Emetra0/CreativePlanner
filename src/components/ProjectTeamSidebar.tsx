import { useMemo, useState } from 'react';
import { X, Users, Crown, Shield, Check, Settings2 } from 'lucide-react';
import { useAppTranslation } from '@/lib/appTranslations';
import { Project, ProjectMember, ProjectMemberCapabilities, ROLE_PRESET_GROUPS, PRESET_ROLES } from '@/store/useProjectStore';
import { StatusDot } from './StatusDot';

const DEFAULT_CAPABILITIES: ProjectMemberCapabilities = {
  clearance_level: 10,
  is_page_admin: 0,
  can_share: 0,
  can_create_nodes: 1,
};

function normalizeCapabilities(member?: Partial<ProjectMemberCapabilities>): ProjectMemberCapabilities {
  return {
    clearance_level: Math.max(0, Number(member?.clearance_level ?? DEFAULT_CAPABILITIES.clearance_level) || 0),
    is_page_admin: Number(member?.is_page_admin ?? DEFAULT_CAPABILITIES.is_page_admin) ? 1 : 0,
    can_share: Number(member?.can_share ?? DEFAULT_CAPABILITIES.can_share) ? 1 : 0,
    can_create_nodes: Number(member?.can_create_nodes ?? DEFAULT_CAPABILITIES.can_create_nodes) ? 1 : 0,
  };
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'U';
}

interface TeamMember extends ProjectMember {
  isOwner?: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  members: TeamMember[];
  currentUserId?: string | null;
  activeParticipantIds: string[];
  canManageRoles: boolean;
  onSaveMember: (member: TeamMember, role: string, permission: string, capabilities: ProjectMemberCapabilities) => Promise<void>;
}

export default function ProjectTeamSidebar({
  isOpen,
  onClose,
  project,
  members,
  currentUserId,
  activeParticipantIds,
  canManageRoles,
  onSaveMember,
}: Props) {
  const { text } = useAppTranslation();
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editCustomRole, setEditCustomRole] = useState('');
  const [editPermission, setEditPermission] = useState('view');
  const [editCapabilities, setEditCapabilities] = useState<ProjectMemberCapabilities>(DEFAULT_CAPABILITIES);
  const [saving, setSaving] = useState(false);

  const activeIds = useMemo(() => new Set(activeParticipantIds), [activeParticipantIds]);
  const presetRoleSet = useMemo(() => new Set(PRESET_ROLES.map((role) => role.toLowerCase())), []);
  const onlineMembers = useMemo(
    () => members.filter((member) => activeIds.has(member.user_id) || (member.presence && member.presence !== 'offline')),
    [members, activeIds],
  );

  const customRoles = useMemo(() => {
    return Array.from(new Set(
      members
        .map((member) => member.role)
        .filter(Boolean)
        .filter((role) => !presetRoleSet.has(role.toLowerCase())),
    ));
  }, [members, presetRoleSet]);

  const describeRole = (role: string) => (presetRoleSet.has(role.toLowerCase()) ? text(role) : role);

  const describePresence = (presence?: string | null) => {
    switch (presence) {
      case 'online':
        return text('Online');
      case 'idle':
        return text('Idle');
      case 'busy':
        return text('Do Not Disturb');
      default:
        return text('Offline');
    }
  };

  const describePermission = (permission: string) => {
    switch (permission) {
      case 'request_edit':
        return text('Suggest access');
      case 'edit':
        return text('Edit access');
      default:
        return text('Read only');
    }
  };

  const beginEdit = (member: TeamMember) => {
    setEditingMemberId(member.id);
    if ((PRESET_ROLES as readonly string[]).includes(member.role)) {
      setEditRole(member.role);
      setEditCustomRole('');
    } else {
      setEditRole('__custom__');
      setEditCustomRole(member.role);
    }
    setEditPermission(member.permission);
    setEditCapabilities(normalizeCapabilities(member));
  };

  const stopEdit = () => {
    setEditingMemberId(null);
    setEditRole('');
    setEditCustomRole('');
    setEditPermission('view');
    setEditCapabilities(DEFAULT_CAPABILITIES);
  };

  const handleSave = async (member: TeamMember) => {
    const nextRole = editRole === '__custom__' ? editCustomRole.trim() : editRole;
    if (!nextRole) return;
    setSaving(true);
    try {
      await onSaveMember(member, nextRole, editPermission, normalizeCapabilities(editCapabilities));
      stopEdit();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <aside className={`fixed right-0 top-0 z-50 h-full w-full max-w-md border-l border-gray-200 bg-white shadow-2xl transition-transform dark:border-gray-700 dark:bg-gray-900 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex h-full flex-col">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Users size={18} className="text-blue-500" />
                  <h2 className="text-base font-bold text-gray-900 dark:text-white">{text('Project team')}</h2>
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{project.name} · {text('people, live presence, and role overview')}</p>
              </div>
              <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200">
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600 dark:text-blue-300">{text('Online now')}</p>
                  <p className="mt-1 text-sm font-semibold text-blue-900 dark:text-blue-100">{text('{{active}} of {{total}} members active', { active: String(onlineMembers.length), total: String(members.length) })}</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-blue-700 shadow-sm dark:bg-blue-950 dark:text-blue-200">{text('Live team')}</span>
              </div>
              <div className="mt-3 space-y-2">
                {onlineMembers.length === 0 ? (
                  <p className="text-xs text-blue-700/80 dark:text-blue-200/80">{text('No one is active right now.')}</p>
                ) : (
                  onlineMembers.slice(0, 5).map((member) => {
                    const inDocument = activeIds.has(member.user_id);
                    return (
                      <div key={`online-${member.id}`} className="flex items-center gap-3 rounded-xl bg-white/80 px-3 py-2 dark:bg-blue-950/40">
                        <div className="relative">
                          <div
                            className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white"
                            style={{ background: member.banner_color || 'linear-gradient(135deg, #60a5fa 0%, #8b5cf6 100%)' }}
                          >
                            {getInitials(member.username)}
                          </div>
                          <StatusDot status={inDocument ? 'online' : member.presence || 'offline'} sizeClass="w-3 h-3" className="absolute -bottom-0.5 -right-0.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{member.username}</p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400">{inDocument ? text('Active in this document') : describePresence(member.presence)}</p>
                        </div>
                        <span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">{describeRole(member.role)}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/60">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-purple-500" />
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{text('Role overview')}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{text('Use presets for planning teams or create your own business-specific titles.')}</p>
                </div>
              </div>
              <div className="mt-3 space-y-3">
                {ROLE_PRESET_GROUPS.map((group) => (
                  <div key={group.label}>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{text(group.label)}</p>
                    <div className="flex flex-wrap gap-2">
                      {group.roles.map((role) => (
                        <span key={role} className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">{text(role)}</span>
                      ))}
                    </div>
                  </div>
                ))}
                {customRoles.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{text('Custom roles in this project')}</p>
                    <div className="flex flex-wrap gap-2">
                      {customRoles.map((role) => (
                        <span key={role} className="rounded-full border border-dashed border-blue-300 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-200">{role}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{text('Team members')}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{text('Everyone can view roles. Only the owner can update them here.')}</p>
                </div>
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">{text('{{count}} people', { count: String(members.length) })}</span>
              </div>
              <div className="space-y-3">
                {members.map((member) => {
                  const inDocument = activeIds.has(member.user_id);
                  const isCurrentUser = currentUserId === member.user_id;
                  const isEditing = editingMemberId === member.id;
                  return (
                    <div key={member.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800/70">
                      {isEditing ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <div
                                className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-white"
                                style={{ background: member.banner_color || 'linear-gradient(135deg, #60a5fa 0%, #8b5cf6 100%)' }}
                              >
                                {getInitials(member.username)}
                              </div>
                              <StatusDot status={inDocument ? 'online' : member.presence || 'offline'} sizeClass="w-3 h-3" className="absolute -bottom-0.5 -right-0.5" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-gray-900 dark:text-white">{member.username}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{text('Adjust role, access, and planning permissions')}</p>
                            </div>
                          </div>

                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{text('Role')}</label>
                            <select value={editRole} onChange={(event) => setEditRole(event.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white">
                              {ROLE_PRESET_GROUPS.map((group) => (
                                <optgroup key={group.label} label={text(group.label)}>
                                  {group.roles.map((role) => <option key={role} value={role}>{text(role)}</option>)}
                                </optgroup>
                              ))}
                              <option value="__custom__">{text('Custom…')}</option>
                            </select>
                            {editRole === '__custom__' && (
                              <input
                                value={editCustomRole}
                                onChange={(event) => setEditCustomRole(event.target.value)}
                                placeholder={text('Custom business role')}
                                className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                              />
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{text('Permission')}</label>
                              <select value={editPermission} onChange={(event) => setEditPermission(event.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white">
                                <option value="edit">{text('Can Edit')}</option>
                                <option value="view">{text('Can View')}</option>
                                <option value="request_edit">{text('Suggest')}</option>
                              </select>
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{text('Clearance')}</label>
                              <input
                                type="number"
                                min={0}
                                value={editCapabilities.clearance_level}
                                onChange={(event) => setEditCapabilities((prev) => ({ ...prev, clearance_level: Number(event.target.value) || 0 }))}
                                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-2 rounded-xl bg-gray-50 p-3 dark:bg-gray-900/70">
                            <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                              <input type="checkbox" checked={!!editCapabilities.is_page_admin} onChange={(event) => setEditCapabilities((prev) => ({ ...prev, is_page_admin: event.target.checked ? 1 : 0, can_share: event.target.checked ? 1 : prev.can_share }))} className="rounded border-gray-300 text-blue-500 focus:ring-blue-500" />
                              {text('Page admin')}
                            </label>
                            <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                              <input type="checkbox" checked={!!editCapabilities.can_share} onChange={(event) => setEditCapabilities((prev) => ({ ...prev, can_share: event.target.checked ? 1 : 0 }))} className="rounded border-gray-300 text-blue-500 focus:ring-blue-500" />
                              {text('Can share project resources')}
                            </label>
                            <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                              <input type="checkbox" checked={!!editCapabilities.can_create_nodes} onChange={(event) => setEditCapabilities((prev) => ({ ...prev, can_create_nodes: event.target.checked ? 1 : 0 }))} className="rounded border-gray-300 text-blue-500 focus:ring-blue-500" />
                              {text('Can create nodes')}
                            </label>
                          </div>

                          <div className="flex gap-2">
                            <button onClick={() => handleSave(member)} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50">
                              <Check size={13} /> {text('Save')}
                            </button>
                            <button onClick={stopEdit} className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 dark:border-gray-600 dark:text-gray-300">{text('Cancel')}</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-3">
                          <div className="relative">
                            <div
                              className="flex h-11 w-11 items-center justify-center rounded-full text-xs font-bold text-white"
                              style={{ background: member.banner_color || 'linear-gradient(135deg, #60a5fa 0%, #8b5cf6 100%)' }}
                            >
                              {getInitials(member.username)}
                            </div>
                            <StatusDot status={inDocument ? 'online' : member.presence || 'offline'} sizeClass="w-3 h-3" className="absolute -bottom-0.5 -right-0.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{member.username}</p>
                              {member.isOwner ? <Crown size={14} className="text-amber-500" /> : null}
                              {isCurrentUser ? <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500 dark:bg-gray-700 dark:text-gray-300">{text('You')}</span> : null}
                              {inDocument ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-300">{text('In document')}</span> : null}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{describeRole(member.role)}</span>
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">{text('Clearance {{level}}', { level: String(normalizeCapabilities(member).clearance_level) })}</span>
                              {!!member.is_page_admin && <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">{text('Page admin')}</span>}
                              {!!member.can_share && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">{text('Can share')}</span>}
                              {!!member.can_create_nodes && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">{text('Create nodes')}</span>}
                            </div>
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{describePresence(member.presence)} · {describePermission(member.permission)}</p>
                          </div>
                          {canManageRoles && !member.isOwner && (
                            <button onClick={() => beginEdit(member)} className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-blue-600 dark:hover:bg-gray-700">
                              <Settings2 size={15} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </aside>
    </>
  );
}
