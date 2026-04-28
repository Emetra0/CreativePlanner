'use client';
import { useAuthStore } from '@/store/useAuthStore';
import { usePluginStore } from '@/store/usePluginStore';
import { useAppRequestStore } from '@/store/useAppRequestStore';
import { useInspirationStore } from '@/store/useInspirationStore';
import { useCommentModerationStore } from '@/store/useCommentModerationStore';
import { getWorkerUrl } from '@/lib/cloudSync';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  Shield, BarChart2, Package, MessageSquarePlus,
  CheckCircle2, XCircle, Clock, Users, TrendingUp, Box,
  AlertTriangle, Search, RefreshCw, Trash2, Check, X,
  RotateCcw, PenTool, Crown, MessageCircle, Ban, UserCheck,
  ChevronDown, ChevronUp, ShieldCheck, ShieldOff,
  LayoutDashboard, GitBranch, ClipboardList, CalendarDays,
  CheckSquare, FolderOpen, Lightbulb, BookOpen, Settings,
} from 'lucide-react';
import { useAppDialogs } from '@/components/AppDialogs';
import { useAppTranslation } from '@/lib/appTranslations';

type AdminTab = 'overview' | 'users' | 'comments' | 'moderation' | 'tools' | 'security';

export default function AdminPage() {
  const dialogs = useAppDialogs();
  const { text, language } = useAppTranslation();
  const { user } = useAuthStore();
  const { plugins } = usePluginStore();
  const { requests, deleteRequestComment } = useAppRequestStore();
  const { entries: inspirationEntries, deleteComment: deleteInspirationComment } = useInspirationStore();
  const { bans, banUser, unbanUser } = useCommentModerationStore();
  const navigate = useNavigate();

  const [tab, setTab] = useState<AdminTab>('overview');
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [userView, setUserView] = useState<'users' | '2fa-requests'>('users');
  const [twoFAResetRequests, setTwoFAResetRequests] = useState<any[]>([]);
  const [loadingResetRequests, setLoadingResetRequests] = useState(false);
  const [hackReports, setHackReports] = useState<any[]>([]);
  const [loadingHackReports, setLoadingHackReports] = useState(false);
  const [resetPasswordResult, setResetPasswordResult] = useState<{ reportId: string; tempPassword: string } | null>(null);
  const [commentFilter, setCommentFilter] = useState<'all' | 'inspiration' | 'suggestions'>('all');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  const formatDateTime = (value: string | number | Date, options?: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(language, options).format(typeof value === 'string' || typeof value === 'number' ? new Date(value) : value);

  useEffect(() => {
    if (user && user.role !== 'admin') navigate('/');
  }, [user, navigate]);

  useEffect(() => {
    if (tab === 'users') { fetchUsers(); fetchTwoFAResetRequests(); }
    if (tab === 'security') { fetchHackReports(); }
  }, [tab]);

  if (!user || user.role !== 'admin') return null;

  //  Stats 
  const installed = plugins.filter((p) => p.installed);
  const enabled = plugins.filter((p) => p.installed && p.enabled);
  const adminOnly = plugins.filter((p) => p.adminOnly);
  const pending = requests.filter((r) => r.status === 'pending');
  const approved = requests.filter((r) => r.status === 'approved');
  const rejected = requests.filter((r) => r.status === 'rejected');
  const uniqueRequestUsers = new Set(requests.map((r) => r.userId)).size;
  const requestedApps = requests.reduce<Record<string, number>>((acc, r) => {
    acc[r.appName] = (acc[r.appName] ?? 0) + 1; return acc;
  }, {});
  const topRequested = Object.entries(requestedApps).sort(([, a], [, b]) => b - a).slice(0, 5);

  //  Aggregated comments 
  type AggComment = {
    id: string; userId: string; userName: string; text: string;
    createdAt: string; source: 'inspiration' | 'suggestion'; sourceLabel: string;
    onDelete: () => void;
  };
  const allComments: AggComment[] = [];
  Object.values(inspirationEntries).forEach((entry: any) => {
    (entry.comments ?? []).forEach((c: any) => {
      allComments.push({
        id: c.id, userId: c.userId ?? '', userName: c.userName ?? 'Anonymous',
        text: c.text, createdAt: c.createdAt, source: 'inspiration',
        sourceLabel: entry.verseRef ?? '',
        onDelete: () => deleteInspirationComment(entry.verseRef, c.id),
      });
    });
  });
  requests.forEach((req) => {
    (req.requestComments ?? []).forEach((c: any) => {
      allComments.push({
        id: c.id, userId: c.userId, userName: c.userName,
        text: c.text, createdAt: c.createdAt, source: 'suggestion',
        sourceLabel: req.appName,
        onDelete: () => deleteRequestComment(req.id, c.id),
      });
    });
  });
  const filteredComments = allComments
    .filter((c) => commentFilter === 'all' || c.source === (commentFilter === 'inspiration' ? 'inspiration' : 'suggestion'))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const commentsByUser = filteredComments.reduce<Record<string, AggComment[]>>((acc, c) => {
    const key = c.userId || c.userName;
    if (!acc[key]) acc[key] = [];
    acc[key].push(c); return acc;
  }, {});

  //  API helpers 
  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const token = useAuthStore.getState().token;
      if (!token) return;
      const res = await fetch(`${getWorkerUrl()}/admin/users`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.users) setAdminUsers(data.users);
    } catch { } finally { setLoadingUsers(false); }
  };
  const fetchTwoFAResetRequests = async () => {
    setLoadingResetRequests(true);
    try {
      const token = useAuthStore.getState().token;
      if (!token) return;
      const res = await fetch(`${getWorkerUrl()}/admin/2fa-reset-requests`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.requests) setTwoFAResetRequests(data.requests);
    } catch { } finally { setLoadingResetRequests(false); }
  };
  const handleAdminAction = async (action: 'approve' | 'reject' | 'promote' | 'demote' | 'reset-2fa', userId: string) => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    if (action === 'reset-2fa') {
      if (!await dialogs.confirm({ title: text('Reset 2FA'), message: text('Are you sure you want to reset 2FA for this user?'), confirmLabel: text('Reset'), isDanger: true })) return;
      await fetch(`${getWorkerUrl()}/admin/reset-2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId }),
      });
      setAdminUsers((prev) => prev.map((u) => u.id === userId ? { ...u, two_factor_enabled: false } : u));
      return;
    }
    if (action === 'promote') {
      if (!await dialogs.confirm({ title: text('Promote user'), message: text('Promote this user to admin?'), confirmLabel: text('Promote') })) return;
      await fetch(`${getWorkerUrl()}/admin/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId }),
      });
      setAdminUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: 'admin' } : u));
      return;
    }
    if (action === 'demote') {
      if (!await dialogs.confirm({ title: text('Remove admin role'), message: text('Remove admin role from this user?'), confirmLabel: text('Remove'), isDanger: true })) return;
      await fetch(`${getWorkerUrl()}/admin/demote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId }),
      });
      setAdminUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: 'user' } : u));
      return;
    }
    await fetch(`${getWorkerUrl()}/admin/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId }),
    });
    fetchUsers();
  };
  const handle2FAAction = async (action: 'approve' | 'reject', requestId: string) => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    await fetch(`${getWorkerUrl()}/admin/2fa-reset-${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ requestId }),
    });
    setTwoFAResetRequests((prev) => prev.filter((r) => r.requestId !== requestId));
  };
  const fetchHackReports = async () => {
    setLoadingHackReports(true);
    try {
      const token = useAuthStore.getState().token;
      if (!token) return;
      const res = await fetch(`${getWorkerUrl()}/admin/hack-reports`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.reports) setHackReports(data.reports);
    } catch { } finally { setLoadingHackReports(false); }
  };
  const handleHackReportReset = async (reportId: string) => {
    if (!await dialogs.confirm({
      title: text('Reset password'),
      message: text('Reset this account\'s password? A temporary password will be generated.'),
      confirmLabel: text('Reset password'),
      isDanger: true,
    })) return;
    const token = useAuthStore.getState().token;
    if (!token) return;
    const res = await fetch(`${getWorkerUrl()}/admin/hack-report-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reportId }),
    });
    const data = await res.json();
    if (data.success) {
      setResetPasswordResult({ reportId, tempPassword: data.tempPassword });
      setHackReports((prev) => prev.filter((r) => r.reportId !== reportId));
    }
  };
  const handleHackReportDismiss = async (reportId: string) => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    await fetch(`${getWorkerUrl()}/admin/hack-report-dismiss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reportId }),
    });
    setHackReports((prev) => prev.filter((r) => r.reportId !== reportId));
  };

  const handleEditEmail = async (userId: string, currentEmail: string) => {
    const newEmail = await dialogs.prompt({
      title: text('Edit user email'),
      message: text('Enter a new email address for this user.'),
      label: text('Email address'),
      initialValue: currentEmail,
      placeholder: text('name@example.com'),
      submitLabel: text('Save email'),
    });
    if (!newEmail || newEmail === currentEmail) return;
    const token = useAuthStore.getState().token;
    if (!token) return;
    await fetch(`${getWorkerUrl()}/admin/update-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId, email: newEmail }),
    });
    setAdminUsers((prev) => prev.map((u) => u.id === userId ? { ...u, email: newEmail } : u));
  };

  //  UI helpers 
  const StatCard = ({ label, value, sub, icon: Icon, accent }: { label: string; value: number | string; sub?: string; icon: any; accent: string }) => (
    <div className={`bg-white dark:bg-gray-800 rounded-xl border ${accent} p-5 flex items-start gap-4`}>
      <div className="p-2.5 rounded-lg bg-gray-100 dark:bg-gray-700">
        <Icon size={20} className="text-gray-600 dark:text-gray-300" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );

  const TabBtn = ({ id, label, icon: Icon, badge }: { id: AdminTab; label: string; icon: any; badge?: number }) => (
    <button
      onClick={() => setTab(id)}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === id ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}
    >
      <Icon size={14} /> {label}
      {badge != null && badge > 0 && (
        <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">{badge}</span>
      )}
    </button>
  );

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 overflow-hidden">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-8 py-4 shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg text-purple-600 dark:text-purple-400">
              <Shield size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800 dark:text-white">{text('Admin Panel')}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">{text('Platform management visible only to admins')}</p>
            </div>
          </div>
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-700/60 p-1 rounded-xl flex-wrap">
            <TabBtn id="overview"   label={text('Overview')}   icon={BarChart2} />
            <TabBtn id="users"      label={text('Users')}      icon={Users} />
            <TabBtn id="comments"   label={text('Comments')}   icon={MessageCircle} badge={allComments.length} />
            <TabBtn id="moderation" label={text('Moderation')} icon={Shield} badge={bans.length} />
            <TabBtn id="tools"      label={text('Tools')}      icon={LayoutDashboard} />
            <TabBtn id="security"   label={text('Security')}   icon={AlertTriangle} badge={hackReports.length} />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">

        {/*  OVERVIEW  */}
        {tab === 'overview' && (
          <div className="p-8 space-y-10 max-w-6xl mx-auto">
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
                <MessageSquarePlus size={13} /> {text('App Suggestions')}
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label={text('Total')}    value={requests.length} icon={MessageSquarePlus} accent="border-gray-200 dark:border-gray-700" sub={text('from {{count}} {{users}}', { count: String(uniqueRequestUsers), users: uniqueRequestUsers !== 1 ? text('users') : text('user') })} />
                <StatCard label={text('Pending')}  value={pending.length}  icon={Clock}             accent="border-amber-300 dark:border-amber-700" />
                <StatCard label={text('Approved')} value={approved.length} icon={CheckCircle2}      accent="border-green-300 dark:border-green-700" />
                <StatCard label={text('Rejected')} value={rejected.length} icon={XCircle}           accent="border-red-300 dark:border-red-700" />
              </div>
              {pending.length > 0 && (
                <div className="mt-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-3 flex items-center gap-1.5">
                    <AlertTriangle size={13} /> {text('{{count}} {{requests}} awaiting your response', { count: String(pending.length), requests: pending.length !== 1 ? text('requests') : text('request') })}
                  </p>
                  <div className="space-y-2">
                    {pending.map((req) => (
                      <div key={req.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium text-gray-800 dark:text-gray-200">{req.appName}</span>
                        <span className="text-xs text-gray-500">{req.userEmail}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => navigate('/plugins')} className="mt-3 text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline">
                    {text('Go to App Store to respond')}
                  </button>
                </div>
              )}
              {topRequested.length > 0 && (
                <div className="mt-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                    <TrendingUp size={14} className="text-blue-500" /> {text('Most Suggested Apps')}
                  </h3>
                  <div className="space-y-2">
                    {topRequested.map(([name, count]) => (
                      <div key={name} className="flex items-center gap-3">
                        <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">{name}</span>
                        <div className="h-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-full w-24">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, (count / (topRequested[0]?.[1] ?? 1)) * 100)}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-gray-500 w-6 text-right">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
                <Package size={13} /> {text('Plugin Adoption')}
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label={text('Catalogue')}  value={plugins.length}    icon={Box}       accent="border-gray-200 dark:border-gray-700" />
                <StatCard label={text('Installed')}  value={installed.length}  icon={Package}   accent="border-blue-300 dark:border-blue-700" />
                <StatCard label={text('Enabled')}    value={enabled.length}    icon={BarChart2} accent="border-green-300 dark:border-green-700" />
                <StatCard label={text('Admin-Only')} value={adminOnly.length}  icon={Shield}    accent="border-purple-300 dark:border-purple-700" />
              </div>
              <div className="mt-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{text('Plugin Status')}</p>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {plugins.map((p) => (
                    <div key={p.id} className="flex items-center gap-4 px-5 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{p.name}</p>
                        {p.adminOnly && <span className="text-[10px] text-purple-500 font-medium">{text('Admin only')}</span>}
                      </div>
                      {p.installed ? (
                        p.enabled
                          ? <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">{text('Enabled')}</span>
                          : <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 font-medium">{text('Disabled')}</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-50 dark:bg-gray-800 text-gray-400 border border-gray-200 dark:border-gray-700 font-medium">{text('Not installed')}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}

        {/*  USERS  */}
        {tab === 'users' && (
          <div className="p-8 max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex gap-2">
                <button onClick={() => setUserView('users')} className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${userView === 'users' ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                  {text('User Accounts')}
                </button>
                <button onClick={() => setUserView('2fa-requests')} className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${userView === '2fa-requests' ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                  {text('2FA Reset Requests')}
                  {twoFAResetRequests.length > 0 && <span className="bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{twoFAResetRequests.length}</span>}
                </button>
              </div>
              <button onClick={() => { fetchUsers(); fetchTwoFAResetRequests(); }} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" title={text('Refresh')}>
                <RefreshCw size={16} />
              </button>
            </div>

            {userView === 'users' && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                    <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={text('Search by name or email')}
                      className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:border-blue-400" />
                  </div>
                </div>
                {loadingUsers ? (
                  <p className="text-center text-gray-400 py-10 text-sm">{text('Loading users')}</p>
                ) : adminUsers.length === 0 ? (
                  <p className="text-center text-gray-400 py-10 text-sm italic">{text('No users found. Backend may be offline in local dev.')}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30">
                          <th className="px-5 py-3 font-semibold text-gray-500">{text('User')}</th>
                          <th className="px-5 py-3 font-semibold text-gray-500">{text('Status')}</th>
                          <th className="px-5 py-3 font-semibold text-gray-500">{text('2FA')}</th>
                          <th className="px-5 py-3 font-semibold text-gray-500">{text('Tier')}</th>
                          <th className="px-5 py-3 font-semibold text-gray-500 text-right">{text('Actions')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {adminUsers
                          .filter((u) => u.username?.toLowerCase().includes(searchQuery.toLowerCase()) || u.email?.toLowerCase().includes(searchQuery.toLowerCase()))
                          .map((u) => (
                            <tr key={u.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 ${u.is_bootstrap ? 'bg-amber-50/40 dark:bg-amber-900/10' : ''}`}>
                              <td className="px-5 py-3">
                                <p className="font-medium text-gray-900 dark:text-white flex items-center gap-2 flex-wrap">
                                  {u.username || text('No username')}
                                  {u.is_bootstrap && <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-bold uppercase tracking-wide border border-amber-200">{text('Bootstrap')}</span>}
                                  {!u.is_bootstrap && u.role === 'admin' && <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-bold uppercase tracking-wide border border-purple-200">{text('Admin')}</span>}
                                </p>
                                <p className="text-xs text-gray-500">{u.email}</p>
                                {u.backup_email && <p className="text-xs text-gray-400">{text('Backup:')} {u.backup_email}</p>}
                              </td>
                              <td className="px-5 py-3">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.status === 'active' ? 'bg-green-100 text-green-700' : u.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>{text(u.status)}</span>
                              </td>
                              <td className="px-5 py-3">
                                {(u.two_factor_enabled || u.twoFactorEnabled)
                                  ? <span className="flex items-center gap-1 text-xs text-green-600"><Check size={12} /> {text('On')}</span>
                                  : <span className="text-xs text-gray-400">{text('Off')}</span>}
                              </td>
                              <td className="px-5 py-3">
                                <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium w-fit ${(u.subscription_tier || 'free') === 'pro' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                                  {(u.subscription_tier || 'free') === 'pro' && <Crown size={10} />}
                                  {text(u.subscription_tier || 'free')}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {!u.is_bootstrap && <button onClick={() => handleEditEmail(u.id, u.email)} className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded" title={text('Edit email')}><PenTool size={14} /></button>}
                                  <button onClick={() => handleAdminAction('reset-2fa', u.id)} className="p-1.5 text-orange-500 hover:bg-orange-50 rounded" title={text('Reset 2FA')}><RotateCcw size={14} /></button>
                                  {!u.is_bootstrap && u.status === 'pending' && <button onClick={() => handleAdminAction('approve', u.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded" title={text('Approve')}><Check size={14} /></button>}
                                  {!u.is_bootstrap && u.id !== user?.id && u.role !== 'admin' && (
                                    <button onClick={() => handleAdminAction('promote', u.id)} className="p-1.5 text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded" title={text('Make admin')}><ShieldCheck size={14} /></button>
                                  )}
                                  {!u.is_bootstrap && u.id !== user?.id && u.role === 'admin' && (
                                    <button onClick={() => handleAdminAction('demote', u.id)} className="p-1.5 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded" title={text('Remove admin')}><ShieldOff size={14} /></button>
                                  )}
                                  {!u.is_bootstrap && <button onClick={() => handleAdminAction('reject', u.id)} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" title={text('Delete / reject')}><X size={14} /></button>}
                                  {u.is_bootstrap && <button onClick={async () => {
                                    if (await dialogs.confirm({ title: text('Remove bootstrap admin'), message: text('Remove bootstrap admin?'), confirmLabel: text('Remove'), isDanger: true })) {
                                      handleAdminAction('reject', u.id);
                                    }
                                  }} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded" title={text('Remove bootstrap')}><Trash2 size={14} /></button>}
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {userView === '2fa-requests' && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{text('2FA Reset Requests')}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{text("Verify the user's backup email before approving.")}</p>
                </div>
                {loadingResetRequests ? (
                  <p className="text-center text-gray-400 py-10 text-sm">{text('Loading...')}</p>
                ) : twoFAResetRequests.length === 0 ? (
                  <p className="text-center text-gray-400 py-10 text-sm italic">{text('No pending requests.')}</p>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {twoFAResetRequests.map((r) => (
                      <div key={r.requestId} className="flex items-center justify-between gap-4 px-5 py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{r.email}</p>
                          <p className="text-xs text-gray-500">{text('Backup:')} {r.backupEmail}</p>
                          <p className="text-xs text-gray-400">{formatDateTime(r.submittedAt)}</p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button onClick={() => handle2FAAction('approve', r.requestId)} className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium">{text('Approve')}</button>
                          <button onClick={() => handle2FAAction('reject', r.requestId)} className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">{text('Reject')}</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/*  COMMENTS  */}
        {tab === 'comments' && (
          <div className="p-8 max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-800 dark:text-white">{text('All Comments Overview')}</h2>
                <p className="text-sm text-gray-500 mt-0.5">{allComments.length} {text(allComments.length === 1 ? 'comment' : 'comments')} {text('total. Click a user row to see their history.')}</p>
              </div>
              <div className="flex gap-2">
                {(['all', 'inspiration', 'suggestions'] as const).map((f) => (
                  <button key={f} onClick={() => setCommentFilter(f)}
                    className={`px-3 py-1.5 text-xs rounded-lg font-medium capitalize transition-colors ${commentFilter === f ? 'bg-blue-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                    {f === 'all' ? text('All') : f === 'inspiration' ? text('Daily Inspiration') : text('App Suggestions')}
                  </button>
                ))}
              </div>
            </div>

            {Object.keys(commentsByUser).length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm">{text('No comments yet.')}</div>
            ) : (
              <div className="space-y-4">
                {Object.entries(commentsByUser).map(([userId, comments]) => {
                  const rep = comments[0];
                  const isBanned = bans.some((b) => b.userId === userId);
                  const isExpanded = expandedUser === userId;
                  return (
                    <div key={userId} className={`bg-white dark:bg-gray-800 rounded-xl border overflow-hidden ${isBanned ? 'border-red-200 dark:border-red-800' : 'border-gray-200 dark:border-gray-700'}`}>
                      <button onClick={() => setExpandedUser(isExpanded ? null : userId)}
                        className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{rep.userName}</span>
                            {isBanned && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-semibold flex items-center gap-1"><Ban size={9} /> {text('Banned from commenting')}</span>}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">{comments.length} {text(comments.length === 1 ? 'comment' : 'comments')}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {!isBanned ? (
                            <button onClick={async (e) => {
                              e.stopPropagation();
                              if (await dialogs.confirm({ title: text('Ban user'), message: `${text('Ban')} ${rep.userName} ${text('from commenting?')}`, confirmLabel: text('Ban'), isDanger: true })) {
                                banUser(userId, rep.userName, 'Admin action');
                              }
                            }}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                              <Ban size={11} /> {text('Ban')}
                            </button>
                          ) : (
                            <button onClick={(e) => { e.stopPropagation(); unbanUser(userId); }}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors">
                              <UserCheck size={11} /> {text('Unban')}
                            </button>
                          )}
                          {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="border-t border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                          {comments.map((c) => (
                            <div key={c.id} className="flex items-start gap-3 px-5 py-3 group/c">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${c.source === 'inspiration' ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400' : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'}`}>
                                    {c.source === 'inspiration' ? ` ${text('Daily Inspiration')}` : ` ${text('App Suggestion')}`}
                                  </span>
                                  <span className="text-xs text-gray-400 truncate">{c.sourceLabel}</span>
                                </div>
                                <p className="text-sm text-gray-700 dark:text-gray-300">{c.text}</p>
                                <p className="text-[10px] text-gray-400 mt-1">{formatDateTime(c.createdAt, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                              </div>
                              <button onClick={async () => {
                                if (await dialogs.confirm({ title: text('Delete comment'), message: text('Delete this comment?'), confirmLabel: text('Delete'), isDanger: true })) {
                                  c.onDelete();
                                }
                              }}
                                className="p-1.5 text-gray-300 hover:text-red-500 opacity-0 group-hover/c:opacity-100 transition-all shrink-0 mt-0.5" title={text('Delete comment')}>
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/*  MODERATION  */}
        {tab === 'moderation' && (
          <div className="p-8 max-w-4xl mx-auto space-y-8">
            <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-3 flex items-center gap-2">
                <Shield size={18} className="text-blue-500" /> {text('Community Safety Policy')}
              </h2>
              <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex items-start gap-2"><CheckCircle2 size={14} className="text-green-500 mt-0.5 shrink-0" /><p>{text('All comments are automatically screened for profanity and harmful language before posting.')}</p></div>
                <div className="flex items-start gap-2"><CheckCircle2 size={14} className="text-green-500 mt-0.5 shrink-0" /><p>{text('Links to adult-content or harmful websites are blocked from comments.')}</p></div>
                <div className="flex items-start gap-2"><CheckCircle2 size={14} className="text-green-500 mt-0.5 shrink-0" /><p>{text('Comments containing put-downs, insults, or hateful language are rejected instantly.')}</p></div>
                <div className="flex items-start gap-2"><CheckCircle2 size={14} className="text-green-500 mt-0.5 shrink-0" /><p>{text('Admins can ban users from commenting at any time from the Comments tab above.')}</p></div>
                <div className="flex items-start gap-2"><AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" /><p>{text('Bans are stored locally. In a multi-user backend, these would sync to the server.')}</p></div>
              </div>
            </section>
            <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    <Ban size={16} className="text-red-500" /> {text('Commenting Bans')}
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">{text('Users listed here cannot post new comments anywhere in the app.')}</p>
                </div>
                {bans.length > 0 && <span className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-xs font-bold px-2.5 py-1 rounded-full">{bans.length} {text('banned')}</span>}
              </div>
              {bans.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">{text('No users are currently banned from commenting.')}</div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {bans.map((ban) => (
                    <div key={ban.userId} className="flex items-center justify-between gap-4 px-6 py-4">
                      <div>
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{ban.userName}</p>
                        <p className="text-xs text-gray-400">ID: {ban.userId}</p>
                        <p className="text-xs text-gray-400">{text('Banned')} {formatDateTime(ban.bannedAt, { month: 'short', day: 'numeric', year: 'numeric' })}{ban.reason ? `  ${ban.reason}` : ''}</p>
                      </div>
                      <button onClick={() => unbanUser(ban.userId)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors">
                        <UserCheck size={12} /> {text('Unban')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {tab === 'tools' && (
          <div className="p-8 max-w-5xl mx-auto">
            <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-1">{text('User Tools')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{text('Access all user-facing tools directly from the admin panel.')}</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {([
                { href: '/',              label: 'Dashboard',    icon: LayoutDashboard, desc: 'Daily overview' },
                { href: '/mindmap',       label: 'Mindmap',      icon: GitBranch,       desc: 'Mind mapping' },
                { href: '/planner',       label: 'Planner',      icon: ClipboardList,   desc: 'Plan & track time' },
                { href: '/calendar',      label: 'Calendar',     icon: CalendarDays,    desc: 'Schedule events' },
                { href: '/todo',          label: 'Todo',         icon: CheckSquare,     desc: 'Task management' },
                { href: '/files',         label: 'Files',        icon: FolderOpen,      desc: 'File manager' },
                { href: '/plugins',       label: 'App Store',    icon: Package,         desc: 'Manage apps' },
                { href: '/brainstorming', label: 'Brainstorming',icon: Lightbulb,       desc: 'Creative prompts' },
                { href: '/storytelling',  label: 'Storytelling', icon: BookOpen,        desc: 'Story builder' },
                { href: '/settings',      label: 'Settings',     icon: Settings,        desc: 'User settings' },
              ] as { href: string; label: string; icon: React.ElementType; desc: string }[]).map(({ href, label, icon: Icon, desc }) => (
                <button
                  key={href}
                  onClick={() => navigate(href)}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 text-left hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all group"
                >
                  <Icon size={22} className="text-blue-500 mb-3 group-hover:text-blue-600 transition-colors" />
                  <p className="text-sm font-semibold text-gray-800 dark:text-white">{text(label)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{text(desc)}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'security' && (
          <div className="p-8 max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-gray-800 dark:text-white">{text('Security Reports')}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{text('Accounts reported as potentially hacked or compromised')}</p>
              </div>
              <button onClick={fetchHackReports} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
                <RefreshCw size={14} className={loadingHackReports ? 'animate-spin' : ''} /> {text('Refresh')}
              </button>
            </div>

            {resetPasswordResult && (
              <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-xl">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-green-700 dark:text-green-400">{text('Password Reset Successfully')}</p>
                    <p className="text-xs text-green-600 dark:text-green-500 mt-1">{text('Temporary password for the account:')}</p>
                    <p className="mt-2 font-mono text-base bg-green-100 dark:bg-green-900/40 px-3 py-1.5 rounded-lg inline-block text-green-800 dark:text-green-300 select-all">{resetPasswordResult.tempPassword}</p>
                    <p className="text-[11px] text-green-500 mt-1">{text('Share this with the account owner through a secure channel. All sessions have been invalidated.')}</p>
                  </div>
                  <button onClick={() => setResetPasswordResult(null)} className="text-green-500 hover:text-green-700 mt-0.5"><X size={16} /></button>
                </div>
              </div>
            )}

            {loadingHackReports ? (
              <div className="flex items-center justify-center h-32 text-gray-400">
                <RefreshCw size={18} className="animate-spin mr-2" /> {text('Loading reports...')}
              </div>
            ) : hackReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-400 gap-2">
                <Shield size={28} strokeWidth={1} />
                <p className="text-sm">{text('No pending security reports')}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {hackReports.map((report) => (
                  <div key={report.reportId} className="bg-white dark:bg-gray-800 rounded-xl border border-amber-200 dark:border-amber-700/50 p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                          <span className="text-sm font-semibold text-gray-800 dark:text-white truncate">{report.accountEmail}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                          <span><strong className="text-gray-600 dark:text-gray-300">{text('Backup email:')}</strong> {report.backupEmail}</span>
                          <span><strong className="text-gray-600 dark:text-gray-300">{text('Submitted:')}</strong> {formatDateTime(report.submittedAt)}</span>
                        </div>
                        {report.description && (
                          <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/40 rounded-lg p-2.5">{report.description}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        <button
                          onClick={() => handleHackReportReset(report.reportId)}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium"
                        >
                          <RotateCcw size={12} /> {text('Reset Password')}
                        </button>
                        <button
                          onClick={() => handleHackReportDismiss(report.reportId)}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-lg"
                        >
                          <XCircle size={12} /> {text('Dismiss')}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}