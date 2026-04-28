/**
 * StatusDot — small coloured circle indicating a user's online presence.
 * Pass `size` for diameter (default 8px / w-2 h-2).
 */

export type PresenceStatus = 'online' | 'idle' | 'busy' | 'offline';

const STATUS_COLOR: Record<PresenceStatus, string> = {
  online:  'bg-green-500',
  idle:    'bg-yellow-400',
  busy:    'bg-red-500',
  offline: 'bg-gray-400 dark:bg-gray-600',
};

const STATUS_LABEL: Record<PresenceStatus, string> = {
  online:  'Online',
  idle:    'Idle',
  busy:    'Do Not Disturb',
  offline: 'Offline',
};

interface StatusDotProps {
  status?: PresenceStatus | string | null;
  /** Tailwind size classes, e.g. "w-2 h-2" (default) or "w-3 h-3" */
  sizeClass?: string;
  className?: string;
  /** Show a ring to make it pop against avatars (default true) */
  ring?: boolean;
}

export function StatusDot({ status = 'offline', sizeClass = 'w-2 h-2', className = '', ring = true }: StatusDotProps) {
  const s = (status as PresenceStatus) in STATUS_COLOR ? (status as PresenceStatus) : 'offline';
  return (
    <span
      className={`inline-block rounded-full shrink-0 ${STATUS_COLOR[s]} ${sizeClass} ${ring ? 'ring-2 ring-white dark:ring-gray-800' : ''} ${className}`}
      title={STATUS_LABEL[s]}
    />
  );
}
