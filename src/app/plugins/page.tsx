'use client';
import { usePluginStore } from '@/store/usePluginStore';
import { useAppRequestStore, AppRequest } from '@/store/useAppRequestStore';
import { useAuthStore } from '@/store/useAuthStore';
import { readFile, createFile } from '@/lib/fileSystem';
import { useCommentModerationStore } from '@/store/useCommentModerationStore';
import { screenComment } from '@/lib/profanityFilter';
import { useEffect, useState } from 'react';
import { useAppTranslation } from '@/lib/appTranslations';
import {
  Download, Power, Trash2, Box, PenTool, TrendingUp, Layers,
  BookOpen, CheckSquare, ClipboardList, BarChart2, FileText, Layout,
  Send, MessageSquarePlus, Clock, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, Shield, Tag, ThumbsUp, ThumbsDown, MessageCircle, User as UserIcon,
} from 'lucide-react';

const IconMap: Record<string, any> = {
  PenTool, TrendingUp, Box, Layers, BookOpen, FileText, Layout,
  CheckSquare, ClipboardList, BarChart2,
};

const APP_CATEGORIES = [
  'Productivity',
  'Creative Tools',
  'Analytics & Stats',
  'Planning & Scheduling',
  'Writing & Storytelling',
  'Visual & Design',
  'Organisation',
  'Communication',
  'Tracking & Habits',
  'Other',
];

type AppTab = 'store' | 'requests';

