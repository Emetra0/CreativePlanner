import { Users } from 'lucide-react';
import { StatusDot } from './StatusDot';
import { useMindmapCollabStore, type MindmapCollaborator } from '@/store/useMindmapCollabStore';

function initialsFromName(username?: string | null, email?: string | null) {
  const source = (username || email || '?').trim();
  if (!source) return '?';
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function avatarColor(seed: string) {
  const palette = ['bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-lime-600', 'bg-teal-500', 'bg-cyan-600', 'bg-blue-600', 'bg-violet-600', 'bg-purple-600', 'bg-pink-600'];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

export function MindmapCollaboratorAvatar({
  participant,
  sizeClass = 'w-7 h-7',
  textClass = 'text-[10px]',
  showPresence = true,
}: {
  participant: MindmapCollaborator;
  sizeClass?: string;
  textClass?: string;
  showPresence?: boolean;
}) {
  const label = participant.username || participant.email || 'Collaborator';

  return (
    <div className={`relative rounded-full shrink-0 overflow-hidden ring-2 ring-white dark:ring-gray-800 ${sizeClass} ${participant.avatarUrl ? '' : avatarColor(participant.userId)}`} title={label}>
      {participant.avatarUrl ? (
        <img src={participant.avatarUrl} alt={label} className="w-full h-full object-cover" />
      ) : (
        <div className={`w-full h-full flex items-center justify-center text-white font-bold ${textClass}`}>
          {label ? initialsFromName(participant.username, participant.email) : <Users size={12} />}
        </div>
      )}
      {showPresence ? <StatusDot status={participant.presence || 'online'} sizeClass="w-2.5 h-2.5" className="absolute -bottom-0.5 -right-0.5" /> : null}
    </div>
  );
}

export default function MindmapNodePresence({ nodeId, className = '' }: { nodeId: string; className?: string }) {
  const editingUsers = useMindmapCollabStore((state) => state.participants.filter((participant) => participant.editingNodeIds.includes(nodeId)).slice(0, 4));

  if (!editingUsers.length) return null;

  const overflow = editingUsers.length > 3 ? editingUsers.length - 3 : 0;
  const visibleUsers = overflow > 0 ? editingUsers.slice(0, 3) : editingUsers;

  return (
    <div className={`pointer-events-none absolute z-30 flex items-center ${className}`}>
      <div className="flex -space-x-2 rounded-full bg-white/85 dark:bg-gray-900/80 px-1 py-1 shadow-lg backdrop-blur-sm border border-white/70 dark:border-gray-700/80">
        {visibleUsers.map((participant) => (
          <MindmapCollaboratorAvatar key={`${nodeId}-${participant.userId}`} participant={participant} sizeClass="w-6 h-6" textClass="text-[9px]" showPresence={false} />
        ))}
        {overflow > 0 ? (
          <span className="w-6 h-6 rounded-full bg-gray-800 text-white text-[9px] font-semibold flex items-center justify-center ring-2 ring-white dark:ring-gray-800">
            +{overflow}
          </span>
        ) : null}
      </div>
    </div>
  );
}
