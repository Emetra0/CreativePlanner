import { useEffect, useRef, useState } from 'react';
import { Check, Search, Share2, UserCheck, UserPlus, Users, X } from 'lucide-react';
import { useAppTranslation } from '@/lib/appTranslations';
import { PRESET_ROLES, useProjectStore } from '@/store/useProjectStore';
import type { OfficeDocument } from '@/store/useOfficeDocumentStore';

type Permission = 'edit' | 'view' | 'request_edit';

const PERMISSION_OPTIONS: { value: Permission; label: string; role: string; desc: string }[] = [
  { value: 'edit', label: 'Edit & Read', role: 'Editor', desc: 'Can view and make changes' },
  { value: 'view', label: 'Read Only', role: 'Viewer', desc: 'Can view but not edit' },
  { value: 'request_edit', label: 'Suggest Edits', role: 'Contributor', desc: 'Can propose changes for review' },
];

interface OfficeShareModalProps {
  doc: OfficeDocument;
  onClose: () => void;
}

export default function OfficeShareModal({ doc, onClose }: OfficeShareModalProps) {
  const { text } = useAppTranslation();
  const {
    projects, projectResources, fetchProjectResources,
    fetchProjects, openProjectById, searchUsers, sendShareInvite,
  } = useProjectStore();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ id: string; username: string; email: string }[]>([]);
  const [inviting, setInviting] = useState<string | null>(null);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [selectedPermission, setSelectedPermission] = useState<Permission>('edit');
  const [loadedMembers, setLoadedMembers] = useState(false);
  const [membersByProject, setMembersByProject] = useState<Record<string, { id: string; username: string; role: string }[]>>({});
  const [inviteError, setInviteError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presetRoleSet = new Set(PRESET_ROLES.map((role) => role.toLowerCase()));

  const linkedProjects = projects.filter((project) =>
    (projectResources[project.id] || []).some((resource) => resource.resource_type === 'document' && resource.resource_id === doc.id),
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
    for (const project of projects) {
      if (!projectResources[project.id]) fetchProjectResources(project.id);
    }
  }, [fetchProjectResources, projectResources, projects]);

  useEffect(() => {
    if (linkedProjects.length === 0) { setLoadedMembers(true); return; }
    (async () => {
      const map: typeof membersByProject = {};
      for (const project of linkedProjects) {
        await openProjectById(project.id);
        const detail = useProjectStore.getState().openProject;
        if (detail?.id === project.id) {
          map[project.id] = detail.members.map((member) => ({ id: member.user_id, username: member.username, role: member.role }));
        }
      }
      setMembersByProject(map);
      setLoadedMembers(true);
    })();
  }, [linkedProjects, membersByProject, openProjectById]);

  const handleSearch = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => setResults(await searchUsers(value)), 300);
  };

  const handleInvite = async (targetUserId: string) => {
    setInviting(targetUserId);
    setInviteError(null);
    try {
      if (!canShare) throw new Error(text('Only the owner or page admins with share rights can invite collaborators.'));
      const permission = localizedPermissionOptions.find((option) => option.value === selectedPermission);
      if (!permission) throw new Error(text('Select an access level before sending the invite.'));

      const result = await sendShareInvite(
        targetUserId,
        doc.id,
        'document',
        doc.title,
        permission.value,
        permission.role,
        shareableProject?.id,
      );
      if (!result) throw new Error(text('Failed to send invite. Check that the backend is up to date.'));
      setInvited((previous) => new Set([...previous, targetUserId]));
      await fetchProjects();
    } catch (error: any) {
      setInviteError(error.message || text('Something went wrong. Please try again.'));
    } finally {
      setInviting(null);
    }
  };

  const uniqueMembers = Array.from(new Map(Object.values(membersByProject).flat().map((member) => [member.id, member])).values());
  const describeRole = (role: string) => (presetRoleSet.has(role.toLowerCase()) ? text(role) : role);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-[480px] max-w-full mx-4 border border-gray-100 dark:border-gray-700 overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Share2 size={16} className="text-blue-500" />
            <div>
              <h3 className="font-bold text-gray-800 dark:text-white text-sm">{text('Share "{{title}}"', { title: doc.title })}</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {isShared ? text('This is a shared project resource') : text('Local for now — invite someone to turn it into a shared project resource')}
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
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{text('Access level')}</p>
            <div className="grid grid-cols-3 gap-2">
              {localizedPermissionOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSelectedPermission(option.value)}
                  className={`flex flex-col gap-0.5 px-3 py-2.5 rounded-xl border text-left transition-all ${
                    selectedPermission === option.value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                  }`}
                >
                  <span className="text-xs font-semibold">{option.label}</span>
                  <span className="text-[10px] opacity-70 leading-tight">{option.desc}</span>
                </button>
              ))}
            </div>
          </div>

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
                onChange={(event) => handleSearch(event.target.value)}
                placeholder={text('Search users on the platform…')}
                disabled={!canShare}
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>

            {results.length > 0 && (
              <div className="mt-3 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-900/50">
                {results.map((user) => {
                  const alreadyMember = uniqueMembers.some((member) => member.id === user.id);
                  const wasInvited = invited.has(user.id);

                  return (
                    <div key={user.id} className="px-4 py-3 flex items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{user.username}</p>
                        <p className="text-xs text-gray-400 truncate">{user.email}</p>
                      </div>
                      {alreadyMember ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                          <UserCheck size={12} /> {text('Already in project')}
                        </span>
                      ) : wasInvited ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                          <Check size={12} /> {text('Invite sent')}
                        </span>
                      ) : (
                        <button
                          onClick={() => handleInvite(user.id)}
                          disabled={inviting === user.id || !canShare}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-xs font-medium transition-colors"
                        >
                          <UserPlus size={12} /> {inviting === user.id ? text('Sending...') : text('Invite')}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{text('Collaborators')}</p>
            <div className="rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-900/50">
              {!loadedMembers ? (
                <div className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">{text('Loading collaborators...')}</div>
              ) : uniqueMembers.length === 0 ? (
                <div className="px-4 py-5 text-sm text-gray-500 dark:text-gray-400 text-center">
                  <Users size={18} className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                  {text('No collaborators yet')}
                </div>
              ) : (
                uniqueMembers.map((member) => (
                  <div key={member.id} className="px-4 py-3 flex items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{member.username}</p>
                      <p className="text-xs text-gray-400 truncate">{describeRole(member.role)}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      <UserCheck size={12} /> {text('Has access')}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}