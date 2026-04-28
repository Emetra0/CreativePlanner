'use client';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore, ChatMessage, ChatChannel, RawReaction } from '@/store/useChatStore';
import { useProjectStore } from '@/store/useProjectStore';
import { useMindmapStore } from '@/store/useMindmapStore';
import { useFriendStore, Friend } from '@/store/useFriendStore';
import { getWorkerUrl } from '@/lib/cloudSync';
import {
  Send, Globe, Briefcase, MessageCircle, Plus, Search,
  Trash2, Lightbulb, Link2, X, Users, Paperclip,
  Share2, Image as ImageIcon, CheckCircle, XCircle, FileText, Download,
  Smile, Newspaper, ChevronRight, ChevronLeft, ZoomIn, Sparkles, Wrench, Bug,
  UserPlus, UserCheck, MoreVertical, Edit2, EyeOff, LogOut, Camera, Crown,
} from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { useAppDialogs } from '@/components/AppDialogs';
import { Modal, ConfirmModal } from '@/components/Modal';
import { StatusDot } from '@/components/StatusDot';
import { translateAppText, useAppTranslation } from '@/lib/appTranslations';

//  Constants 
const EMOJI_PRESETS = ['👍','👎','❤️','😂','😮','😢','😡','🎉','🔥','👀','✅','🤔','💯','🙏'];
const AVATAR_COLORS = [
  'bg-purple-500','bg-blue-500','bg-green-500','bg-orange-500',
  'bg-pink-500','bg-indigo-500','bg-teal-500','bg-red-500',
  'bg-cyan-500','bg-violet-500','bg-amber-500','bg-emerald-500',
];
const INFO_CHANNEL_ID = 'channel-info-updates';

//  Changelog 
const CHANGELOG = [
  {
    version: '2.6.0', date: 'March 6, 2026', badge: 'Latest',
    sections: [
      { icon: <Sparkles size={14} className="text-yellow-500" />, label: 'New', items: [
        'Discord-style chat layout — avatars on the left, messages inline',
        'Emoji reactions on any message or image',
        'Image lightbox — click any image to enlarge, download, or browse',
        'Group chats — create a group and invite multiple members',
        'What\'s New channel — this panel you are reading right now',
        'Usernames auto-sync across all chat history when you rename',
      ]},
      { icon: <Wrench size={14} className="text-blue-500" />, label: 'Improved', items: [
        'Consecutive messages from the same sender are compacted (no avatar repeat)',
        'Sidebar now groups: Info · Global · Groups · Direct Messages',
        'Polling also refreshes reactions on each cycle',
      ]},
    ],
  },
  {
    version: '2.5.0', date: 'February 2026', badge: null,
    sections: [
      { icon: <Sparkles size={14} className="text-yellow-500" />, label: 'New', items: [
        'File and image attachments in chat (up to 400 KB)',
        'Mindmap sharing — send a clickable mindmap card',
        'Share invites with Accept / Reject card UI',
        'Project channels auto-created on project creation',
      ]},
      { icon: <Bug size={14} className="text-red-500" />, label: 'Fixed', items: [
        'Messages sometimes appeared out of order after polling',
        'DM channel not showing after creation without a page reload',
      ]},
    ],
  },
  {
    version: '2.4.0', date: 'January 2026', badge: null,
    sections: [
      { icon: <Sparkles size={14} className="text-yellow-500" />, label: 'New', items: [
        'Direct Messages — chat privately with any user',
        'Global channel open to everyone on the platform',
        'Soft delete for own messages',
        'Pagination with load-older support',
      ]},
    ],
  },
];