export default function PluginStorePage() {
  const { text, language } = useAppTranslation();
  const { plugins, installPlugin, uninstallPlugin, togglePlugin, mergePlugins } = usePluginStore();
  const { requests, submitRequest, respondToRequest, deleteRequest, voteRequest, addRequestComment, deleteRequestComment } = useAppRequestStore();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [isLoaded, setIsLoaded] = useState(false);
  const [tab, setTab] = useState<AppTab>('store');

  // Request form state
  const [reqName, setReqName] = useState('');
  const [reqDesc, setReqDesc] = useState('');
  const [reqReason, setReqReason] = useState('');
  const [reqCategories, setReqCategories] = useState<string[]>([]);
  const [reqSubmitted, setReqSubmitted] = useState(false);
  const [lastSubmittedName, setLastSubmittedName] = useState('');

  // Admin feedback state keyed by request id
  const [feedbackMap, setFeedbackMap] = useState<Record<string, string>>({});
  const [expandedReq, setExpandedReq] = useState<string | null>(null);
  // Comments panel state keyed by request id
  const [showCommentsMap, setShowCommentsMap] = useState<Record<string, boolean>>({});
  const [commentDraftMap, setCommentDraftMap] = useState<Record<string, string>>({});
  const [commentErrorMap, setCommentErrorMap] = useState<Record<string, string>>({});
  const { isUserBanned } = useCommentModerationStore();

  const formatDate = (value: string | number | Date, options?: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(language, options).format(typeof value === 'string' || typeof value === 'number' ? new Date(value) : value);

  const getCommentCountLabel = (count: number) => {
    if (count <= 0) {
      return text('Comment');
    }

    return `${count} ${text(count === 1 ? 'comment' : 'comments')}`;
  };

  const toggleComments = (id: string) =>
    setShowCommentsMap((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleAddComment = (reqId: string) => {
    const commentText = commentDraftMap[reqId]?.trim();
    if (!commentText) return;
    if (isUserBanned(user?.id ?? '')) {
      setCommentErrorMap((prev) => ({ ...prev, [reqId]: text('You have been suspended from commenting by an admin.') }));
      return;
    }
    const check = screenComment(commentText);
    if (!check.ok) {
      setCommentErrorMap((prev) => ({ ...prev, [reqId]: check.reason }));
      return;
    }
    setCommentErrorMap((prev) => { const n = { ...prev }; delete n[reqId]; return n; });
    addRequestComment(
      reqId,
      user?.id ?? 'anonymous',
      user?.username || user?.email?.split('@')[0] || 'Anonymous',
      commentText
    );
    setCommentDraftMap((prev) => ({ ...prev, [reqId]: '' }));
  };

  // Load plugins from file, merge with catalogue defaults
  useEffect(() => {
    const load = async () => {
      const content = await readFile('root/plugins.json');
      if (content) {
        try {
          const data = JSON.parse(content);
          if (Array.isArray(data)) mergePlugins(data);
        } catch (e) {
          console.error('Failed to parse plugins.json', e);
        }
      }
      setIsLoaded(true);
    };
    load();
  }, [mergePlugins]);

  // Persist plugins to file on change
  useEffect(() => {
    if (!isLoaded) return;
    const timeout = setTimeout(async () => {
      await createFile('root', 'plugins.json', JSON.stringify(plugins, null, 2));
    }, 1000);
    return () => clearTimeout(timeout);
  }, [plugins, isLoaded]);

  // Visible plugins: admins see everything, users see non-admin-only
  const visiblePlugins = plugins.filter((p) => isAdmin || !p.adminOnly);

  // Derived request sets
  const myRequests = requests.filter((r) => r.userId === user?.id);
  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  const handleSubmitRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqName.trim() || !reqReason.trim()) return;
    submitRequest(user?.id ?? 'anonymous', user?.email ?? 'unknown', reqName.trim(), reqDesc.trim(), reqReason.trim(), reqCategories);
    setLastSubmittedName(reqName.trim());
    setReqName(''); setReqDesc(''); setReqReason(''); setReqCategories([]);
    setReqSubmitted(true);
  };

  const handleSendAnother = () => setReqSubmitted(false);

  const toggleCategory = (cat: string) =>
    setReqCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );

  const handleRespond = (id: string, status: 'approved' | 'rejected') => {
    respondToRequest(id, status, feedbackMap[id] ?? '');
    setFeedbackMap((prev) => { const n = { ...prev }; delete n[id]; return n; });
    setExpandedReq(null);
  };

  const statusBadge = (status: AppRequest['status']) => {
    if (status === 'pending')
      return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium"><Clock size={10} /> {text('Pending')}</span>;
    if (status === 'approved')
      return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium"><CheckCircle2 size={10} /> {text('Approved')}</span>;
    return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-medium"><XCircle size={10} /> {text('Rejected')}</span>;
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-800 dark:text-white">{text('App Store')}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{text('Extend your planner with new features.')}</p>
          </div>
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 p-1 rounded-xl">
            <button
              onClick={() => setTab('store')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'store' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}
            >
              {text('Apps')}
            </button>
            <button
              onClick={() => setTab('requests')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${tab === 'requests' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}
            >
              <MessageSquarePlus size={14} />
              {isAdmin ? text('Requested Apps') : text('Suggest an App')}
              {isAdmin && pendingCount > 0 && (
                <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">{pendingCount}</span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto">

        {/* ── STORE TAB ── */}
        {tab === 'store' && (
          <div className="p-8">
            {isAdmin && (
              <div className="mb-6 flex items-center gap-2 text-xs font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg px-3 py-2 w-fit">
                <Shield size={13} /> {text('Admin view - showing all apps including admin-only ones')}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {visiblePlugins.map((plugin) => {
                const Icon = IconMap[plugin.icon] || Box;
                return (
                  <div key={plugin.id} className={`bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border flex flex-col transition-colors ${plugin.adminOnly ? 'border-purple-200 dark:border-purple-800' : 'border-gray-200 dark:border-gray-700'}`}>
                    <div className="flex items-start justify-between mb-4">
                      <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${plugin.adminOnly ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
                        <Icon size={24} />
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {plugin.adminOnly && (
                          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 font-medium">
                            <Shield size={9} /> {text('Admin only')}
                          </span>
                        )}
                        {plugin.installed && (
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${plugin.enabled ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                            {plugin.enabled ? text('Enabled') : text('Disabled')}
                          </span>
                        )}
                      </div>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{text(plugin.name)}</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mb-6 flex-1">{text(plugin.description)}</p>
                    <div className="flex gap-2">
                      {!plugin.installed ? (
                        <button onClick={() => installPlugin(plugin.id)} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2">
                          <Download size={16} /> {text('Install')}
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => togglePlugin(plugin.id)}
                            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${plugin.enabled ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600' : 'bg-green-600 hover:bg-green-700 text-white'}`}
                          >
                            <Power size={16} /> {plugin.enabled ? text('Disable') : text('Enable')}
                          </button>
                          <button onClick={() => uninstallPlugin(plugin.id)} className="px-3 py-2 rounded-lg font-medium transition-colors flex items-center justify-center border border-red-200 dark:border-red-800 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20" title={text('Uninstall')}>
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── REQUEST TAB ── */}
        {tab === 'requests' && (
          <div className="p-8 max-w-3xl mx-auto space-y-8">

            {/* Submit form — all users can suggest an app */}
            {(
              <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-1 flex items-center gap-2">
                  <MessageSquarePlus size={18} className="text-blue-500" /> {text('Suggest an App')}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                  {text("Have an idea for a new app? Send it to the developer - they'll review it and reply with their decision and feedback.")}
                </p>
                {reqSubmitted ? (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-4">
                      <CheckCircle2 size={20} className="shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold">{text('Your suggestion has been sent!')}</p>
                        <p className="text-xs mt-0.5 text-green-600 dark:text-green-400">
                          <span className="font-medium">"{lastSubmittedName}"</span> {text("was submitted to the developer. You'll see their response below once they've reviewed it.")}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleSendAnother}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    >
                      <MessageSquarePlus size={14} /> {text('Suggest another app')}
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmitRequest} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">{text('App Name *')}</label>
                      <input value={reqName} onChange={(e) => setReqName(e.target.value)} placeholder={text('e.g. Habit Tracker')} required className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 outline-none focus:border-blue-400 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">{text('App Type / Category')}</label>
                      <p className="text-xs text-gray-400 mb-2">{text('Pick the categories that best describe what the app should do (optional).')}</p>
                      <div className="flex flex-wrap gap-2">
                        {APP_CATEGORIES.map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => toggleCategory(cat)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                              reqCategories.includes(cat)
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400'
                            }`}
                          >
                            <Tag size={11} />{text(cat)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">{text('Description')}</label>
                      <textarea value={reqDesc} onChange={(e) => setReqDesc(e.target.value)} placeholder={text('What would this app do? How would it work?')} rows={3} className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 outline-none focus:border-blue-400 transition-colors resize-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">{text('Why do you need it? *')}</label>
                      <textarea value={reqReason} onChange={(e) => setReqReason(e.target.value)} placeholder={text('Explain your use case and how it would improve your workflow...')} rows={3} required className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 outline-none focus:border-blue-400 transition-colors resize-none" />
                    </div>
                    <button type="submit" className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors">
                      <Send size={15} /> {text('Send Suggestion')}
                    </button>
                  </form>
                )}
              </section>
            )}

            {/* My requests list — shown for all users */}
            {myRequests.length > 0 && (
              <section>
                <h2 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">{text('Your Suggestions')}</h2>
                <div className="space-y-3">
                  {[...myRequests].reverse().map((req) => {
                    const myVote = (req.votes ?? []).find((v) => v.userId === user?.id);
                    const upCount = (req.votes ?? []).filter((v) => v.vote === 'up').length;
                    const downCount = (req.votes ?? []).filter((v) => v.vote === 'down').length;
                    const commentCount = (req.requestComments ?? []).length;
                    const showComments = showCommentsMap[req.id] ?? false;
                    return (
                    <div key={req.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{req.appName}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{formatDate(req.createdAt, { year: 'numeric', month: 'short', day: 'numeric' })}</p>
                          </div>
                          {statusBadge(req.status)}
                        </div>
                        {req.categories && req.categories.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2 mb-2">
                            {req.categories.map((cat) => (
                              <span key={cat} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 font-medium">
                                <Tag size={8} />{text(cat)}
                              </span>
                            ))}
                          </div>
                        )}
                        {req.reason && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{req.reason}</p>}
                        {req.feedback && (
                          <div className={`mt-3 rounded-lg px-3 py-2.5 text-sm border-l-2 ${req.status === 'approved' ? 'bg-green-50 dark:bg-green-900/10 border-green-400 text-green-800 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/10 border-red-400 text-red-800 dark:text-red-300'}`}>
                            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1 opacity-60">{text('Developer Feedback')}</p>
                            {req.feedback}
                          </div>
                        )}
                        {/* Voting + Comments bar */}
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                          <button onClick={() => voteRequest(req.id, user?.id ?? 'anonymous', 'up')} className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${ myVote?.vote === 'up' ? 'bg-green-600 border-green-600 text-white' : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-green-400 hover:text-green-600'}`}>
                            <ThumbsUp size={11} /> {upCount > 0 ? upCount : ''} {text('Good idea')}
                          </button>
                          <button onClick={() => voteRequest(req.id, user?.id ?? 'anonymous', 'down')} className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${ myVote?.vote === 'down' ? 'bg-red-600 border-red-600 text-white' : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-red-400 hover:text-red-600'}`}>
                            <ThumbsDown size={11} /> {downCount > 0 ? downCount : ''} {text('Not for me')}
                          </button>
                          <button onClick={() => toggleComments(req.id)} className={`ml-auto flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${ showComments ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600'}`}>
                            <MessageCircle size={11} /> {getCommentCountLabel(commentCount)}
                          </button>
                        </div>
                      </div>
                      {/* Comments section */}
                      {showComments && (
                        <div className="border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 px-4 py-3 space-y-3">
                          {(req.requestComments ?? []).length === 0 ? (
                            <p className="text-xs text-gray-400 text-center py-1">{text('No comments yet.')}</p>
                          ) : (
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                              {(req.requestComments ?? []).map((c) => (
                                <div key={c.id} className="flex items-start gap-2 group/rc">
                                  <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg px-3 py-2 border border-gray-100 dark:border-gray-700">
                                    <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 mb-0.5 flex items-center gap-1"><UserIcon size={9} />{c.userName}</p>
                                    <p className="text-sm text-gray-700 dark:text-gray-200">{c.text}</p>
                                    <p className="text-[10px] text-gray-400 mt-0.5">{formatDate(c.createdAt, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                                  </div>
                                  {c.userId === user?.id && (
                                    <button onClick={() => deleteRequestComment(req.id, c.id)} className="mt-1 p-1 text-gray-300 hover:text-red-400 opacity-0 group-hover/rc:opacity-100 transition-all"><Trash2 size={11} /></button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          <form onSubmit={(e) => { e.preventDefault(); handleAddComment(req.id); }} className="flex flex-col gap-1.5">
                            <div className="flex gap-2">
                              <input
                                value={commentDraftMap[req.id] ?? ''}
                                onChange={(e) => setCommentDraftMap((prev) => ({ ...prev, [req.id]: e.target.value }))}
                                placeholder={text('Add a comment...')}
                                className="flex-1 text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 outline-none focus:border-blue-400 transition-colors"
                              />
                              <button type="submit" disabled={!(commentDraftMap[req.id]?.trim())} className="p-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg text-white transition-colors"><Send size={12} /></button>
                            </div>
                            {commentErrorMap[req.id] && <p className="text-red-500 text-[11px]">{commentErrorMap[req.id]}</p>}
                          </form>
                        </div>
                      )}
                    </div>
                  )})}
                </div>
              </section>
            )}

            {/* Community Suggestions — visible to all users */}
            {(() => {
              const communityRequests = [...requests]
                .filter((r) => r.status === 'pending')
                .sort((a, b) => (b.votes ?? []).filter((v) => v.vote === 'up').length - (a.votes ?? []).filter((v) => v.vote === 'up').length);
              if (communityRequests.length === 0) return null;
              return (
                <section>
                  <h2 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <TrendingUp size={13} /> {text('Community Suggestions')}
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{text('Vote on ideas other users have suggested. The most supported suggestions are more likely to be built!')}</p>
                  <div className="space-y-3">
                    {communityRequests.map((req) => {
                      const myVote = (req.votes ?? []).find((v) => v.userId === user?.id);
                      const upCount = (req.votes ?? []).filter((v) => v.vote === 'up').length;
                      const downCount = (req.votes ?? []).filter((v) => v.vote === 'down').length;
                      const commentCount = (req.requestComments ?? []).length;
                      const showComments = showCommentsMap[`community-${req.id}`] ?? false;
                      return (
                        <div key={req.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                          <div className="p-4">
                            <div className="flex items-start justify-between gap-3 mb-1">
                              <div>
                                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{req.appName}</p>
                                {req.categories && req.categories.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {req.categories.map((cat) => (
                                      <span key={cat} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 font-medium"><Tag size={8} />{text(cat)}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-semibold shrink-0">
                                <ThumbsUp size={12} /> {upCount}
                              </div>
                            </div>
                            {req.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{req.description}</p>}
                            <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-100 dark:border-gray-700">
                              <button onClick={() => voteRequest(req.id, user?.id ?? 'anonymous', 'up')}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${myVote?.vote === 'up' ? 'bg-green-600 border-green-600 text-white' : 'border-gray-200 dark:border-gray-600 text-gray-500 hover:border-green-400 hover:text-green-600'}`}>
                                <ThumbsUp size={11} /> {upCount > 0 ? upCount : ''} {text('Good idea')}
                              </button>
                              <button onClick={() => voteRequest(req.id, user?.id ?? 'anonymous', 'down')}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${myVote?.vote === 'down' ? 'bg-red-600 border-red-600 text-white' : 'border-gray-200 dark:border-gray-600 text-gray-500 hover:border-red-400 hover:text-red-600'}`}>
                                <ThumbsDown size={11} /> {text('Not for me')}
                              </button>
                              <button onClick={() => setShowCommentsMap((prev) => ({ ...prev, [`community-${req.id}`]: !prev[`community-${req.id}`] }))}
                                className={`ml-auto flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${showComments ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-200 dark:border-gray-600 text-gray-500 hover:border-blue-400 hover:text-blue-600'}`}>
                                <MessageCircle size={11} /> {getCommentCountLabel(commentCount)}
                              </button>
                            </div>
                          </div>
                          {showComments && (
                            <div className="border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 px-4 py-3 space-y-2">
                              {(req.requestComments ?? []).length === 0 ? (
                                <p className="text-xs text-gray-400 text-center py-1">{text('No comments yet. Be the first!')}</p>
                              ) : (
                                <div className="space-y-2 max-h-36 overflow-y-auto">
                                  {(req.requestComments ?? []).map((c) => (
                                    <div key={c.id} className="flex items-start gap-2 group/rc">
                                      <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg px-3 py-2 border border-gray-100 dark:border-gray-700">
                                        <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 mb-0.5 flex items-center gap-1"><UserIcon size={9} />{c.userName}</p>
                                        <p className="text-sm text-gray-700 dark:text-gray-200">{c.text}</p>
                                      </div>
                                      {c.userId === user?.id && (
                                        <button onClick={() => deleteRequestComment(req.id, c.id)} className="mt-1 p-1 text-gray-300 hover:text-red-400 opacity-0 group-hover/rc:opacity-100 transition-all"><Trash2 size={11} /></button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                              <form onSubmit={(e) => { e.preventDefault(); handleAddComment(req.id); }} className="flex flex-col gap-1.5">
                                <div className="flex gap-2">
                                  <input value={commentDraftMap[req.id] ?? ''} onChange={(e) => setCommentDraftMap((prev) => ({ ...prev, [req.id]: e.target.value }))}
                                    placeholder={text('Share your thoughts...')} className="flex-1 text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 outline-none focus:border-blue-400 transition-colors" />
                                  <button type="submit" disabled={!(commentDraftMap[req.id]?.trim())} className="p-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg text-white transition-colors"><Send size={12} /></button>
                                </div>
                                {commentErrorMap[req.id] && <p className="text-red-500 text-[11px]">{commentErrorMap[req.id]}</p>}
                              </form>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })()}

            {/* Admin review panel */}
            {isAdmin && (
              <section>
                <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-1 flex items-center gap-2">
                  <Shield size={18} className="text-purple-500" />
                  {text('Requested Apps')}
                  {pendingCount > 0 && <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{pendingCount} {text('pending')}</span>}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">{text('User suggestions for new apps. Review them and respond with your decision and feedback.')}</p>

                {requests.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 dark:text-gray-600 text-sm">{text('No requests yet.')}</div>
                ) : (
                  <div className="space-y-4">
                    {[...requests].reverse().map((req) => (
                      <div key={req.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <button onClick={() => setExpandedReq(expandedReq === req.id ? null : req.id)} className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{req.appName}</span>
                              {statusBadge(req.status)}
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {text('from')} <span className="font-medium text-gray-600 dark:text-gray-300">{req.userEmail}</span>
                              {' · '}{formatDate(req.createdAt, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                          </div>
                          {expandedReq === req.id ? <ChevronUp size={14} className="text-gray-400 shrink-0" /> : <ChevronDown size={14} className="text-gray-400 shrink-0" />}
                        </button>

                        {expandedReq === req.id && (
                          <div className="border-t border-gray-100 dark:border-gray-700 px-5 pb-5 pt-4 space-y-4">
                            {req.categories && req.categories.length > 0 && (
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">{text('Suggested Categories')}</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {req.categories.map((cat) => (
                                    <span key={cat} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 font-medium">
                                      <Tag size={10} />{text(cat)}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {req.description && (
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{text('Description')}</p>
                                <p className="text-sm text-gray-700 dark:text-gray-300">{req.description}</p>
                              </div>
                            )}
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{text('Why they need it')}</p>
                              <p className="text-sm text-gray-700 dark:text-gray-300">{req.reason}</p>
                            </div>
                            {/* Community votes summary for admin */}
                            {(() => {
                              const up = (req.votes ?? []).filter((v) => v.vote === 'up').length;
                              const down = (req.votes ?? []).filter((v) => v.vote === 'down').length;
                              return (up + down) > 0 ? (
                                <div className="flex items-center gap-3">
                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{text('Community Votes')}</p>
                                  <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium"><ThumbsUp size={11} /> {up}</span>
                                  <span className="flex items-center gap-1 text-xs text-red-500 dark:text-red-400 font-medium"><ThumbsDown size={11} /> {down}</span>
                                </div>
                              ) : null;
                            })()}
                            {/* Comments section for admin */}
                            <div>
                              <button onClick={() => toggleComments(req.id)} className={`flex items-center gap-1.5 text-xs font-semibold mb-2 ${ (showCommentsMap[req.id]) ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 hover:text-gray-600'}`}>
                                <MessageCircle size={12} />
                                {(req.requestComments ?? []).length > 0 ? getCommentCountLabel((req.requestComments ?? []).length) : text('Comments')}
                                {(showCommentsMap[req.id]) ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                              </button>
                              {showCommentsMap[req.id] && (
                                <div className="bg-gray-50 dark:bg-gray-900/30 rounded-xl p-3 space-y-2">
                                  {(req.requestComments ?? []).length === 0 ? (
                                    <p className="text-xs text-gray-400 text-center py-1">{text('No comments yet.')}</p>
                                  ) : (
                                    <div className="space-y-2 max-h-40 overflow-y-auto">
                                      {(req.requestComments ?? []).map((c) => (
                                        <div key={c.id} className="flex items-start gap-2 group/rc">
                                          <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg px-3 py-2 border border-gray-100 dark:border-gray-700">
                                            <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 mb-0.5 flex items-center gap-1"><UserIcon size={9} />{c.userName}</p>
                                            <p className="text-sm text-gray-700 dark:text-gray-200">{c.text}</p>
                                            <p className="text-[10px] text-gray-400 mt-0.5">{formatDate(c.createdAt, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                                          </div>
                                          <button onClick={() => deleteRequestComment(req.id, c.id)} className="mt-1 p-1 text-gray-300 hover:text-red-400 opacity-0 group-hover/rc:opacity-100 transition-all"><Trash2 size={11} /></button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  <form onSubmit={(e) => { e.preventDefault(); handleAddComment(req.id); }} className="flex flex-col gap-1.5">
                                    <div className="flex gap-2">
                                      <input
                                        value={commentDraftMap[req.id] ?? ''}
                                        onChange={(e) => setCommentDraftMap((prev) => ({ ...prev, [req.id]: e.target.value }))}
                                        placeholder={text('Add a comment...')}
                                        className="flex-1 text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 outline-none focus:border-blue-400 transition-colors"
                                      />
                                      <button type="submit" disabled={!(commentDraftMap[req.id]?.trim())} className="p-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg text-white transition-colors"><Send size={12} /></button>
                                    </div>
                                    {commentErrorMap[req.id] && <p className="text-red-500 text-[11px]">{commentErrorMap[req.id]}</p>}
                                  </form>
                                </div>
                              )}
                            </div>

                            {req.status === 'pending' ? (
                              <div className="space-y-3 pt-2">
                                <div>
                                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">
                                    {text('Your Feedback')} <span className="font-normal text-gray-400">({text('shown to the user')})</span>
                                  </label>
                                  <textarea
                                    value={feedbackMap[req.id] ?? ''}
                                    onChange={(e) => setFeedbackMap((prev) => ({ ...prev, [req.id]: e.target.value }))}
                                    placeholder={text('Explain your reasoning...')}
                                    rows={3}
                                    className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 outline-none focus:border-blue-400 transition-colors resize-none"
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => handleRespond(req.id, 'approved')} className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors">
                                    <CheckCircle2 size={14} /> {text('Approve')}
                                  </button>
                                  <button onClick={() => handleRespond(req.id, 'rejected')} className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors">
                                    <XCircle size={14} /> {text('Reject')}
                                  </button>
                                  <button onClick={() => deleteRequest(req.id)} className="ml-auto px-3 py-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-sm transition-colors" title={text('Delete')}>
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className={`rounded-lg px-3 py-2.5 border-l-2 ${req.status === 'approved' ? 'bg-green-50 dark:bg-green-900/10 border-green-400' : 'bg-red-50 dark:bg-red-900/10 border-red-400'}`}>
                                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1 text-gray-400">{text('Your feedback')}</p>
                                <p className="text-sm text-gray-700 dark:text-gray-300">{req.feedback || text('(no feedback given)')}</p>
                                <button onClick={() => deleteRequest(req.id)} className="mt-2 text-xs text-gray-400 hover:text-red-500 transition-colors">{text('Remove this request')}</button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
