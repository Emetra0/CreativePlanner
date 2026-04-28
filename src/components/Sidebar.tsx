import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FolderOpen, Settings, Brain, Box, Moon, Sun, Calendar, ChevronLeft, ChevronRight, LogOut, Lightbulb, CheckSquare, ClipboardList, BookOpen, GripVertical, Shield, MessageSquare, FileText, Layout, Layers } from "lucide-react";
import clsx from "clsx";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import FileTree from "./FileTree";
import { useAuthStore } from "@/store/useAuthStore";
import { usePluginStore } from "@/store/usePluginStore";
import { useSidebarOrderStore, applySidebarOrder } from "@/store/useSidebarOrderStore";
import { createPortal } from "react-dom";
import { useAppTranslation } from '@/lib/appTranslations';

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  collapseLocked?: boolean;
}

export default function Sidebar({ isCollapsed, onToggleCollapse, collapseLocked = false }: SidebarProps) {
  const location = useLocation();
  const { pathname } = location;
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { logout, user } = useAuthStore();
  const { plugins } = usePluginStore();
  const { order, setOrder } = useSidebarOrderStore();
  const [mounted, setMounted] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const { t, text } = useAppTranslation();

  const isAdmin = user?.role === 'admin';
  const fallbackTitle = text('Planner');
  const roleLabel = user?.role === 'admin' ? text('Admin') : user?.role ? text('User') : '';

  const storytellingEnabled = plugins.some(p => p.id === 'storytelling' && p.installed && p.enabled);
  const plannerEnabled = plugins.some(p => p.id === 'planner' && p.installed && p.enabled);
  const todoEnabled = plugins.some(p => p.id === 'todo-app' && p.installed && p.enabled);
  const collaboraOfficeEnabled = plugins.some(p => p.id === 'collabora-office' && p.installed && p.enabled);
  const statsEnabled = isAdmin && plugins.some(p => p.id === 'user-statistics' && p.installed && p.enabled);

  useEffect(() => { setMounted(true); }, []);

  const handleLogoutClick = () => setShowLogoutModal(true);
  const confirmLogout = () => { logout(); navigate('/login'); };

  // Build base link list (dynamic, based on installed plugins)
  const baseLinks = [
    { href: "/",            label: t('nav.dashboard'),     icon: LayoutDashboard },
    { href: "/chat",        label: t('nav.chat'),          icon: MessageSquare },
    ...(storytellingEnabled ? [{ href: "/brainstorming", label: t('nav.brainstorming'), icon: Brain }] : []),
    ...(storytellingEnabled ? [{ href: "/storytelling",  label: t('nav.storytelling'),  icon: BookOpen }] : []),
    { href: "/mindmap",     label: t('nav.mindmap'),      icon: Lightbulb },
    ...(todoEnabled    ? [{ href: "/todo",    label: t('nav.todo'),    icon: CheckSquare }]   : []),
    ...(plannerEnabled ? [{ href: "/planner", label: t('nav.planner'), icon: ClipboardList }] : []),
    { href: "/calendar",    label: t('nav.calendar'),     icon: Calendar },
    { href: "/files",       label: t('nav.files'),        icon: FolderOpen },
    ...(collaboraOfficeEnabled ? [{ href: "/documents", label: text('Documents'), icon: FileText }] : []),
    ...(collaboraOfficeEnabled ? [{ href: "/spreadsheets", label: text('Spreadsheets'), icon: Layout }] : []),
    ...(collaboraOfficeEnabled ? [{ href: "/presentations", label: text('Presentations'), icon: Layers }] : []),
    { href: "/plugins",     label: t('nav.appStore'),     icon: Box },
  ];

  const links = applySidebarOrder(baseLinks, order);

  // HTML5 drag-to-reorder
  const handleDragStart = (index: number) => { dragIndexRef.current = index; };
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };
  const handleDrop = (dropIndex: number) => {
    const fromIndex = dragIndexRef.current;
    if (fromIndex === null || fromIndex === dropIndex) { setDragOverIndex(null); return; }
    const reordered = [...links];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    setOrder(reordered.map((l) => l.href));
    dragIndexRef.current = null;
    setDragOverIndex(null);
  };
  const handleDragEnd = () => { dragIndexRef.current = null; setDragOverIndex(null); };

  return (
    <aside className={clsx(
      isCollapsed ? 'w-20' : 'w-64',
      'bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col h-screen sticky top-0 transition-all duration-300',
      collapseLocked && 'app-route-sidebar-scaled',
      collapseLocked && (isCollapsed ? 'app-route-sidebar-scaled--collapsed' : 'app-route-sidebar-scaled--expanded')
    )}>
      <div className="app-route-collapsed-sidebar__inner flex flex-1 flex-col min-h-0">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        {!isCollapsed && (
          <div className="overflow-hidden">
            <h1 className="text-xl font-bold text-primary truncate" title={user?.username || user?.email || fallbackTitle}>
              {user?.username || user?.email?.split('@')[0] || fallbackTitle}
            </h1>
            {user?.role && (
              <p className={`text-xs font-medium uppercase tracking-wider ${isAdmin ? 'text-purple-500 dark:text-purple-400' : 'text-gray-500 dark:text-gray-400'}`}>
                {roleLabel}
              </p>
            )}
          </div>
        )}
        <button onClick={onToggleCollapse} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500">
          {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto overflow-x-hidden">
        {links.map((link, index) => {
          // Hide Files link when expanded because we have the FileTree
          if (link.href === '/files' && !isCollapsed) return null;

          const Icon = link.icon;
          const isActive = pathname === link.href;
          const isDragOver = dragOverIndex === index;

          return (
            <div
              key={link.href}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={() => handleDrop(index)}
              onDragEnd={handleDragEnd}
              className={`group relative rounded-lg transition-all ${isDragOver ? 'ring-2 ring-blue-400 ring-offset-1 dark:ring-offset-gray-800' : ''}`}
            >
              <Link
                to={link.href}
                title={isCollapsed ? link.label : ''}
                className={clsx(
                  "flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors",
                  isActive
                    ? "bg-blue-50 dark:bg-blue-900/20 text-primary"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700",
                  isCollapsed && "justify-center px-2"
                )}
              >
                <Icon size={20} className="shrink-0" />
                {!isCollapsed && <span className="truncate flex-1">{link.label}</span>}
                {/* Drag handle — only when expanded */}
                {!isCollapsed && (
                  <GripVertical size={13} className="shrink-0 opacity-0 group-hover:opacity-40 cursor-grab active:cursor-grabbing text-gray-400 transition-opacity" />
                )}
              </Link>
            </div>
          );
        })}

        {/* Admin-only: User Statistics link */}
        {statsEnabled && (
          <div>
            <Link
              to="/admin"
              title={isCollapsed ? t('nav.adminPanel') : ''}
              className={clsx(
                "flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors border border-purple-200 dark:border-purple-800",
                pathname === '/admin'
                  ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400'
                  : 'text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20',
                isCollapsed && "justify-center px-2"
              )}
            >
              <Shield size={20} className="shrink-0" />
              {!isCollapsed && <span className="truncate flex-1">{t('nav.adminPanel')}</span>}
            </Link>
          </div>
        )}

        {/* File Tree Integration */}
        {!isCollapsed && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <FileTree />
          </div>
        )}
      </nav>

      <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
        {mounted && (
          <>
            <button
              onClick={handleLogoutClick}
              title={t('nav.logout')}
              className={clsx("w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors", isCollapsed && "justify-center px-2")}
            >
              <LogOut size={20} className="shrink-0" />
              {!isCollapsed && t('nav.logout')}
            </button>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? t('nav.lightMode') : t('nav.darkMode')}
              className={clsx("w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors", isCollapsed && "justify-center px-2")}
            >
              {theme === 'dark' ? <Sun size={20} className="shrink-0" /> : <Moon size={20} className="shrink-0" />}
              {!isCollapsed && (theme === 'dark' ? t('nav.lightMode') : t('nav.darkMode'))}
            </button>
          </>
        )}
        <Link
          to="/settings"
          state={{ from: `${location.pathname}${location.search}${location.hash}` }}
          title={t('nav.settings')}
          className={clsx("flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors", isCollapsed && "justify-center px-2")}
        >
          <Settings size={20} className="shrink-0" />
          {!isCollapsed && t('nav.settings')}
        </Link>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && mounted && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100000] backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm border border-gray-200 dark:border-gray-700 overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600 dark:text-red-400">
                <LogOut size={24} />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{text('Confirm Logout')}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{text('Are you sure you want to log out of your account?')}</p>
              <div className="flex gap-3 justify-center">
                <button onClick={() => setShowLogoutModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">{text('Cancel')}</button>
                <button onClick={confirmLogout} className="px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors">{t('nav.logout')}</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
      </div>
    </aside>
  );
}
