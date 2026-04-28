import { useState, useEffect, useRef } from 'react';
import { Share2, Search, UserPlus, UserCheck, X, Check, Users, Send } from 'lucide-react';
import { useAppTranslation } from '@/lib/appTranslations';
import { PRESET_ROLES, useProjectStore } from '@/store/useProjectStore';

type Permission = 'edit' | 'view' | 'request_edit';
const PERMISSION_OPTIONS: { value: Permission; label: string; role: string; desc: string }[] = [
  { value: 'edit',         label: 'Edit & Read',   role: 'Editor',      desc: 'Can view and make changes' },
  { value: 'view',         label: 'Read Only',     role: 'Viewer',      desc: 'Can view but not edit' },
  { value: 'request_edit', label: 'Suggest Edits', role: 'Contributor', desc: 'Can propose changes for review' },
];

interface Props {
  doc: { id: string; title: string };
  onClose: () => void;
}

export default function MindmapShareModal({ doc, onClose }: Props) {
  const { text } = useAppTranslation();
  const {
    projects, projectResources, fetchProjectResources,
    fetchProjects, openProjectById, searchUsers, sendShareInvite,
  } = useProjectStore();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ id: string; username: string; email: string }[]>([]);
  const [inviting, setInviting] = useState<string | null>(null);
  const [invited, setInvited] = useState<Set<string>>(new Set()); // userId → "invite sent"
  const [selectedPermission, setSelectedPermission] = useState<Permission>('edit');
  const [loadedMembers, setLoadedMembers] = useState(false);
  const [membersByProject, setMembersByProject] = useState<Record<string, { id: string; username: string; role: string }[]>>({});
  const [inviteError, setInviteError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presetRoleSet = new Set(PRESET_ROLES.map((role) => role.toLowerCase()));

  const linkedProjects = projects.filter((p) =>
    (projectResources[p.id] || []).some((r) => r.resource_type === 'mindmap' && r.resource_id === doc.id),
  );
  const isShared = linkedProjects.length > 0;
  const shareableProject = linkedProjects.find((project) => project.is_owner || !!project.my_is_page_admin || !!project.my_can_share) || null;
  const canShare = !isShared || !!shareableProject;
  const localizedPermissionOptions = PERMISSION_OPTIONS.map((option) => ({
    ...option,
    label: text(option.label),
    role: text(option.role),
    desc: text(option.desc),
  }));

  useEffect(() => {
    inputRef.current?.focus();
    for (const p of projects) {
      if (!projectResources[p.id]) fetchProjectResources(p.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (linkedProjects.length === 0) { setLoadedMembers(true); return; }
    (async () => {
      const map: typeof membersByProject = {};
      for (const p of linkedProjects) {
        await openProjectById(p.id);
        const detail = useProjectStore.getState().openProject;
        if (detail?.id === p.id) {
          map[p.id] = detail.members.map((m) => ({ id: m.user_id, username: m.username, role: m.role }));
        }
      }
      setMembersByProject(map);
      setLoadedMembers(true);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedProjects.length]);

  const handleSearch = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => setResults(await searchUsers(val)), 300);
  };

  const handleInvite = async (targetUserId: string) => {
    setInviting(targetUserId);
    setInviteError(null);
    try {
      if (!canShare) throw new Error(text('Only the owner or page admins with share rights can invite collaborators.'));
      const perm = localizedPermissionOptions.find((o) => o.value === selectedPermission)!;
      const existingProjectId = shareableProject?.id;
      const result = await sendShareInvite(
        targetUserId,
        doc.id,
        'mindmap',
        doc.title,
        perm.value,
        perm.role,
        existingProjectId,
      );
      if (!result) throw new Error(text('Failed to send invite. Check that the backend is up to date.'));
      setInvited((prev) => new Set([...prev, targetUserId]));
      await fetchProjects();
    } catch (e: any) {
      setInviteError(e.message || text('Something went wrong. Please try again.'));
    } finally {
      setInviting(null);
    }
  };

  const uniqueMembers = Array.from(
    new Map(Object.values(membersByProject).flat().map((m) => [m.id, m])).values(),
  );
  const describeRole = (role: string) => (presetRoleSet.has(role.toLowerCase()) ? text(role) : role);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-[480px] max-w-full mx-4 border border-gray-100 dark:border-gray-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Share2 size={16} className="text-blue-500" />
            <div>
              <h3 className="font-bold text-gray-800 dark:text-white text-sm">{text('Share "{{title}}"', { title: doc.title })}</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {isShared ? text('This is a shared project') : text('Local — invite someone to make it a shared project')}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        {inviteError && (
          <div className="flex items-center gap-2 px-5 py-2.5 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs border-b border-red-100 dark:border-red-800">
            <X size={13} className="shrink-0" />
            {inviteError}
          </div>
        )}

        <div className="p-5 space-y-5">
          {/* Permission picker */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{text('Access level')}</p>
            <div className="grid grid-cols-3 gap-2">
              {localizedPermissionOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSelectedPermission(opt.value)}
                  className={`flex flex-col gap-0.5 px-3 py-2.5 rounded-xl border text-left transition-all ${
                    selectedPermission === opt.value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                  }`}
                >
                  <span className="text-xs font-semibold">{opt.label}</span>
                  <span className="text-[10px] opacity-70 leading-tight">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Invite search */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{text('Invite collaborator')}</p>
            {!canShare && (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                {text('Only the project owner or page admins with share rights can invite more collaborators.')}
              </div>
            )}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder={text('Search users on the platform…')}
                disabled={!canShare}
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            {!isShared && query.length === 0 && (
              <p className="mt-2 text-xs text-gray-400 flex items-center gap-1.5">
                <UserPlus size={11} className="text-blue-400" />
                {text('Inviting someone will automatically turn this into a shared project.')}
              </p>
            )}
            {results.length > 0 && (
              <div className="mt-2 border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden shadow-sm divide-y divide-gray-100 dark:divide-gray-700">
                {results.map((u) => {
                  const alreadyMember = uniqueMembers.some((m) => m.id === u.id);
                  const wasInvited = invited.has(u.id);
                  return (
                    <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {u.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{u.username}</p>
                        <p className="text-xs text-gray-400 truncate">{u.email}</p>
                      </div>
                      {alreadyMember || wasInvited ? (
                        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                          <UserCheck size={13} /> {alreadyMember ? text('Member') : text('Invite sent')}
                        </span>
                      ) : (
                        <button
                          onClick={() => handleInvite(u.id)}
                          disabled={!!inviting || !canShare}
                          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors shrink-0"
                        >
                          {inviting === u.id
                            ? <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                            : <Send size={12} />}
                          {text('Send Invite')}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {query.length >= 2 && results.length === 0 && (
              <p className="mt-2 text-xs text-gray-400 text-center py-2">{text('No users found for "{{query}}"', { query })}</p>
            )}
          </div>

          {/* Collaborators list */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{text('People with access')}</p>
            {!loadedMembers ? (
              <div className="flex items-center gap-2 py-3 justify-center text-xs text-gray-400">
                <span className="animate-spin w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full" /> {text('Loading...')}
              </div>
            ) : uniqueMembers.length === 0 ? (
              <p className="text-xs text-gray-400 py-2 text-center">{text('Only you — invite someone above')}</p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {uniqueMembers.map((m) => (
                  <div key={m.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/40">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-[11px] font-bold shrink-0">
                      {m.username.charAt(0).toUpperCase()}
                    </div>
                    <p className="flex-1 text-sm text-gray-800 dark:text-white truncate">{m.username}</p>
                    <span className="text-[11px] text-gray-400 shrink-0">{describeRole(m.role)}</span>
                    <Check size={12} className="text-green-500 shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Project badge */}
          {isShared && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
              <Users size={14} className="text-blue-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">{text('Shared Project')}</p>
                <p className="text-[11px] text-blue-500 truncate">{linkedProjects.map((p) => p.name).join(', ')}</p>
              </div>
              <span className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded-full font-medium">
                {text('{{count}} member{{suffix}}', { count: String(uniqueMembers.length), suffix: uniqueMembers.length !== 1 ? 's' : '' })}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