//  Helpers 
function formatMessageTime(ts: number) {
  const language = document.documentElement.lang || 'en';
  const d = new Date(ts);
  const time = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(d);
  if (isToday(d)) return translateAppText(language, 'Today at {{time}}', { time });
  if (isYesterday(d)) return translateAppText(language, 'Yesterday at {{time}}', { time });
  return new Intl.DateTimeFormat(language, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
}

function groupMessagesByDate(messages: ChatMessage[]) {
  const language = document.documentElement.lang || 'en';
  const groups: { date: string; messages: ChatMessage[] }[] = [];
  let currentDate = '';
  for (const msg of messages) {
    const d = new Date(msg.sent_at);
    const label = isToday(d)
      ? translateAppText(language, 'Today')
      : isYesterday(d)
        ? translateAppText(language, 'Yesterday')
        : new Intl.DateTimeFormat(language, { month: 'long', day: 'numeric', year: 'numeric' }).format(d);
    if (label !== currentDate) { groups.push({ date: label, messages: [] }); currentDate = label; }
    groups[groups.length - 1].messages.push(msg);
  }
  return groups;
}

function getAvatarColor(userId: string) {
  let h = 0;
  for (const c of userId) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// AvatarEl — shows photo if available, else coloured initial
function AvatarEl({
  avatarUrl, userId, displayName,
  sizeClass = 'w-9 h-9', textClass = 'text-sm',
}: {
  avatarUrl?: string | null; userId: string; displayName: string;
  sizeClass?: string; textClass?: string;
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={displayName}
        className={`${sizeClass} rounded-full object-cover shrink-0`}
      />
    );
  }
  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center text-white font-bold ${textClass} ${getAvatarColor(userId)} shrink-0`}>
      {displayName?.[0]?.toUpperCase() || '?'}
    </div>
  );
}

function buildGroupedReactions(raw: RawReaction[], messageId: string, currentUserId: string) {
  const map = new Map<string, { emoji: string; count: number; usernames: string[]; hasReacted: boolean }>();
  for (const r of raw) {
    if (r.message_id !== messageId) continue;
    if (!map.has(r.emoji)) map.set(r.emoji, { emoji: r.emoji, count: 0, usernames: [], hasReacted: false });
    const e = map.get(r.emoji)!;
    e.count++;
    e.usernames.push(r.username);
    if (r.user_id === currentUserId) e.hasReacted = true;
  }
  return [...map.values()];
}

//  ChannelIcon 
function ChannelIcon({ channel }: { channel: ChatChannel }) {
  if (channel.id === INFO_CHANNEL_ID) return <Newspaper size={14} className="text-yellow-500 shrink-0" />;
  if (channel.type === 'global')  return <Globe   size={14} className="text-green-500 shrink-0" />;
  if (channel.type === 'project') return <Briefcase size={14} className="text-blue-500 shrink-0" />;
  if (channel.type === 'group')   return <Users   size={14} className="text-indigo-500 shrink-0" />;
  return <MessageCircle size={14} className="text-purple-500 shrink-0" />;
}

//  ImageLightbox 
interface LightboxImage { src: string; name: string; size: number; }

function ImageLightbox({
  images, startIndex, onClose,
}: {
  images: LightboxImage[]; startIndex: number; onClose: () => void;
}) {
  const { text } = useAppTranslation();
  const [idx, setIdx] = useState(startIndex);
  const img = images[idx];
  const hasPrev = idx > 0;
  const hasNext = idx < images.length - 1;

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) setIdx((i) => i - 1);
      if (e.key === 'ArrowRight' && hasNext) setIdx((i) => i + 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hasPrev, hasNext, onClose]);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = img.src;
    a.download = img.name || 'image';
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm"
      onClick={onClose}>
      {/* Panel — stop propagation so clicking the image itself doesn't close */}
      <div className="relative flex flex-col items-center max-w-[92vw] max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}>

        {/* Top bar */}
        <div className="absolute -top-12 left-0 right-0 flex items-center justify-between text-white px-1">
          <span className="text-sm font-medium truncate max-w-[60%] opacity-80">{img.name || text('Image')}</span>
          <div className="flex items-center gap-2">
            {images.length > 1 && (
              <span className="text-xs opacity-60">{idx + 1} / {images.length}</span>
            )}
            <button onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors border border-white/20">
              <Download size={13} /> {text('Download')}
            </button>
            <button onClick={onClose}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors border border-white/20">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Image */}
        <img
          src={img.src}
          alt={img.name || 'image'}
          className="max-w-[88vw] max-h-[80vh] rounded-xl object-contain shadow-2xl border border-white/10"
        />

        {/* File size */}
        {img.size > 0 && (
          <p className="mt-3 text-xs text-white/40">{(img.size / 1024).toFixed(0)} KB</p>
        )}

        {/* Prev / Next */}
        {hasPrev && (
          <button onClick={() => setIdx((i) => i - 1)}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-14 p-3 rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors border border-white/20">
            <ChevronLeft size={22} />
          </button>
        )}
        {hasNext && (
          <button onClick={() => setIdx((i) => i + 1)}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-14 p-3 rounded-full bg-white/10 hover:bg-white/25 text-white transition-colors border border-white/20">
            <ChevronRight size={22} />
          </button>
        )}

        {/* Thumbnail strip */}
        {images.length > 1 && (
          <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 flex gap-2">
            {images.map((im, i) => (
              <button key={i} onClick={() => setIdx(i)}
                className={`w-10 h-10 rounded-lg overflow-hidden border-2 transition-all ${i === idx ? 'border-white scale-110' : 'border-white/30 opacity-60 hover:opacity-100'}`}>
                <img src={im.src} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

//  EmojiPicker 
function EmojiPicker({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  return (
    <div ref={ref} className="absolute z-50 bottom-full mb-1 left-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-2 grid grid-cols-7 gap-1">
      {EMOJI_PRESETS.map((e) => (
        <button key={e} onClick={() => { onPick(e); onClose(); }}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-lg transition-colors">
          {e}
        </button>
      ))}
    </div>
  );
}

//  ChannelItem 
function ChannelItem({
  ch, isActive, onSelect, onHide, onDelete, onLeave, currentUserId,
}: {
  ch: ChatChannel;
  isActive: boolean;
  onSelect: (id: string) => void;
  onHide?: (ch: ChatChannel) => void;
  onDelete?: (ch: ChatChannel) => void;
  onLeave?: (ch: ChatChannel) => void;
  currentUserId?: string;
}) {
  const { text } = useAppTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const isOwner = ch.type === 'group' && ch.owner_id === currentUserId;

  return (
    <div
      className="relative"
      onContextMenu={(e) => {
        if (ch.type === 'dm' || ch.type === 'group') {
          e.preventDefault();
          setMenuOpen(true);
        }
      }}
    >
      <button
        onClick={() => onSelect(ch.id)}
        className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors mb-0.5
          ${isActive ? 'bg-indigo-100 dark:bg-indigo-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-700/40'}`}>
        {/* Avatar or icon */}
        {ch.type === 'dm' && ch.other_user_id ? (
          <div className="relative shrink-0">
            <AvatarEl avatarUrl={ch.other_avatar_url} userId={ch.other_user_id} displayName={ch.other_username || ch.channel_label} sizeClass="w-6 h-6" textClass="text-[10px]" />
            <StatusDot status={ch.other_presence} sizeClass="w-2 h-2" className="absolute -bottom-0.5 -right-0.5" />
          </div>
        ) : ch.type === 'group' && ch.avatar_url ? (
          <img src={ch.avatar_url} alt={ch.channel_label} className="w-6 h-6 rounded-full object-cover shrink-0" />
        ) : (
          <ChannelIcon channel={ch} />
        )}
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-medium truncate ${isActive ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300'}`}>
            {ch.channel_label}
          </p>
          {ch.last_message && (
            <p className="text-[10px] text-gray-400 truncate">
              {ch.last_message.sender_username}: {ch.last_message.content || `📎 ${text('Attachment')}`}
            </p>
          )}
        </div>
      </button>

      {/* Context menu */}
      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute left-0 top-full mt-0.5 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-1 min-w-[160px]"
        >
          {ch.type === 'dm' && (
            <>
              <button
                onClick={() => { setMenuOpen(false); onHide?.(ch); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <EyeOff size={13} className="text-gray-400" /> {text('Hide DM')}
              </button>
              <button
                onClick={() => { setMenuOpen(false); onDelete?.(ch); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                <Trash2 size={13} /> {text('Delete DM')}
              </button>
            </>
          )}
          {ch.type === 'group' && isOwner && (
            <button
              onClick={() => { setMenuOpen(false); onDelete?.(ch); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
              <Trash2 size={13} /> {text('Delete Group')}
            </button>
          )}
          {ch.type === 'group' && !isOwner && (
            <button
              onClick={() => { setMenuOpen(false); onLeave?.(ch); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <LogOut size={13} className="text-gray-400" /> {text('Leave Group')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

//  InviteCard 
function InviteCard({ attachmentData, messageId, currentUserId, respondToInvite }: {
  attachmentData: any; messageId: string; currentUserId: string;
  respondToInvite: (inviteId: string, messageId: string, accept: boolean) => Promise<boolean>;
}) {
  const { text } = useAppTranslation();
  const [responding, setResponding] = useState(false);
  const status = attachmentData.status || 'pending';
  const isRecipient = attachmentData.toUserId === currentUserId;
  const go = async (accept: boolean) => { setResponding(true); await respondToInvite(attachmentData.inviteId, messageId, accept); setResponding(false); };
  return (
    <div className="mt-2 p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl max-w-xs">
      <div className="flex items-center gap-2 mb-1.5"><Share2 size={13} className="text-indigo-500" /><p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">{text('Shared Document')}</p></div>
      <p className="text-sm font-medium text-gray-800 dark:text-white mb-0.5 truncate">{attachmentData.resourceName}</p>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">{text(attachmentData.role)} · {text('from')} {attachmentData.fromUsername}</p>
      {status === 'pending' && isRecipient ? (
        <div className="flex gap-2">
          <button onClick={() => go(true)} disabled={responding} className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors">
            <CheckCircle size={12} /> {text('Accept')}
          </button>
          <button onClick={() => go(false)} disabled={responding} className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors">
            <XCircle size={12} /> {text('Reject')}
          </button>
        </div>
      ) : status === 'accepted' ? (
        <span className="flex items-center gap-1 text-xs text-green-600 font-medium"><CheckCircle size={12} /> {text('Accepted')}</span>
      ) : status === 'rejected' ? (
        <span className="flex items-center gap-1 text-xs text-red-500 font-medium"><XCircle size={12} /> {text('Rejected')}</span>
      ) : (
        <span className="text-xs text-gray-400">{text('Invite sent')}</span>
      )}
    </div>
  );
}

//  MessageRow (Discord-style) 
function MessageRow({
  msg, isConsecutive, onDelete, onEdit, currentUserId, resolvedUsernames,
  channelReactions, onAddReaction, onOpenImage, onOpenMindmap, respondToInvite,
  isEditing, editInput, onEditChange, onEditSubmit, onEditCancel,
}: {
  msg: ChatMessage; isConsecutive: boolean; onDelete: () => void;
  onEdit: () => void;
  currentUserId: string; resolvedUsernames: Record<string, string>;
  channelReactions: RawReaction[]; onAddReaction: (msgId: string, emoji: string) => void;
  onOpenImage: (src: string, name: string, size: number) => void;
  onOpenMindmap?: (id: string) => void;
  respondToInvite: (inviteId: string, messageId: string, accept: boolean) => Promise<boolean>;
  isEditing: boolean;
  editInput: string;
  onEditChange: (val: string) => void;
  onEditSubmit: () => void;
  onEditCancel: () => void;
}) {
  const { text } = useAppTranslation();
  const [showActions, setShowActions] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMsgMenu, setShowMsgMenu] = useState(false);
  const msgMenuRef = useRef<HTMLDivElement>(null);
  const isOwn = !!currentUserId && String(msg.sender_id) === String(currentUserId);
  const isSystem = !!msg.is_system;
  const displayName = resolvedUsernames[msg.sender_id] || msg.sender_username;
  const grouped = buildGroupedReactions(channelReactions, msg.id, currentUserId);

  useEffect(() => {
    if (!showMsgMenu) return;
    const close = (e: MouseEvent) => {
      if (msgMenuRef.current && !msgMenuRef.current.contains(e.target as Node)) setShowMsgMenu(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showMsgMenu]);

  let att: any = null;
  try { if (msg.attachment_data) att = JSON.parse(msg.attachment_data); } catch {}

  // System messages — shown as a centred italic line
  if (isSystem) {
    return (
      <div className="flex items-center gap-3 px-4 py-1 my-1">
        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
        <p className="text-[11px] italic text-gray-400 dark:text-gray-500 select-none">{msg.content}</p>
        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
      </div>
    );
  }

  return (
    <div
      className={`flex gap-3 px-4 py-0.5 hover:bg-gray-50 dark:hover:bg-white/[0.02] group relative ${isConsecutive ? 'mt-0' : 'mt-4'}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setShowEmojiPicker(false); }}
    >
      {/* Avatar column */}
      <div className="w-10 shrink-0 pt-0.5">
        {!isConsecutive ? (
          <AvatarEl
            avatarUrl={msg.sender_avatar_url}
            userId={msg.sender_id}
            displayName={displayName}
            sizeClass="w-9 h-9"
            textClass="text-sm"
          />
        ) : (
          <span className="w-9 h-5 flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-[9px] text-gray-400 pr-1">{format(new Date(msg.sent_at), 'HH:mm')}</span>
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {!isConsecutive && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className={`text-sm font-semibold ${isOwn ? 'text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-gray-100'}`}>
              {isOwn ? text('You') : displayName}
            </span>
            <span className="text-[11px] text-gray-400">{formatMessageTime(msg.sent_at)}</span>
            {msg.edited_at && <span className="text-[10px] text-gray-400 italic">{text('(edited)')}</span>}
          </div>
        )}

        {/* Inline edit */}
        {isEditing ? (
          <div className="space-y-1">
            <textarea
              value={editInput}
              onChange={(e) => onEditChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEditSubmit(); }
                if (e.key === 'Escape') onEditCancel();
              }}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-indigo-400 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              autoFocus
            />
            <div className="flex gap-2 text-[11px]">
              <button onClick={onEditSubmit} className="px-2 py-0.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">{text('Save')}</button>
              <button onClick={onEditCancel} className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600">{text('Cancel')}</button>
              <span className="text-gray-400 self-center">{text('Enter to save · Esc to cancel')}</span>
            </div>
          </div>
        ) : (
          msg.content && (
            <p className="text-sm text-gray-800 dark:text-gray-100 leading-relaxed break-words whitespace-pre-wrap">
              {msg.content}
            </p>
          )
        )}

        {/* Image attachment */}
        {msg.attachment_type === 'image' && att?.data && (
          <div className="mt-1.5 inline-block rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 cursor-zoom-in group/img relative"
            onClick={() => onOpenImage(att.data, att.name || 'image', att.size || 0)}>
            <img src={att.data} alt={att.name || 'image'}
              className="max-w-xs max-h-64 object-cover block hover:brightness-90 transition-all" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/img:bg-black/20 transition-all">
              <ZoomIn size={22} className="text-white opacity-0 group-hover/img:opacity-100 transition-opacity drop-shadow" />
            </div>
            {att.name && (
              <div className="px-2 py-1 bg-gray-50 dark:bg-gray-900 text-[10px] text-gray-400 truncate">
                {att.name} · {(att.size / 1024).toFixed(0)} KB
              </div>
            )}
          </div>
        )}

        {/* File attachment */}
        {msg.attachment_type === 'file' && att?.data && (
          <a href={att.data} download={att.name}
            className="mt-1.5 inline-flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
            <FileText size={14} className="text-gray-500 shrink-0" />
            <div><p className="text-xs font-medium text-gray-800 dark:text-white">{att.name}</p><p className="text-[10px] text-gray-400">{(att.size / 1024).toFixed(0)} KB</p></div>
            <Download size={13} className="text-gray-400 ml-2 shrink-0" />
          </a>
        )}

        {/* Mindmap attachment */}
        {msg.attachment_type === 'mindmap' && att && (
          <div onClick={() => onOpenMindmap?.(msg.attachment_id || '')}
            className="mt-1.5 inline-flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors max-w-xs">
            <Lightbulb size={14} className="text-amber-500 shrink-0" />
            <div><p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{text('Mindmap')}</p><p className="text-xs text-amber-600 dark:text-amber-400 truncate">{att.title}</p></div>
            <Link2 size={12} className="text-amber-400 ml-auto" />
          </div>
        )}

        {/* Share invite */}
        {msg.attachment_type === 'share_invite' && att && (
          <InviteCard attachmentData={att} messageId={msg.id} currentUserId={currentUserId} respondToInvite={respondToInvite} />
        )}

        {/* Reactions — shown below text (always visible if present, also can add on hover) */}
        <div className={`flex flex-wrap gap-1 mt-1.5 ${grouped.length === 0 ? 'hidden group-hover:flex min-h-0' : ''}`}>
          {grouped.map((r) => (
            <button key={r.emoji} onClick={() => onAddReaction(msg.id, r.emoji)} title={r.usernames.join(', ')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors
                ${r.hasReacted
                  ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300'
                  : 'bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
              {r.emoji} <span className="font-medium">{r.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Hover action bar — right side, same row level */}
      {showActions && !isEditing && (
        <div className="absolute right-4 top-0 flex items-center gap-0.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-md px-1 py-0.5 z-50">
          {/* Emoji react */}
          <div className="relative">
            <button onClick={() => setShowEmojiPicker((v) => !v)}
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title={text('React')}>
              <Smile size={14} />
            </button>
            {showEmojiPicker && <EmojiPicker onPick={(e) => onAddReaction(msg.id, e)} onClose={() => setShowEmojiPicker(false)} />}
          </div>
          {/* 3-dot menu for own messages */}
          {isOwn && (
            <div className="relative" ref={msgMenuRef}>
              <button onClick={() => setShowMsgMenu((v) => !v)}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title={text('More')}>
                <MoreVertical size={14} />
              </button>
              {showMsgMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-1 min-w-[130px] z-20">
                  <button
                    onClick={() => { setShowMsgMenu(false); onEdit(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    <Edit2 size={12} /> {text('Edit message')}
                  </button>
                  <button
                    onClick={() => { setShowMsgMenu(false); onDelete(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                    <Trash2 size={12} /> {text('Delete message')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

//  UpdatesView 
function UpdatesView() {
  const { text } = useAppTranslation();
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
            <Newspaper size={20} className="text-yellow-600 dark:text-yellow-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-800 dark:text-white">{text("What's New")}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{text('Platform updates, new features, and fixes')}</p>
          </div>
        </div>
        <div className="space-y-5">
          {CHANGELOG.map((r) => (
            <div key={r.version} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-800 dark:text-white">v{r.version}</span>
                  {r.badge && <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-semibold rounded-full">{text(r.badge)}</span>}
                </div>
                <span className="text-xs text-gray-400">{r.date}</span>
              </div>
              <div className="px-5 py-4 space-y-4">
                {r.sections.map((sec) => (
                  <div key={sec.label}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-base">{sec.icon}</span>
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{text(sec.label)}</span>
                    </div>
                    <ul className="space-y-1.5">
                      {sec.items.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                          <ChevronRight size={14} className="mt-0.5 shrink-0 text-gray-400" />
                          {text(item)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type UserResult = { id: string; username: string; discriminator?: string };

//  GroupModal 
function GroupModal({
  onClose, onCreate, friends,
}: {
  onClose: () => void;
  onCreate: (name: string, ids: string[], groupType: string) => void;
  friends: Friend[];
}) {
  const { text } = useAppTranslation();
  const [groupName, setGroupName] = useState('');
  const [groupType, setGroupType] = useState<'private' | 'public'>('private');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [selected, setSelected] = useState<UserResult[]>([]);
  const [creating, setCreating] = useState(false);

  const handleSearch = async (q: string) => {
    setQuery(q);
    if (q.length < 2) { setResults([]); return; }
    const r = await useProjectStore.getState().searchUsers(q);
    setResults(r);
  };
  const toggle = (u: UserResult) =>
    setSelected((s) => s.some((x) => x.id === u.id) ? s.filter((x) => x.id !== u.id) : [...s, u]);

  const handleCreate = async () => {
    if (!groupName.trim() || creating) return;
    setCreating(true);
    await onCreate(groupName.trim(), selected.map((u) => u.id), groupType);
    setCreating(false);
    onClose();
  };

  const friendSuggestions = query.length < 2
    ? friends.filter((f) => !selected.some((s) => s.id === f.friend_id))
    : [];

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={text('New Group')}
      icon={<Users size={18} className="text-indigo-500" />}
      widthClassName="w-[26rem]"
    >
      <div className="space-y-4">
          <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder={text('Group name…')}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          {/* Group type toggle */}
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-1.5">{text('Group Type')}</p>
            <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600">
              <button
                onClick={() => setGroupType('private')}
                className={`flex-1 py-1.5 text-xs font-semibold transition-colors ${
                  groupType === 'private'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}>
                {text('Private')}
              </button>
              <button
                onClick={() => setGroupType('public')}
                className={`flex-1 py-1.5 text-xs font-semibold transition-colors ${
                  groupType === 'public'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}>
                {text('Public')}
              </button>
            </div>
            {groupType === 'public' && (
              <p className="text-[10px] text-gray-400 mt-1">
                <Crown size={9} className="inline mr-0.5 text-yellow-500" />
                {text('You will be the owner with admin controls.')}
              </p>
            )}
          </div>
          <input value={query} onChange={(e) => handleSearch(e.target.value)} placeholder={text('Search any user by username… (or username#tag)')}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          {/* Friends quick-add */}
          {friendSuggestions.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-1">{text('Your Friends')}</p>
              <div className="border border-green-200 dark:border-green-800 rounded-lg overflow-hidden max-h-36 overflow-y-auto">
                {friendSuggestions.map((f) => (
                  <button key={f.friend_id}
                    onClick={() => toggle({ id: f.friend_id, username: f.friend_username, discriminator: f.friend_discriminator })}
                    className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors">
                    <AvatarEl avatarUrl={null} userId={f.friend_id} displayName={f.friend_username} sizeClass="w-6 h-6" textClass="text-xs" />
                    <span className="text-gray-700 dark:text-gray-300 flex-1 truncate">
                      {f.friend_username}<span className="text-gray-400 text-xs">#{f.friend_discriminator || '0000'}</span>
                    </span>
                    <UserCheck size={12} className="text-green-500 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Search results */}
          {results.length > 0 && (
            <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden max-h-36 overflow-y-auto">
              {results.map((u) => (
                <button key={u.id} onClick={() => toggle(u)}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${selected.some((s) => s.id === u.id) ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''}`}>
                  <AvatarEl avatarUrl={null} userId={u.id} displayName={u.username} sizeClass="w-6 h-6" textClass="text-xs" />
                  <span className="text-gray-700 dark:text-gray-300 flex-1 truncate">
                    {u.username}{u.discriminator && <span className="text-gray-400 text-xs">#{u.discriminator}</span>}
                  </span>
                  {selected.some((s) => s.id === u.id) && <CheckCircle size={13} className="text-indigo-500" />}
                </button>
              ))}
            </div>
          )}
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((u) => (
                <span key={u.id} className="flex items-center gap-1 px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-medium">
                  {u.username}
                  <button onClick={() => toggle(u)}><X size={10} /></button>
                </span>
              ))}
            </div>
          )}
          <button onClick={handleCreate} disabled={!groupName.trim() || creating}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
            {creating ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Users size={15} />}
            {text('Create Group')}
          </button>
      </div>
    </Modal>
  );
}

//  Main Page 
export default function ChatPage() {
  const dialogs = useAppDialogs();
  const { text } = useAppTranslation();
  const { user } = useAuthStore();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    channels, activeChannelId, messages, reactions, loadingChannels, loadingMessages,
    fetchChannels, setActiveChannel, fetchMessages, sendMessage, deleteMessage,
    fetchReactions, toggleReaction, createGroup, editMessage, hideChannel, deleteChannel,
    startPolling, stopPolling, resolveUsernames,
  } = useChatStore();
  const { friends, pendingRequests, fetchFriends, fetchRequests, respondToRequest, sendRequest, unfriend } = useFriendStore();
  const { fetchProjects, projects, projectResources, fetchProjectResources, sendShareInvite } = useProjectStore();
  const { documents, loadDocuments } = useMindmapStore();

  const [input, setInput] = useState('');
  const [showAttach, setShowAttach] = useState(false);
  const [fileSending, setFileSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [channelSearch, setChannelSearch] = useState('');
  const [showDmSearch, setShowDmSearch] = useState(false);
  const [dmSearchQuery, setDmSearchQuery] = useState('');
  const [dmCreating, setDmCreating] = useState(false);
  const [dmError, setDmError] = useState<string | null>(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [resolvedUsernames, setResolvedUsernames] = useState<Record<string, string>>({});
  const [lightboxImages, setLightboxImages] = useState<LightboxImage[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // Confirm delete channel modal
  const [confirmDeleteChannel, setConfirmDeleteChannel] = useState<ChatChannel | null>(null);
  // Inline message edit
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState('');

  // Sidebar view — 'channels' or 'friends'
  const [sidebarView, setSidebarView] = useState<'channels' | 'friends'>('channels');
  // Hidden DMs
  const [showHiddenDms, setShowHiddenDms] = useState(false);
  const [hiddenChannels, setHiddenChannels] = useState<ChatChannel[]>([]);
  const [loadingHidden, setLoadingHidden] = useState(false);
  // Friends panel - add by tag
  const [friendTagInput, setFriendTagInput] = useState('');
  const [friendAddMsg, setFriendAddMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [friendAdding, setFriendAdding] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Collect all image messages in active channel for browsing
  const channelImages = useMemo<LightboxImage[]>(() => {
    const msgs = (activeChannelId ? messages[activeChannelId] : []) || [];
    const imgs: LightboxImage[] = [];
    for (const m of msgs) {
      if (m.attachment_type === 'image' && m.attachment_data) {
        try {
          const d = JSON.parse(m.attachment_data);
          if (d?.data) imgs.push({ src: d.data, name: d.name || 'image', size: d.size || 0 });
        } catch {}
      }
    }
    return imgs;
  }, [messages, activeChannelId]);

  const openLightbox = useCallback((src: string, name: string, size: number) => {
    const idx = channelImages.findIndex((img) => img.src === src);
    setLightboxImages(channelImages);
    setLightboxIndex(idx >= 0 ? idx : 0);
  }, [channelImages]);

  // Fetch base data on mount
  useEffect(() => {
    fetchChannels();
    fetchProjects();
    loadDocuments();
    fetchFriends();
    fetchRequests();
    localStorage.setItem('hasVisitedChat', '1');
  }, []);

  useEffect(() => {
    if (projects.length === 0) return;
    for (const project of projects) {
      if (!projectResources[project.id]) fetchProjectResources(project.id);
    }
  }, [projects]);

  // Handle ?channel= query param
  useEffect(() => {
    const paramChannel = searchParams.get('channel');
    if (paramChannel && channels.some((c) => c.id === paramChannel)) {
      handleSelectChannel(paramChannel);
    } else if (channels.length > 0 && !activeChannelId) {
      handleSelectChannel(channels[0].id);
    }
  }, [channels]);

  // Polling
  useEffect(() => {
    if (activeChannelId && activeChannelId !== INFO_CHANNEL_ID) {
      startPolling(activeChannelId);
      return () => stopPolling();
    }
  }, [activeChannelId]);

  // Fetch reactions when channel or message count changes
  useEffect(() => {
    if (activeChannelId && activeChannelId !== INFO_CHANNEL_ID) {
      fetchReactions(activeChannelId);
    }
  }, [activeChannelId, (messages[activeChannelId || ''] || []).length]);

  // Resolve usernames whenever messages change
  useEffect(() => {
    if (!activeChannelId) return;
    const msgs = messages[activeChannelId] || [];
    const ids = [...new Set(msgs.map((m) => m.sender_id))];
    if (!ids.length) return;
    resolveUsernames(ids).then((map) => setResolvedUsernames((p) => ({ ...p, ...map })));
  }, [(messages[activeChannelId || ''] || []).length]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [(messages[activeChannelId || ''] || []).length]);

  const handleSelectChannel = useCallback((channelId: string) => {
    setActiveChannel(channelId);
    if (channelId !== INFO_CHANNEL_ID) fetchMessages(channelId);
    if (channelId !== INFO_CHANNEL_ID) inputRef.current?.focus();
  }, [messages]);

  const handleSend = async () => {
    if (!activeChannelId || !input.trim()) return;
    const content = input.trim();
    setInput('');
    await sendMessage(activeChannelId, content);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeChannelId) return;
    if (file.size > 400 * 1024) {
      await dialogs.alert({ title: text('File too large'), message: text('The maximum upload size is 400 KB.'), tone: 'warning' });
      return;
    }
    setFileSending(true);
    try {
      const dataURL = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      await sendMessage(activeChannelId, '', {
        type: file.type.startsWith('image/') ? 'image' : 'file',
        id: crypto.randomUUID(),
        data: { name: file.name, mime: file.type, size: file.size, data: dataURL },
      });
    } finally { setFileSending(false); }
  };

  const handleShareMindmap = async (doc: { id: string; title: string }) => {
    if (!activeChannelId) return;
    setShowAttach(false);

    if (activeChannel?.type === 'dm' && activeChannel.other_user_id) {
      const existingProjectId = projects.find((project) =>
        (projectResources[project.id] || []).some((resource) => resource.resource_type === 'mindmap' && resource.resource_id === doc.id),
      )?.id;

      const invite = await sendShareInvite(
        activeChannel.other_user_id,
        doc.id,
        'mindmap',
        doc.title,
        'edit',
        'Editor',
        existingProjectId,
      );

      if (invite) {
        await fetchChannels();
        await fetchMessages(activeChannelId);
        return;
      }
    }

    await sendMessage(activeChannelId, `Shared mindmap: **${doc.title}**`, { type: 'mindmap', id: doc.id, data: { title: doc.title } });
  };

  const handleOpenDm = async (targetId: string) => {
    setDmCreating(true); setDmError(null);
    const result = await useChatStore.getState().openOrCreateDm(targetId);
    setDmCreating(false);
    if ('channel_id' in result) {
      setShowDmSearch(false); setDmSearchQuery('');
      await fetchChannels();
      handleSelectChannel(result.channel_id);
    } else {
      setDmError(result.error || text('Could not start conversation.'));
    }
  };

  const handleCreateGroup = async (name: string, memberIds: string[], groupType: string) => {
    const channelId = await createGroup(name, memberIds, groupType);
    if (channelId) handleSelectChannel(channelId);
  };

  const handleAddReaction = useCallback((messageId: string, emoji: string) => {
    if (!activeChannelId) return;
    toggleReaction(messageId, activeChannelId, emoji);
  }, [activeChannelId]);

  const handleHideChannel = async (ch: ChatChannel) => {
    await hideChannel(ch.id);
    if (activeChannelId === ch.id) setActiveChannel('');
  };

  const fetchHiddenChannels = async () => {
    setLoadingHidden(true);
    try {
      const token = useAuthStore.getState().token;
      const res = await fetch(`${getWorkerUrl()}/chat/channels/hidden`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setHiddenChannels(data.channels || []);
      }
    } catch {}
    setLoadingHidden(false);
  };

  const handleUnhideChannel = async (channelId: string) => {
    const token = useAuthStore.getState().token;
    await fetch(`${getWorkerUrl()}/chat/channels/${channelId}/unhide`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    setHiddenChannels((prev) => prev.filter((c) => c.id !== channelId));
    fetchChannels();
  };

  const handleSendFriendRequest = async () => {
    const tag = friendTagInput.trim();
    if (!tag) return;
    setFriendAdding(true);
    setFriendAddMsg(null);
    try {
      const token = useAuthStore.getState().token;
      const res = await fetch(`${getWorkerUrl()}/users/search?q=${encodeURIComponent(tag)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setFriendAddMsg({ type: 'error', text: text('User not found.') }); setFriendAdding(false); return; }
      const data = await res.json();
      const users: { id: string; username: string; discriminator: string }[] = data.users || [];
      // Find exact match if tag includes discriminator
      let target = users[0];
      if (tag.includes('#')) {
        const [uname, disc] = tag.split('#');
        target = users.find((u) => u.username.toLowerCase() === uname.toLowerCase() && (u.discriminator || '0000') === (disc || '0000').padStart(4, '0')) || users[0];
      }
      if (!target) { setFriendAddMsg({ type: 'error', text: text('User not found.') }); setFriendAdding(false); return; }
      const result = await sendRequest(target.id);
      if (result.success) {
        setFriendAddMsg({ type: 'success', text: text('Friend request sent to {{username}}!', { username: target.username }) });
        setFriendTagInput('');
      } else {
        setFriendAddMsg({ type: 'error', text: result.error || text('Could not send request.') });
      }
    } catch {
      setFriendAddMsg({ type: 'error', text: text('Failed to send request.') });
    }
    setFriendAdding(false);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteChannel) return;
    const res = await deleteChannel(confirmDeleteChannel.id);
    setConfirmDeleteChannel(null);
    if (res.success && activeChannelId === confirmDeleteChannel.id) setActiveChannel('');
  };

  const handleEditMsg = (msg: ChatMessage) => {
    setEditingMsgId(msg.id);
    setEditInput(msg.content || '');
  };

  const handleEditSubmit = async () => {
    if (!editingMsgId || !editInput.trim()) return;
    await editMessage(editingMsgId, editInput.trim());
    setEditingMsgId(null);
    setEditInput('');
  };

  const handleEditCancel = () => {
    setEditingMsgId(null);
    setEditInput('');
  };

  const activeChannel = useMemo(
    () => activeChannelId === INFO_CHANNEL_ID
      ? { id: INFO_CHANNEL_ID, type: 'global' as const, channel_label: text("What's New"), last_message: null } as ChatChannel
      : channels.find((c) => c.id === activeChannelId),
    [activeChannelId, channels, text]
  );
  const currentMessages = (activeChannelId ? messages[activeChannelId] : []) || [];
  const messageGroups = groupMessagesByDate(currentMessages);
  const channelReactions = (activeChannelId ? reactions[activeChannelId] : []) || [];

  const filteredChannels = channelSearch
    ? channels.filter((c) => c.channel_label.toLowerCase().includes(channelSearch.toLowerCase()))
    : channels;
  const globalChannels = filteredChannels.filter((c) => c.type === 'global');
  const groupChannels  = filteredChannels.filter((c) => c.type === 'group');
  const dmChannels     = filteredChannels.filter((c) => c.type === 'dm');
  const infoEntry: ChatChannel = { id: INFO_CHANNEL_ID, type: 'global', channel_label: text("What's New"), last_message: null };

  return (
    <div className="h-full flex bg-gray-50 dark:bg-gray-900 overflow-hidden">
      {/* Lightbox overlay */}
      {lightboxIndex !== null && lightboxImages.length > 0 && (
        <ImageLightbox
          images={lightboxImages}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {showGroupModal && <GroupModal onClose={() => setShowGroupModal(false)} onCreate={handleCreateGroup} friends={friends} />}

      <ConfirmModal
        isOpen={!!confirmDeleteChannel}
        onClose={() => setConfirmDeleteChannel(null)}
        onConfirm={handleConfirmDelete}
        title={confirmDeleteChannel?.type === 'dm' ? text('Delete this conversation?') : text('Delete this group?')}
        message={confirmDeleteChannel?.type === 'dm'
          ? text('This will permanently delete the conversation with {{name}}. If you are friends, you will also be removed as friends.', { name: confirmDeleteChannel?.channel_label ?? '' })
          : text('This will permanently delete the group "{{name}}" and all its messages.', { name: confirmDeleteChannel?.channel_label ?? '' })}
        confirmLabel={text('Yes, delete')}
        isDanger
      />

      {/*  Sidebar  */}
      <aside className="w-60 shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/80 flex flex-col select-none">
        <div className="px-3 pt-4 pb-3 border-b border-gray-100 dark:border-gray-700">
          {/* Tab toggle: Chat / Friends */}
          <div className="flex rounded-lg bg-gray-100 dark:bg-gray-700 p-0.5 mb-3">
            <button
              onClick={() => setSidebarView('channels')}
              className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition-colors ${sidebarView === 'channels' ? 'bg-white dark:bg-gray-800 text-gray-800 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              {text('Chat')}
            </button>
            <button
              onClick={() => setSidebarView('friends')}
              className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition-colors flex items-center justify-center gap-1 ${sidebarView === 'friends' ? 'bg-white dark:bg-gray-800 text-gray-800 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              {text('Friends')}
              {pendingRequests.length > 0 && (
                <span className="inline-flex items-center justify-center min-w-[14px] h-3.5 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold">{pendingRequests.length}</span>
              )}
            </button>
          </div>

          {sidebarView === 'channels' && (
            <div className="relative">
              <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={channelSearch} onChange={(e) => setChannelSearch(e.target.value)} placeholder={text('Search…')}
                className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-2 space-y-1 px-2">
          {/* ── FRIENDS VIEW ── */}
          {sidebarView === 'friends' ? (
            <div className="space-y-3">
              {/* Add friend by username#tag */}
              <div className="p-2">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-2">{text('Add Friend')}</p>
                <div className="flex gap-1">
                  <input
                    value={friendTagInput}
                    onChange={(e) => setFriendTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendFriendRequest()}
                    placeholder={text('username#0000')}
                    className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    onClick={handleSendFriendRequest}
                    disabled={!friendTagInput.trim() || friendAdding}
                    className="shrink-0 p-1.5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 text-white rounded-lg transition-colors"
                  >
                    <UserPlus size={13} />
                  </button>
                </div>
                {friendAddMsg && (
                  <p className={`text-[10px] mt-1 px-1 ${friendAddMsg.type === 'success' ? 'text-green-600' : 'text-red-500'}`}>
                    {friendAddMsg.text}
                  </p>
                )}
              </div>

              {/* Pending requests */}
              {pendingRequests.length > 0 && (
                <div className="px-2">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-amber-500 mb-2 flex items-center gap-1">
                    {text('Pending')}
                    <span className="inline-flex items-center justify-center min-w-[14px] h-3.5 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold">{pendingRequests.length}</span>
                  </p>
                  <div className="space-y-1.5">
                    {pendingRequests.map((req) => (
                      <div key={req.id} className="px-2 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0 ${getAvatarColor(req.requester_id)}`}>
                            {req.requester_username[0]?.toUpperCase()}
                          </div>
                          <p className="text-[10px] font-medium text-gray-700 dark:text-gray-300 truncate flex-1">
                            {req.requester_username}<span className="text-gray-400">#{req.requester_discriminator || '0000'}</span>
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => respondToRequest(req.id, true).then(() => { fetchFriends(); fetchRequests(); })}
                            className="flex-1 py-0.5 rounded-md bg-green-500 hover:bg-green-600 text-white text-[9px] font-semibold transition-colors">
                            {text('Accept')}
                          </button>
                          <button
                            onClick={() => respondToRequest(req.id, false).then(() => fetchRequests())}
                            className="flex-1 py-0.5 rounded-md bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300 text-[9px] font-semibold transition-colors">
                            {text('Decline')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Friends list */}
              <div className="px-2">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-2">{text('Friends')} — {friends.length}</p>
                {friends.length > 0 ? (
                  <div className="space-y-0.5">
                    {friends.map((f) => (
                      <div key={f.id} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/40 group cursor-default">
                        <div className="relative shrink-0">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold ${getAvatarColor(f.friend_id)}`}>
                            {f.friend_username[0]?.toUpperCase()}
                          </div>
                          <StatusDot status={f.friend_presence} sizeClass="w-2 h-2" className="absolute -bottom-0.5 -right-0.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-medium text-gray-700 dark:text-gray-300 truncate">
                            {f.friend_username}<span className="text-gray-400 text-[9px]">#{f.friend_discriminator || '0000'}</span>
                          </p>
                          <p className="text-[9px] text-gray-400 capitalize">{f.friend_presence ?? 'offline'}</p>
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            onClick={() => { handleOpenDm(f.friend_id); setSidebarView('channels'); }}
                            title={text('Send message')}
                            className="p-0.5 rounded text-gray-400 hover:text-indigo-500 transition-colors">
                            <MessageCircle size={11} />
                          </button>
                          <button
                            onClick={() => unfriend(f.friend_id).then(fetchFriends)}
                            title={text('Remove friend')}
                            className="p-0.5 rounded text-gray-400 hover:text-red-500 transition-colors">
                            <X size={11} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-400 dark:text-gray-600 px-1 py-0.5">{text('No friends yet — add someone using username#tag above')}</p>
                )}
              </div>
            </div>
          ) : loadingChannels && channels.length === 0 ? (
            <div className="p-4 text-center text-xs text-gray-400">{text('Loading…')}</div>
          ) : (
            <>
              {/* What's New */}
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 px-1 mb-1">{text('Info')}</p>
                <ChannelItem ch={infoEntry} isActive={activeChannelId === INFO_CHANNEL_ID} onSelect={handleSelectChannel} />
              </div>

              {/* Global */}
              {globalChannels.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 px-1 mb-1 mt-3">{text('Global')}</p>
                  {globalChannels.map((ch) => <ChannelItem key={ch.id} ch={ch} isActive={activeChannelId === ch.id} onSelect={handleSelectChannel} />)}
                </div>
              )}

              {/* Groups */}
              <div>
                <div className="flex items-center justify-between px-1 mb-1 mt-3">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">{text('Groups')}</p>
                  <button onClick={() => setShowGroupModal(true)} title={text('New group')}
                    className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 transition-colors">
                    <Plus size={12} />
                  </button>
                </div>
                {groupChannels.map((ch) => (
                  <ChannelItem
                    key={ch.id} ch={ch} isActive={activeChannelId === ch.id} onSelect={handleSelectChannel}
                    currentUserId={user?.id}
                    onDelete={(c) => setConfirmDeleteChannel(c)}
                    onLeave={(c) => setConfirmDeleteChannel(c)}
                  />
                ))}
                {groupChannels.length === 0 && <p className="text-[11px] text-gray-400 dark:text-gray-600 px-1 py-0.5">{text('No groups yet')}</p>}
              </div>

              {/* DMs */}
              <div>
                <div className="flex items-center justify-between px-1 mb-1 mt-3">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">{text('Direct Messages')}</p>
                  <button onClick={() => setShowDmSearch((x) => !x)} title={text('New DM')}
                    className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 transition-colors">
                    <Plus size={12} />
                  </button>
                </div>
                {showDmSearch && (
                  <div className="mb-2 space-y-1">
                    {friends.length === 0 ? (
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 px-1 py-1">
                        {text('Add friends first to start a DM.')}
                      </p>
                    ) : (
                      <>
                        <input
                          value={dmSearchQuery}
                          onChange={(e) => setDmSearchQuery(e.target.value)}
                          placeholder={text('Search your friends…')}
                          autoFocus
                          className="w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                        />
                        {dmError && <p className="text-[10px] text-red-500 px-1">{dmError}</p>}
                        <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                          {friends
                            .filter((f) =>
                              !dmSearchQuery ||
                              f.friend_username.toLowerCase().includes(dmSearchQuery.toLowerCase())
                            )
                            .map((f) => (
                              <button
                                key={f.friend_id}
                                onClick={() => handleOpenDm(f.friend_id)}
                                disabled={dmCreating}
                                className="w-full text-left px-2 py-1.5 text-xs hover:bg-purple-50 dark:hover:bg-purple-900/20 text-gray-700 dark:text-gray-300 border-b last:border-b-0 border-gray-100 dark:border-gray-600 flex items-center gap-2 disabled:opacity-50">
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 ${getAvatarColor(f.friend_id)}`}>
                                  {f.friend_username[0]?.toUpperCase()}
                                </div>
                                <span className="flex-1 truncate">
                                  {f.friend_username}<span className="text-gray-400">#{f.friend_discriminator || '0000'}</span>
                                </span>
                                <MessageCircle size={11} className="text-purple-400 shrink-0" />
                              </button>
                            ))
                          }
                        </div>
                      </>
                    )}
                  </div>
                )}
                {dmChannels.map((ch) => (
                  <ChannelItem
                    key={ch.id} ch={ch} isActive={activeChannelId === ch.id} onSelect={handleSelectChannel}
                    currentUserId={user?.id}
                    onHide={handleHideChannel}
                    onDelete={(c) => setConfirmDeleteChannel(c)}
                  />
                ))}
                {dmChannels.length === 0 && !showDmSearch && (
                  <p className="text-[11px] text-gray-400 dark:text-gray-600 px-1 py-0.5">{text('No direct messages yet')}</p>
                )}

                {/* Hidden DMs toggle */}
                <button
                  onClick={() => {
                    const next = !showHiddenDms;
                    setShowHiddenDms(next);
                    if (next) fetchHiddenChannels();
                  }}
                  className="mt-1 text-[10px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1 px-1 transition-colors"
                >
                  <EyeOff size={10} />
                  {showHiddenDms ? text('Hide hidden DMs') : text('Show hidden DMs')}
                </button>

                {showHiddenDms && (
                  <div className="mt-1 space-y-0.5">
                    {loadingHidden ? (
                      <p className="text-[10px] text-gray-400 px-1 py-1">{text('Loading…')}</p>
                    ) : hiddenChannels.length === 0 ? (
                      <p className="text-[10px] text-gray-400 dark:text-gray-600 px-1 py-1">{text('No hidden DMs')}</p>
                    ) : (
                      hiddenChannels.map((ch) => (
                        <div key={ch.id} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-700/40 group">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0 ${getAvatarColor(ch.other_user_id || ch.id)}`}>
                            {(ch.other_username?.[0] ?? '?').toUpperCase()}
                          </div>
                          <p className="flex-1 text-[10px] text-gray-600 dark:text-gray-400 truncate">{ch.other_username}</p>
                          <button
                            onClick={() => handleUnhideChannel(ch.id)}
                            title={text('Unhide')}
                            className="shrink-0 text-[9px] text-indigo-500 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            {text('Unhide')}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Friends shortcut */}
              <div className="px-1 mt-2">
                <button
                  onClick={() => setSidebarView('friends')}
                  className="w-full text-left text-[10px] text-gray-400 dark:text-gray-500 hover:text-indigo-500 dark:hover:text-indigo-400 py-1 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/40 flex items-center gap-1.5 transition-colors"
                >
                  <Users size={11} />
                  {text('Friends & requests')}
                  {pendingRequests.length > 0 && (
                    <span className="ml-auto inline-flex items-center justify-center min-w-[14px] h-3.5 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold">{pendingRequests.length}</span>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </aside>

      {/*  Main chat area  */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!activeChannel ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <MessageCircle size={48} className="text-gray-300 dark:text-gray-600 mb-4" />
            <h3 className="text-lg font-bold text-gray-700 dark:text-gray-300 mb-2">{text('Pick a channel')}</h3>
            <p className="text-sm text-gray-400 max-w-xs">{text('Select a channel, group, or direct message from the sidebar.')}</p>
          </div>
        ) : (
          <>
            {/* Channel header */}
            <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shrink-0 shadow-sm overflow-hidden">
              {/* DM profile banner */}
              {activeChannel.type === 'dm' && activeChannel.other_banner_color && (
                <div className="h-10" style={{ backgroundColor: activeChannel.other_banner_color }} />
              )}
              <div className="px-5 py-3 flex items-center gap-3">
                {activeChannel.type === 'dm' && activeChannel.other_user_id ? (
                  <div className="relative shrink-0">
                    <AvatarEl
                      avatarUrl={activeChannel.other_avatar_url}
                      userId={activeChannel.other_user_id}
                      displayName={activeChannel.other_username || activeChannel.channel_label}
                      sizeClass={activeChannel.other_banner_color ? 'w-10 h-10 -mt-6 ring-2 ring-white dark:ring-gray-800' : 'w-9 h-9'}
                      textClass="text-sm"
                    />
                    <StatusDot status={activeChannel.other_presence} sizeClass="w-3 h-3" className="absolute -bottom-0.5 -right-0.5" />
                  </div>
                ) : activeChannel.type === 'group' ? (
                  <div className="relative group/hdr">
                    {activeChannel.avatar_url
                      ? <img src={activeChannel.avatar_url} alt={activeChannel.channel_label} className="w-9 h-9 rounded-full object-cover" />
                      : <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold ${getAvatarColor(activeChannel.id)}`}>
                          {activeChannel.channel_label[0]?.toUpperCase()}
                        </div>}
                    {activeChannel.owner_id === user?.id && (
                      <label className="absolute inset-0 rounded-full flex items-center justify-center bg-black/40 opacity-0 group-hover/hdr:opacity-100 cursor-pointer transition-opacity" title={text('Change group avatar')}>
                        <Camera size={14} className="text-white" />
                        <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                          const f = e.target.files?.[0]; e.target.value = '';
                          if (!f || f.size > 200 * 1024) return;
                          const b64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(f); });
                          await useChatStore.getState().updateGroupAvatar(activeChannel.id, b64);
                        }} />
                      </label>
                    )}
                  </div>
                ) : (
                  <ChannelIcon channel={activeChannel} />
                )}
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-1.5">
                    {activeChannel.channel_label}
                    {activeChannel.type === 'group' && activeChannel.owner_id === user?.id && (
                      <span title={text('You are the owner')}><Crown size={12} className="text-yellow-500" /></span>
                    )}
                  </h3>
                  {activeChannel.type === 'dm' && (
                    <p className="text-xs text-gray-400 flex items-center gap-1.5">
                      <StatusDot status={activeChannel.other_presence} sizeClass="w-2 h-2" ring={false} />
                      {activeChannel.other_username}
                      {activeChannel.other_discriminator && <span className="text-gray-500">#{activeChannel.other_discriminator}</span>}
                      <span className="capitalize">{activeChannel.other_presence ?? 'offline'}</span>
                    </p>
                  )}
                  {activeChannel.id === INFO_CHANNEL_ID && <p className="text-xs text-gray-400">{text('Platform updates and news')}</p>}
                  {activeChannel.type === 'project' && activeChannel.project_name && <p className="text-xs text-gray-400">{text('Project · {{project}}', { project: activeChannel.project_name })}</p>}
                  {activeChannel.type === 'group' && <p className="text-xs text-gray-400">{activeChannel.group_type === 'public' ? text('Public group') : text('Private group')}</p>}
                  {activeChannel.type === 'global' && activeChannel.id !== INFO_CHANNEL_ID && <p className="text-xs text-gray-400">{text('Everyone on the platform')}</p>}
                </div>
              </div>
            </div>

            {activeChannelId === INFO_CHANNEL_ID ? (
              <UpdatesView />
            ) : (
              <>
                {/* Messages */}
                <div className="flex-1 overflow-y-auto py-4">
                  {loadingMessages && currentMessages.length === 0 ? (
                    <div className="text-center py-12 text-sm text-gray-400">{text('Loading messages…')}</div>
                  ) : currentMessages.length === 0 ? (
                    <div className="text-center py-12">
                      <MessageCircle size={36} className="mx-auto text-gray-300 dark:text-gray-700 mb-3" />
                      <p className="text-sm text-gray-400">{text('No messages yet. Say hi! 👋')}</p>
                    </div>
                  ) : (
                    messageGroups.map((group) => (
                      <div key={group.date}>
                        <div className="flex items-center gap-3 px-4 my-4">
                          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                          <span className="text-xs text-gray-400 font-medium px-2">{group.date}</span>
                          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                        </div>
                        {group.messages.map((msg, idx) => {
                          const prev = idx > 0 ? group.messages[idx - 1] : null;
                          const isConsecutive = !!(prev?.sender_id === msg.sender_id && (msg.sent_at - prev.sent_at < 5 * 60 * 1000));
                          return (
                            <MessageRow
                              key={msg.id}
                              msg={msg}
                              isConsecutive={isConsecutive}
                              onDelete={() => deleteMessage(msg.id)}
                              onEdit={() => handleEditMsg(msg)}
                              currentUserId={user?.id || ''}
                              resolvedUsernames={resolvedUsernames}
                              channelReactions={channelReactions}
                              onAddReaction={handleAddReaction}
                              onOpenImage={openLightbox}
                              onOpenMindmap={(id) => navigate(`/mindmap/editor?id=${id}`)}
                              respondToInvite={useChatStore.getState().respondToInvite}
                              isEditing={editingMsgId === msg.id}
                              editInput={editInput}
                              onEditChange={setEditInput}
                              onEditSubmit={handleEditSubmit}
                              onEditCancel={handleEditCancel}
                            />
                          );
                        })}
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4 shrink-0">
                  {showAttach && (
                    <div className="mb-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">{text('Share a Mindmap')}</p>
                        <button onClick={() => setShowAttach(false)} className="p-0.5 text-gray-400 hover:text-gray-600"><X size={14} /></button>
                      </div>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {documents.length === 0 ? (
                          <p className="text-xs text-gray-400">{text('No mindmaps yet.')}</p>
                        ) : documents.map((doc) => (
                          <button key={doc.id} onClick={() => handleShareMindmap(doc)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg text-sm transition-colors">
                            <Lightbulb size={13} className="text-amber-500 shrink-0" />
                            <span className="text-gray-800 dark:text-white truncate">{doc.title}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2 items-end">
                    <input ref={fileInputRef} type="file" accept="image/*,*" onChange={handleFileSelect} className="hidden" />
                    <button onClick={() => setShowAttach((x) => !x)} title={text('Share mindmap')}
                      className={`p-2.5 rounded-xl border transition-colors shrink-0 ${showAttach ? 'border-blue-300 bg-blue-50 dark:bg-blue-900/20 text-blue-500' : 'border-gray-200 dark:border-gray-600 text-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                      <Paperclip size={16} />
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} disabled={fileSending} title={text('Send image or file')}
                      className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shrink-0 disabled:opacity-50">
                      {fileSending
                        ? <span className="animate-spin w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full block" />
                        : <ImageIcon size={16} />}
                    </button>
                    <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
                      placeholder={text('Message {{channel}}…', { channel: activeChannel.channel_label })} rows={1}
                      style={{ resize: 'none' }}
                      className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-gray-600 transition-colors max-h-32" />
                    <button onClick={handleSend} disabled={!input.trim()}
                      className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white shrink-0 transition-colors">
                      <Send size={16} />
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1.5 ml-12">{text('Enter to send · Shift+Enter for new line')}</p>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
