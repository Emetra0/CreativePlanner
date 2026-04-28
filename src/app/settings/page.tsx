import { useTheme } from "next-themes";
import { Moon, Sun, Monitor, Keyboard, PenTool, Lightbulb, Cloud, User, Shield, Check, X, Crown, Smartphone, QrCode, Search, RefreshCw, Mail, AlertTriangle, FileText, Trash2, RotateCcw, Camera, Palette, Upload, Link2, Type, Languages, ClipboardList, ArrowLeft } from "lucide-react";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useChatStore } from "@/store/useChatStore";
import { useState, useEffect, useRef, useMemo, useDeferredValue, useCallback } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { getWorkerUrl } from "@/lib/cloudSync";
import { APP_LANGUAGE_OPTIONS } from '@/lib/appLanguages';
import QRCode from 'qrcode';
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAppDialogs } from '@/components/AppDialogs';
import { Modal, ConfirmModal } from '@/components/Modal';
import ColorPicker from '@/components/ColorPicker';
import FontPickerPanel, { type FontPickerSection } from '@/components/FontPickerPanel';
import { useAppTranslation } from '@/lib/appTranslations';
import { BUILT_IN_FONT_PRESETS, DEFAULT_FONT_ID, buildCustomFontCssFamily, getFallbackFontChoice, inferFontFormat, resolveFontChoice } from '@/lib/fontSettings';
import { KEYBIND_DEFINITIONS, KEYBIND_SECTION_META, KEYBIND_SECTION_ORDER, formatKeybindCombo, formatKeybindKey, formatKeybindModifier, getKeybindDefinition, isModifierOnlyKey, normalizeKeybindKey } from '@/lib/keybinds';

interface LocalMachineFont {
    family: string;
    fullName: string;
    postscriptName?: string;
}

type LocalFontApiEntry = {
    family: string;
    fullName?: string;
    postscriptName?: string;
};

type FontBrowserSectionId = 'defaults' | 'saved' | 'installed';

type SettingsSectionId = 'section-theme' | 'section-fonts' | 'section-language' | 'section-cloud' | 'section-mindmap';

interface FontBrowserOption {
    id: string;
    label: string;
    description: string;
    previewFamily: string;
    section: FontBrowserSectionId;
}

function buildInstalledFontPreviewFamily(fontFamily: string) {
    return `'${fontFamily.replace(/'/g, "\\'")}', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
}

function normalizeSettingsSection(section: string | null | undefined): SettingsSectionId | 'section-account' {
    if (!section) return 'section-theme';
    if (section === 'section-appearance') return 'section-theme';
    if (section === 'section-account') return 'section-account';
    if (section === 'section-theme' || section === 'section-fonts' || section === 'section-language' || section === 'section-cloud' || section === 'section-mindmap') {
        return section;
    }
    if (section.startsWith('section-keybind-')) return 'section-mindmap';
    return 'section-theme';
}

export default function SettingsPage() {
    const dialogs = useAppDialogs();
    const { language, t, text } = useAppTranslation();
  const { theme, setTheme } = useTheme();
    const {
        autoSave,
        setAutoSave,
        appLanguage,
        setAppLanguage,
        keybinds,
        setKeybind,
        resetKeybinds,
        appFontId,
        setAppFontId,
        customFonts,
        addCustomFont,
        removeCustomFont,
        wordExportDefaults,
        setWordExportDefaults,
    } = useSettingsStore();
  const { user, isAuthenticated, updateUser } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollingRef = useRef(false);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'general' | 'admin'>('profile');
    const [activeSection, setActiveSection] = useState<string>('section-theme');
  const [searchParams] = useSearchParams();
    const location = useLocation();
    const navigate = useNavigate();
  
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Profile state
  const [newAbout, setNewAbout] = useState('');
  const [bannerColorInput, setBannerColorInput] = useState('#6366f1');
    const [bannerImagePreview, setBannerImagePreview] = useState<string | null>(null);
    const [showBannerOptionsModal, setShowBannerOptionsModal] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
    const bannerImageInputRef = useRef<HTMLInputElement>(null);
    const customFontInputRef = useRef<HTMLInputElement>(null);
  const [selectedPresence, setSelectedPresence] = useState<'online' | 'idle' | 'busy' | 'offline'>('online');
    const [customFontName, setCustomFontName] = useState('');
    const [customFontUrl, setCustomFontUrl] = useState('');
        const [fontSearchQuery, setFontSearchQuery] = useState('');

  // 2FA State
  const [twoFactorSetup, setTwoFactorSetup] = useState<{ secret: string, uri: string, qr: string } | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [showTwoFactorSetup, setShowTwoFactorSetup] = useState(false);

  // Admin State
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
    const [settingsNavQuery, setSettingsNavQuery] = useState('');
  const [adminView, setAdminView] = useState<'users' | 'reports' | '2fa-requests'>('users');
  const [twoFAResetRequests, setTwoFAResetRequests] = useState<any[]>([]);
  const [loadingResetRequests, setLoadingResetRequests] = useState(false);
    const [reports, setReports] = useState<any[]>([]);
    const [loadingReports, setLoadingReports] = useState(false);
    
    // Helper to check 2FA status — reads canonical boolean from backend-synced store.
    // Handles all representations the DB or network might return (bool, 0/1, strings).
    const isTwoFactorEnabled = Boolean(
        user?.two_factor_enabled ||
        user?.twoFactorEnabled
    );
  
  // Modal States
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [changeField, setChangeField] = useState<'username' | 'email' | 'password' | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any>(null);
    const [localMachineFonts, setLocalMachineFonts] = useState<LocalMachineFont[]>([]);
    const [localFontStatus, setLocalFontStatus] = useState<'idle' | 'loading' | 'ready' | 'unsupported' | 'denied' | 'error'>('idle');
    const [localFontError, setLocalFontError] = useState('');
        const [pendingAppFontId, setPendingAppFontId] = useState(appFontId);
    const deferredFontSearchQuery = useDeferredValue(fontSearchQuery);
        const deferredSettingsNavQuery = useDeferredValue(settingsNavQuery);
    const fallbackFontChoice = useMemo(() => getFallbackFontChoice(DEFAULT_FONT_ID), []);
    const selectedAppFont = useMemo(() => resolveFontChoice(appFontId, customFonts), [appFontId, customFonts]);
        const pendingAppFont = useMemo(() => resolveFontChoice(pendingAppFontId, customFonts), [customFonts, pendingAppFontId]);
        const hasPendingAppFontChange = pendingAppFontId !== appFontId;
    const supportsLocalFontDiscovery = mounted && typeof window !== 'undefined' && 'queryLocalFonts' in window;
    const discoveredInstalledFontOptions = useMemo<FontBrowserOption[]>(() => {
        const savedFamilies = new Set(customFonts.map((font) => font.cssFamily.toLowerCase()));

        return localMachineFonts
            .filter((font) => !savedFamilies.has(font.family.toLowerCase()))
            .map((font) => ({
                id: `installed-font::${encodeURIComponent(font.family)}`,
                label: font.fullName,
                description: text('Available on this device'),
                previewFamily: buildInstalledFontPreviewFamily(font.family),
                section: 'installed' as const,
            }));
    }, [customFonts, localMachineFonts, text]);
    const savedFontOptions = useMemo<FontBrowserOption[]>(() => customFonts.map((font) => ({
        id: font.id,
        label: font.name,
        description: font.source === 'local'
            ? text('Saved for this device')
            : font.source === 'url'
            ? text('Added from URL')
            : text('Uploaded font'),
        previewFamily: buildCustomFontCssFamily(font),
        section: 'saved' as const,
    })), [customFonts, text]);
    const builtInFontOptions = useMemo<FontBrowserOption[]>(() => BUILT_IN_FONT_PRESETS.map((font) => ({
        id: font.id,
        label: font.label,
        description: text('Works across the app and exports'),
        previewFamily: font.cssFamily,
        section: 'defaults' as const,
    })), [text]);
    const normalizedFontSearchQuery = deferredFontSearchQuery.trim().toLowerCase();
    const fontBrowserSections = useMemo(() => {
        const matchesQuery = (option: FontBrowserOption) => {
            if (!normalizedFontSearchQuery) return true;
            return `${option.label} ${option.description}`.toLowerCase().includes(normalizedFontSearchQuery);
        };

        return [
            {
                id: 'defaults' as const,
                title: text('Default Fonts'),
                emptyMessage: normalizedFontSearchQuery ? text('No default fonts match this search.') : text('Default fonts appear here.'),
                items: builtInFontOptions.filter(matchesQuery),
            },
            {
                id: 'saved' as const,
                title: text('Fonts'),
                emptyMessage: normalizedFontSearchQuery ? text('No added fonts match this search.') : text('Uploaded, linked, and saved device fonts appear here.'),
                items: savedFontOptions.filter(matchesQuery),
            },
            {
                id: 'installed' as const,
                title: text('Installed On This Device'),
                emptyMessage: normalizedFontSearchQuery ? text('No installed fonts match this search yet.') : text('Use installed font discovery to browse fonts from this device.'),
                items: discoveredInstalledFontOptions.filter(matchesQuery),
            },
        ];
    }, [builtInFontOptions, discoveredInstalledFontOptions, normalizedFontSearchQuery, savedFontOptions, text]);
    const fontBrowserPanelSections = useMemo<FontPickerSection[]>(() => (
        fontBrowserSections.map((section) => ({
            id: section.id,
            title: section.title,
            emptyMessage: section.id === 'installed' && !supportsLocalFontDiscovery
                ? text('Installed font discovery needs browser support for the Local Font Access API.')
                : section.emptyMessage,
            items: section.items.map((item) => ({
                id: item.id,
                label: item.label,
                description: item.description,
                previewFamily: item.previewFamily,
            })),
        }))
    ), [fontBrowserSections, supportsLocalFontDiscovery, text]);
    const visibleFontOptionCount = fontBrowserSections.reduce((total, section) => total + section.items.length, 0);
    const settingsNavigationItems = useMemo(() => [
        { id: 'section-theme' as const, label: t('settings.appearance'), keywords: 'theme light dark system appearance' },
        { id: 'section-fonts' as const, label: t('settings.appFonts'), keywords: 'font fonts typography device installed local pdf word export' },
        { id: 'section-language' as const, label: t('settings.language'), keywords: 'language languages translate translation locale' },
        { id: 'section-cloud' as const, label: t('settings.cloudStorage'), keywords: 'cloud sync autosave storage' },
        { id: 'section-mindmap' as const, label: t('settings.keybinds'), keywords: 'keybinds keyboard shortcuts hotkeys' },
    ], [t]);
    const normalizedSettingsNavQuery = deferredSettingsNavQuery.trim().toLowerCase();
    const visibleSettingsNavigationItems = useMemo(() => {
        if (!normalizedSettingsNavQuery) return settingsNavigationItems;

        return settingsNavigationItems.filter((item) => `${item.label} ${item.keywords}`.toLowerCase().includes(normalizedSettingsNavQuery));
    }, [normalizedSettingsNavQuery, settingsNavigationItems]);
    const selectedFontStatusLabel = selectedAppFont.source === 'built-in'
        ? text('Default font')
        : selectedAppFont.localOnly
        ? text('This device')
        : text('Added font');
    const pendingFontStatusLabel = pendingAppFont.source === 'built-in'
        ? text('Safe everywhere')
        : pendingAppFont.localOnly
        ? text('This device only')
        : text('Custom app font');
    const selectedWordExportFont = useMemo(
        () => BUILT_IN_FONT_PRESETS.find((font) => font.id === wordExportDefaults.fontId) || BUILT_IN_FONT_PRESETS[0],
        [wordExportDefaults.fontId],
    );
        const previousLocation = (location.state as { from?: string } | null)?.from;
    const recommendedWordExportFont = useMemo(
        () => BUILT_IN_FONT_PRESETS.find((font) => font.id === appFontId) || BUILT_IN_FONT_PRESETS[0],
        [appFontId],
    );
    const formatSettingsDateTime = useCallback(
        (value: string | number | Date) => new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)),
        [language],
    );
    // Clear message after a short delay so status updates do not linger.
  useEffect(() => {
    if (message.text) {
      const timer = setTimeout(() => {
        setMessage({ type: '', text: '' });
            }, 2400);
      return () => clearTimeout(timer);
    }
  }, [message]);

  useEffect(() => {
    if (!APP_LANGUAGE_OPTIONS.some((option) => option.value === appLanguage)) {
      setAppLanguage('en');
    }
  }, [appLanguage, setAppLanguage]);

  useEffect(() => {
    setMounted(true);
    
    // Refresh user data (especially for 2FA status)
    if (isAuthenticated) {
        const fetchUser = async () => {
             const token = useAuthStore.getState().token;
             if (!token) return;
             try {
                // Add timestamp to prevent caching
                // Backend endpoint is /me (not /auth/me)
                const res = await fetch(`${getWorkerUrl()}/me?t=${Date.now()}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.user) {
                        console.log("Refreshed user data:", data.user);
                        // Normalise the 2FA status to boolean from whatever the DB returned (0/1/bool)
                        const isEnabled = Boolean(data.user.two_factor_enabled || data.user.twoFactorEnabled);
                        const mergedUser = { 
                            ...useAuthStore.getState().user, 
                            ...data.user,
                            two_factor_enabled: isEnabled,
                            twoFactorEnabled: isEnabled
                        };
                        updateUser(mergedUser);
                    }
                }
             } catch(e) { console.error("Refresh user failed", e); }
        };
        fetchUser();
    }
  }, [isAuthenticated]);

    useEffect(() => {
        setPendingAppFontId(appFontId);
    }, [appFontId]);

    useEffect(() => {
        const availableFontIds = new Set([
            ...BUILT_IN_FONT_PRESETS.map((font) => font.id),
            ...customFonts.map((font) => font.id),
        ]);

        if (!availableFontIds.has(pendingAppFontId)) {
            setPendingAppFontId(appFontId);
        }
    }, [appFontId, customFonts, pendingAppFontId]);

  const scrollToSection = (id: string, tab: 'profile' | 'general' | 'admin' = 'general') => {
    setActiveTab(tab);
    setActiveSection(id);          // force highlight immediately
    scrollingRef.current = true;   // suppress observer during animation
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // unblock observer after scroll animation finishes (~700ms)
      scrollTimerRef.current = setTimeout(() => {
        scrollingRef.current = false;
      }, 700);
    }, 50);
  };

  // Sync profile state from user store
  useEffect(() => {
    if (user) {
      setNewAbout(user.about || '');
      setBannerColorInput(user.banner_color || '#6366f1');
            setBannerImagePreview((user as any).banner_image || null);
      setAvatarPreview(user.avatar_url || null);
      const pres = user.presence as 'online' | 'idle' | 'busy' | 'offline' | null | undefined;
      setSelectedPresence(pres && ['online','idle','busy','offline'].includes(pres) ? pres : 'online');
    }
    }, [user?.id, user?.about, user?.banner_color, (user as any)?.banner_image, user?.avatar_url, user?.presence]);

  // Auto-open 2FA setup if requested
  useEffect(() => {
    if (searchParams.get('setup2fa') === 'true') {
        setActiveTab('profile');
        setTimeout(() => scrollToSection('section-account', 'profile'), 150);
    }
  }, [searchParams]);

    useEffect(() => {
        const section = searchParams.get('section');
        if (!section) return;

        const normalizedSection = normalizeSettingsSection(section);
        const targetTab = normalizedSection === 'section-account' ? 'profile' : 'general';
        setTimeout(() => scrollToSection(normalizedSection, targetTab), 150);
    }, [searchParams]);

  useEffect(() => {
      if (searchParams.get('setup2fa') === 'true' && activeTab === 'profile' && user && !user.two_factor_enabled && !showTwoFactorSetup && !setupLoading) {
          // Small delay to ensure UI is ready
          const timer = setTimeout(() => {
             handleSetup2FA();
          }, 500);
          return () => clearTimeout(timer);
      }
  }, [searchParams, activeTab, user, showTwoFactorSetup, setupLoading]);

  useEffect(() => {
      if (activeTab === 'admin' && user?.role === 'admin') {
          fetchUsers();
      }
  }, [activeTab, user]);

  // Track which section is in view for sidebar highlight (works in both scroll directions)
  useEffect(() => {
      if (activeTab !== 'general') return;
      const root = contentRef.current;
      if (!root) return;
      const sectionIds = ['section-theme', 'section-fonts', 'section-language', 'section-cloud', 'section-mindmap', ...KEYBIND_SECTION_ORDER.map((scope) => `section-keybind-${scope}`)];
      const visible = new Set<string>();
      const observer = new IntersectionObserver(
          (entries) => {
              if (scrollingRef.current) return; // ignore during programmatic scroll
              entries.forEach(entry => {
                  if (entry.isIntersecting) visible.add(entry.target.id);
                  else visible.delete(entry.target.id);
              });
              const top = sectionIds.find(id => visible.has(id));
              if (top) setActiveSection(top);
          },
          { root, rootMargin: '0px 0px -45% 0px', threshold: 0 }
      );
      sectionIds.forEach(id => {
          const el = document.getElementById(id);
          if (el) observer.observe(el);
      });
      return () => observer.disconnect();
  }, [activeTab, mounted]);

  useEffect(() => {
      if (adminView === '2fa-requests') {
          fetchTwoFAResetRequests();
      }
      if (adminView === 'reports') {
          fetchReports();
      }
  }, [adminView]);

  const fetchTwoFAResetRequests = async () => {
      setLoadingResetRequests(true);
      try {
          const token = useAuthStore.getState().token;
          if (!token) return;
          const res = await fetch(`${getWorkerUrl()}/admin/2fa-reset-requests`, {
              headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await res.json();
          if (data.requests) setTwoFAResetRequests(data.requests);
      } catch (e) {
          console.error('Failed to fetch 2FA reset requests', e);
      } finally {
          setLoadingResetRequests(false);
      }
  };

  const fetchReports = async () => {
      setLoadingReports(true);
      try {
          const token = useAuthStore.getState().token;
          if (!token) return;
          const res = await fetch(`${getWorkerUrl()}/admin/hack-reports`, {
              headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await res.json();
          setReports(Array.isArray(data.reports) ? data.reports : []);
      } catch (e) {
          console.error('Failed to fetch reports', e);
          setReports([]);
      } finally {
          setLoadingReports(false);
      }
  };

  const handle2FAResetAction = async (action: 'approve' | 'reject', requestId: string) => {
      try {
          const token = useAuthStore.getState().token;
          if (!token) return;
          const res = await fetch(`${getWorkerUrl()}/admin/2fa-reset-${action}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ requestId })
          });
          if (!res.ok) throw new Error('Action failed');
          setTwoFAResetRequests(prev => prev.filter(r => r.requestId !== requestId));
      } catch (e) {
          console.error(`Failed to ${action} 2FA reset request`, e);
      }
  };

  const fetchUsers = async () => {
      setLoadingUsers(true);
      try {
          const token = useAuthStore.getState().token;
          if (!token) return;
          const res = await fetch(`${getWorkerUrl()}/admin/users`, {
              headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await res.json();
          if (data.users) setAdminUsers(data.users);
      } catch (e) {
          console.error("Failed to fetch users", e);
      } finally {
          setLoadingUsers(false);
      }
  };

  const handleDismissReport = async (reportId: string) => {
      try {
          const token = useAuthStore.getState().token;
          if (!token) return;

          const res = await fetch(`${getWorkerUrl()}/admin/hack-report-dismiss`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ reportId })
          });
          if (!res.ok) throw new Error('Failed to dismiss report');

          setReports(prev => prev.filter(report => report.reportId !== reportId));
          if (selectedReport?.reportId === reportId) {
              setSelectedReport(null);
              setShowReportModal(false);
          }
      } catch (e) {
          console.error('Failed to dismiss report', e);
          setMessage({ type: 'error', text: text('Failed to dismiss report.') });
      }
  };

  const handleResetReportedAccount = async (reportId: string) => {
      try {
          const token = useAuthStore.getState().token;
          if (!token) return;
          if (!await dialogs.confirm({ title: text('Reset account password'), message: text('Generate a temporary password for this account and invalidate existing sessions?'), confirmLabel: text('Reset password'), isDanger: true })) return;

          const res = await fetch(`${getWorkerUrl()}/admin/hack-report-reset`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ reportId })
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
              throw new Error(data.error || text('Failed to reset account password'));
          }

          setReports(prev => prev.filter(report => report.reportId !== reportId));
          setSelectedReport(null);
          setShowReportModal(false);
          await dialogs.alert({ title: text('Temporary password generated'), message: `${text('Temporary password:')} ${data.tempPassword}` });
      } catch (e: any) {
          console.error('Failed to reset reported account', e);
          setMessage({ type: 'error', text: e.message || text('Failed to reset reported account.') });
      }
  };

  const handleAdminAction = async (action: 'approve' | 'reject' | 'promote' | 'reset-2fa', userId: string) => {
      try {
          const token = useAuthStore.getState().token;
          if (!token) return;

          if (action === 'reset-2fa') {
              if (!await dialogs.confirm({ title: text('Reset 2FA'), message: text('Are you sure you want to reset 2FA for this user?'), confirmLabel: text('Reset'), isDanger: true })) return;
              
              const res = await fetch(`${getWorkerUrl()}/admin/reset-2fa`, {
                  method: 'POST',
                  headers: { 
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${token}` 
                  },
                  body: JSON.stringify({ userId })
              });

              if (!res.ok) {
                  const err = await res.json();
                  throw new Error(err.message || text('Failed to reset 2FA'));
              }

              await dialogs.alert({ title: text('2FA reset'), message: text('2FA has been reset for this user.') });
              // Update local state to reflect change
              setAdminUsers(prev => prev.map(u => u.id === userId ? { ...u, two_factor_enabled: false, twoFactorEnabled: false } : u));
              return;
          }

          await fetch(`${getWorkerUrl()}/admin/${action}`, {
              method: 'POST',
              headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}` 
              },
              body: JSON.stringify({ userId })
          });
          fetchUsers(); // Refresh list
      } catch (e) {
          console.error(`Failed to ${action} user`, e);
      }
  };

  const handleEditUserEmail = async (userId: string, currentEmail: string) => {
      const newEmail = await dialogs.prompt({
          title: text('Edit user email'),
          message: text('Enter a new email address for this user.'),
          label: text('Email address'),
          initialValue: currentEmail,
          placeholder: text('name@example.com'),
          submitLabel: text('Save email'),
      });
      if (newEmail && newEmail !== currentEmail) {
          try {
              const token = useAuthStore.getState().token;
              if (!token) return;

              const res = await fetch(`${getWorkerUrl()}/admin/update-user`, {
                  method: 'POST',
                  headers: { 
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${token}` 
                  },
                  body: JSON.stringify({ userId, email: newEmail })
              });

              if (!res.ok) {
                  const err = await res.json();
                  throw new Error(err.error || text('Failed to update email'));
              }

              await dialogs.alert({ title: text('Email updated'), message: `${text('Email updated to')} ${newEmail}.` });
              setAdminUsers(prev => prev.map(u => u.id === userId ? { ...u, email: newEmail } : u));
          } catch (e: any) {
              await dialogs.alert({ title: text('Update failed'), message: e.message, tone: 'danger' });
          }
      }
  };

  const handleSetup2FA = async () => {
      setSetupLoading(true);
      try {
          const token = useAuthStore.getState().token;
          if (!token) {
              useAuthStore.getState().logout();
              window.location.href = '/login';
              return;
          }

          const res = await fetch(`${getWorkerUrl()}/auth/2fa/setup`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}` }
          });

          if (res.status === 401) {
              useAuthStore.getState().logout();
              window.location.href = '/login';
              return;
          }
          
          const responseText = await res.text();
          let data;
          try {
              data = JSON.parse(responseText);
          } catch (e) {
              console.error("Failed to parse response:", responseText);
              throw new Error(`Server returned invalid JSON: ${responseText.substring(0, 50)}...`);
          }

          if (!res.ok) {
              throw new Error(data.error || data.message || text('Server error during 2FA setup'));
          }

          if (data.uri) {
              const qr = await QRCode.toDataURL(data.uri);
              setTwoFactorSetup({ ...data, qr });
              setShowTwoFactorSetup(true);
          } else {
              console.error("Missing URI in response:", data);
              throw new Error(text('Invalid response from server: Missing 2FA URI'));
          }
      } catch (e: any) {
          console.error("Failed to setup 2FA", e);
          setMessage({ type: 'error', text: e.message || text('Failed to initialize 2FA setup. Please try again.') });
      } finally {
          setSetupLoading(false);
      }
  };

  const handleVerify2FA = async () => {
      try {
          const token = useAuthStore.getState().token;
          if (!token) return;

          const res = await fetch(`${getWorkerUrl()}/auth/2fa/verify`, {
              method: 'POST',
              headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}` 
              },
              body: JSON.stringify({ token: twoFactorCode })
          });
          
          const data = await res.json();
             if (!data.success) throw new Error(data.error || text('Verification failed'));
          
          if (data.enabled === true) {
             updateUser({ two_factor_enabled: true, twoFactorEnabled: true });
                 setMessage({ type: 'success', text: text('Two-Factor Authentication enabled!') });
          }
          
          // Double check with dedicated status endpoint
          try {
              const statusRes = await fetch(`${getWorkerUrl()}/auth/2fa/status`, {
                  headers: { 'Authorization': `Bearer ${token}` }
              });
              const statusData = await statusRes.json();
              if (statusData.enabled) {
                  updateUser({ two_factor_enabled: true, twoFactorEnabled: true });
              }
          } catch (err) {
              console.warn("Status check failed, relying on verify response");
          }

          setShowTwoFactorSetup(false);
          setTwoFactorSetup(null);
          setTwoFactorCode('');
          setMessage({ type: 'success', text: text('Two-Factor Authentication enabled!') });
      } catch (e) {
          setMessage({ type: 'error', text: text('Invalid code. Please try again.') });
      }
  };

  const handleDisable2FA = async () => {
      if (!await dialogs.confirm({ title: text('Disable 2FA'), message: text('Are you sure you want to disable 2FA? Your account will be less secure.'), confirmLabel: text('Disable'), isDanger: true })) return;
      
      try {
          const token = useAuthStore.getState().token;
          if (!token) return;

          await fetch(`${getWorkerUrl()}/auth/2fa/disable`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}` }
          });
          
          updateUser({ two_factor_enabled: false, twoFactorEnabled: false });
          setMessage({ type: 'success', text: text('Two-Factor Authentication disabled.') });
      } catch (e) {
          setMessage({ type: 'error', text: text('Failed to disable 2FA') });
      }
  };

  const handleUpdateField = async (field: 'username' | 'email' | 'password') => {
      setMessage({ type: '', text: '' });
      
      try {
          const token = useAuthStore.getState().token;
          if (!token) return;

          const body: any = {};
          if (field === 'username') body.username = newUsername;
          if (field === 'email') body.email = newEmail;
          if (field === 'password') body.password = newPassword;

          const res = await fetch(`${getWorkerUrl()}/account/update`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify(body)
          });
          
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || text('Update failed'));
          
          const updates: any = {};
          if (field === 'username') updates.username = newUsername;
          if (field === 'email') {
              updates.email = newEmail;
              await dialogs.alert({ title: text('Confirmation email sent'), message: text('Confirmation email sent to your new address.') });
          }
          if (field === 'password') {
              await dialogs.alert({ title: text('Password changed'), message: text('Password changed successfully. A confirmation email has been sent.') });
          }
          
          if (Object.keys(updates).length > 0) {
              updateUser(updates);
              // Instantly refresh chat so all channel labels and message names update
              if (field === 'username') {
                  const chatStore = useChatStore.getState();
                  await chatStore.fetchChannels();
                  // Re-fetch messages for the active channel so the DB-updated names load immediately
                  const activeId = chatStore.activeChannelId;
                  if (activeId) await chatStore.fetchMessages(activeId);
                  await chatStore.refreshAllUsernames();
              }
          }

          setMessage({ type: 'success', text: text('Account updated successfully.') });
          
          if (field === 'username') setNewUsername('');
          if (field === 'email') setNewEmail('');
          if (field === 'password') setNewPassword('');
      } catch (err: any) {
          setMessage({ type: 'error', text: err.message });
      }
  };

  const initiateChange = (field: 'username' | 'email' | 'password') => {
      // Prevent changes for Google Auth Users
      if ((user as any)?.auth_provider === 'google' && (field === 'email' || field === 'password')) {
          void dialogs.alert({ title: text('Unavailable action'), message: text('Email and password cannot be changed for Google accounts.'), tone: 'warning' });
          return;
      }

      if (field === 'username') {
          handleUpdateField('username');
      } else {
          setChangeField(field);
          setShowChangeModal(true);
      }
  };

  const confirmChange = () => {
      if (changeField) {
          handleUpdateField(changeField);
          setShowChangeModal(false);
          setChangeField(null);
      }
  };

  const handleViewReport = (report: any) => {
      setSelectedReport(report);
      setShowReportModal(true);
  };

  const handleDeleteAccountClick = () => {
      setShowDeleteModal(true);
  };

  const confirmDeleteAccount = async () => {
      try {
          const token = useAuthStore.getState().token;
          if (!token) return;

          const res = await fetch(`${getWorkerUrl()}/account/delete`, {
              method: 'POST',
              headers: {
                  'Authorization': `Bearer ${token}`
              }
          });
          
          if (!res.ok) throw new Error(text('Deletion failed'));
          
          // Logout
          useAuthStore.getState().logout();
          window.location.href = '/login';
      } catch (err: any) {
          setMessage({ type: 'error', text: err.message });
          setShowDeleteModal(false);
      }
  };

  const handleKeybindChange = (action: string, e: React.KeyboardEvent) => {
    e.preventDefault();
        const normalizedKey = normalizeKeybindKey(e.key);
        if (!normalizedKey || isModifierOnlyKey(normalizedKey)) return;
        setKeybind(action, normalizedKey);
  };

    const handleCustomFontUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });

        const baseName = (customFontName.trim() || file.name.replace(/\.[^.]+$/, '')).trim();
        const fontId = `font-${Date.now()}`;
        addCustomFont({
            id: fontId,
            name: baseName,
            cssFamily: baseName,
            docxFamily: fallbackFontChoice.docxFamily,
            source: 'upload',
            dataUrl,
            format: inferFontFormat(file.type || file.name),
            fallbackFontId: DEFAULT_FONT_ID,
        });
        setPendingAppFontId(fontId);
        setCustomFontName('');
        setMessage({
            type: 'success',
            text: text('Custom font added. Apply it to use it across the app.'),
        });
    };

    const handleAddFontFromUrl = () => {
        const trimmedName = customFontName.trim();
        const trimmedUrl = customFontUrl.trim();
        if (!trimmedName || !trimmedUrl) return;

        const fontId = `font-${Date.now()}`;
        addCustomFont({
            id: fontId,
            name: trimmedName,
            cssFamily: trimmedName,
            docxFamily: fallbackFontChoice.docxFamily,
            source: 'url',
            url: trimmedUrl,
            format: inferFontFormat(trimmedUrl),
            fallbackFontId: DEFAULT_FONT_ID,
        });
        setPendingAppFontId(fontId);
        setCustomFontName('');
        setCustomFontUrl('');
        setMessage({
            type: 'success',
            text: text('Custom font added. Apply it to use it across the app.'),
        });
    };

    const handleLoadLocalFonts = useCallback(async () => {
        const queryLocalFonts = (window as Window & { queryLocalFonts?: () => Promise<LocalFontApiEntry[]> }).queryLocalFonts;
        if (!queryLocalFonts) {
            setLocalFontStatus('unsupported');
            setLocalFontError(text('Local font discovery is not available in this browser or webview.'));
            return;
        }

        setLocalFontStatus('loading');
        setLocalFontError('');

        try {
            const result = await queryLocalFonts();
            const uniqueFamilies = new Map<string, LocalMachineFont>();

            for (const font of result) {
                const family = font.family?.trim();
                if (!family) continue;
                const key = family.toLowerCase();
                if (!uniqueFamilies.has(key)) {
                    uniqueFamilies.set(key, {
                        family,
                        fullName: font.fullName?.trim() || family,
                        postscriptName: font.postscriptName?.trim() || undefined,
                    });
                }
            }

            setLocalMachineFonts(
                Array.from(uniqueFamilies.values()).sort((left, right) => left.family.localeCompare(right.family)),
            );
            setLocalFontStatus('ready');
        } catch (error) {
            const name = error instanceof DOMException ? error.name : '';
            if (name === 'NotAllowedError') {
                setLocalFontStatus('denied');
                setLocalFontError(text('Permission was denied, so local fonts could not be read from this device.'));
                return;
            }

            setLocalFontStatus('error');
            setLocalFontError(text('Local fonts could not be loaded from this device.'));
        }
    }, [text]);

    useEffect(() => {
        if (activeTab !== 'general' || activeSection !== 'section-fonts') return;
        if (!supportsLocalFontDiscovery || localFontStatus !== 'idle') return;

        void handleLoadLocalFonts();
    }, [activeSection, activeTab, handleLoadLocalFonts, localFontStatus, supportsLocalFontDiscovery]);

    const ensureLocalFontOption = (font: LocalMachineFont) => {
        const existingLocalFont = customFonts.find(
            (item) => item.source === 'local' && item.cssFamily.toLowerCase() === font.family.toLowerCase(),
        );
        const nextFontId = existingLocalFont?.id || `local-font-${(font.postscriptName || font.family).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

        if (!existingLocalFont) {
            addCustomFont({
                id: nextFontId,
                name: font.fullName,
                cssFamily: font.family,
                docxFamily: fallbackFontChoice.docxFamily,
                source: 'local',
                fallbackFontId: DEFAULT_FONT_ID,
                postscriptName: font.postscriptName,
            });
        }

        return nextFontId;
    };

    const handleSelectFontOption = (value: string) => {
        if (!value) return;

        if (value.startsWith('installed-font::')) {
            const family = decodeURIComponent(value.replace('installed-font::', ''));
            const font = localMachineFonts.find((item) => item.family === family);
            if (font) {
                const nextFontId = ensureLocalFontOption(font);
                setPendingAppFontId(nextFontId);
                setMessage({
                    type: 'success',
                    text: text('Device font is ready. Apply it to use it across the app.'),
                });
            }
            return;
        }

        setPendingAppFontId(value);
    };

    const handleApplyPendingAppFont = () => {
        if (!hasPendingAppFontChange) return;

        setAppFontId(pendingAppFontId);
        setMessage({
            type: 'success',
            text: pendingAppFont.source === 'built-in'
                ? text('App font updated across the app.')
                : text('App font updated for this device. Word export keeps a safe fallback font.'),
        });
    };

    const handleCancelPendingAppFont = () => {
        setPendingAppFontId(appFontId);
    };

    const handleRemoveSavedFont = (fontId: string) => {
        removeCustomFont(fontId);
        if (pendingAppFontId === fontId) {
            setPendingAppFontId(appFontId === fontId ? DEFAULT_FONT_ID : appFontId);
        }
    };

  if (!mounted) return null;

    const renderGeneralSettings = () => (
        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <section id="section-theme" className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm scroll-mt-6">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                        <Monitor size={20} /> {t('settings.appearance')}
                    </h3>
                    <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
                        {text('Choose the theme the app should use throughout the workspace.')}
                    </p>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <button
                            onClick={() => setTheme('light')}
                            className={`p-4 rounded-lg border-2 flex flex-col items-center gap-3 transition-all ${
                                theme === 'light'
                                    ? 'border-primary bg-blue-50 dark:bg-blue-900/20 text-primary'
                                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-400'
                            }`}
                        >
                              <Sun size={24} /><span className="font-medium">{t('settings.light')}</span>
                        </button>
                        <button
                            onClick={() => setTheme('dark')}
                            className={`p-4 rounded-lg border-2 flex flex-col items-center gap-3 transition-all ${
                                theme === 'dark'
                                    ? 'border-primary bg-blue-50 dark:bg-blue-900/20 text-primary'
                                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-400'
                            }`}
                        >
                              <Moon size={24} /><span className="font-medium">{t('settings.dark')}</span>
                        </button>
                        <button
                            onClick={() => setTheme('system')}
                            className={`p-4 rounded-lg border-2 flex flex-col items-center gap-3 transition-all ${
                                theme === 'system'
                                    ? 'border-primary bg-blue-50 dark:bg-blue-900/20 text-primary'
                                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-400'
                            }`}
                        >
                              <Monitor size={24} /><span className="font-medium">{t('settings.system')}</span>
                        </button>
                    </div>
                </section>

                <section id="section-fonts" className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm scroll-mt-6">
                    <div className="flex flex-col gap-2">
                        <h3 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                            <Type size={20} /> {t('settings.appFonts')}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {text('Change the font used across the app, editors, and PDF document export. Device fonts now load automatically when you open this section.')}
                        </p>
                    </div>

                    <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                        <div className="space-y-4">
                            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
                                <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                                    <FontPickerPanel
                                        sections={fontBrowserPanelSections}
                                        selectedId={pendingAppFontId}
                                        onSelect={handleSelectFontOption}
                                        searchValue={fontSearchQuery}
                                        onSearchValueChange={setFontSearchQuery}
                                        searchPlaceholder={text('Search default, added, or installed fonts')}
                                        listClassName="max-h-[28rem]"
                                        toolbar={(
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => { void handleLoadLocalFonts(); }}
                                                    disabled={localFontStatus === 'loading' || !supportsLocalFontDiscovery}
                                                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
                                                >
                                                    {localFontStatus === 'loading' ? text('Loading Fonts...') : localFontStatus === 'ready' ? text('Refresh Installed Fonts') : text('Show Installed Fonts')}
                                                </button>
                                                <span className="text-xs text-gray-500 dark:text-gray-400">{visibleFontOptionCount} {text('shown')}</span>
                                            </>
                                        )}
                                        noMatchesMessage={text('No fonts match your search.')}
                                    />

                                    {localFontError ? (
                                        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                                            {localFontError}
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                    <div>
                                        <p className="text-sm font-semibold text-gray-800 dark:text-white">{text('Add Custom Font')}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{text('Upload a local font file or register one from a URL.')}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => customFontInputRef.current?.click()}
                                        className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                                    >
                                        <Upload size={14} /> {text('Upload Font')}
                                    </button>
                                </div>

                                <div className="mt-4 space-y-3">
                                    <div>
                                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">{text('Font name')}</label>
                                        <input
                                            value={customFontName}
                                            onChange={(event) => setCustomFontName(event.target.value)}
                                            placeholder={text('Font display name')}
                                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">{text('Font URL')}</label>
                                        <div className="flex flex-col gap-2 sm:flex-row">
                                            <input
                                                value={customFontUrl}
                                                onChange={(event) => setCustomFontUrl(event.target.value)}
                                                placeholder={text('https://.../my-font.woff2')}
                                                className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                                            />
                                            <button
                                                type="button"
                                                onClick={handleAddFontFromUrl}
                                                disabled={!customFontName.trim() || !customFontUrl.trim()}
                                                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
                                            >
                                                <Link2 size={14} /> {text('Add from URL')}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <input
                                    ref={customFontInputRef}
                                    type="file"
                                    accept=".woff,.woff2,.ttf,.otf,font/woff,font/woff2,font/ttf,font/otf"
                                    className="hidden"
                                    onChange={handleCustomFontUpload}
                                />
                            </div>

                            <div className="space-y-2">
                                {customFonts.length === 0 ? (
                                    <div className="rounded-lg border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500">
                                        {text('No custom fonts added yet.')}
                                    </div>
                                ) : customFonts.map((font) => (
                                    <div key={font.id} className="flex items-start gap-3 rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-700">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-gray-800 dark:text-white">{font.name}</p>
                                            <p className="truncate text-xs text-gray-500 dark:text-gray-400">{font.source === 'url' ? font.url : `Fallback: ${getFallbackFontChoice(font.fallbackFontId).label} if unavailable.`}</p>
                                            <p className="mt-2 text-sm text-gray-700 dark:text-gray-300" style={{ fontFamily: buildCustomFontCssFamily(font) }}>Pack my box with five dozen liquor jugs.</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveSavedFont(font.id)}
                                            className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                                            title={text('Remove font')}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-4 rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-700 dark:bg-gray-900/40">
                            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                                <p className="text-sm font-semibold text-gray-800 dark:text-white">{text('App Font Changes')}</p>
                                <div className="mt-4 grid gap-3">
                                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">{text('Current')}</span>
                                            <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                                                {selectedFontStatusLabel}
                                            </span>
                                        </div>
                                        <div className="mt-2 truncate text-lg font-semibold text-gray-900 dark:text-white" style={{ fontFamily: selectedAppFont.cssFamily }}>
                                            {selectedAppFont.label}
                                        </div>
                                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                            {selectedAppFont.localOnly
                                                ? `${text('Used across the app on this device. PDF export keeps it here, while Word stays on')} ${selectedWordExportFont.label}.`
                                                : text('Used across the shell, text inputs, editors, and document views.')}
                                        </p>
                                    </div>

                                    <div className={`rounded-lg border p-3 ${hasPendingAppFontChange ? 'border-blue-200 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/10' : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900'}`}>
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">{text('Pending')}</span>
                                            <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                                                {pendingFontStatusLabel}
                                            </span>
                                        </div>
                                        <div className="mt-2 truncate text-lg font-semibold text-gray-900 dark:text-white" style={{ fontFamily: pendingAppFont.cssFamily }}>
                                            {pendingAppFont.label}
                                        </div>
                                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                            {hasPendingAppFontChange
                                                ? text('Apply this choice to update the whole app. The current font stays untouched until you confirm.')
                                                : text('Choose a font from the dropdown, then apply it here when you are ready.')}
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-4 flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={handleApplyPendingAppFont}
                                        disabled={!hasPendingAppFontChange}
                                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <Check size={14} /> {text('Apply App Font')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleCancelPendingAppFont}
                                        disabled={!hasPendingAppFontChange}
                                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
                                    >
                                        <RotateCcw size={14} /> {text('Cancel Pending')}
                                    </button>
                                </div>

                                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                                    {text('Applying the app font updates the shell, text inputs, notes editor, and PDF document export. Word export stays on safe installed fonts so files remain compatible.')}
                                </p>
                            </div>

                            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                                <p className="text-sm font-semibold text-gray-800 dark:text-white">{text('Word Export Default')}</p>
                                <div className="mt-3 flex items-center justify-between gap-3 text-sm text-gray-600 dark:text-gray-300">
                                    <span>{text('Default Word font')}</span>
                                    <span className="font-medium text-gray-900 dark:text-white">{selectedWordExportFont.label}</span>
                                </div>
                                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                                    {text('Word export intentionally falls back to normal installed fonts instead of barcode or device-only fonts.')}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setWordExportDefaults({ fontId: recommendedWordExportFont.id })}
                                    className="mt-4 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
                                >
                                    {text('Use')} {recommendedWordExportFont.label} {text('For Word Export')}
                                </button>
                            </div>

                            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                                <p className="text-sm font-semibold text-gray-800 dark:text-white">{text('PDF Export Behavior')}</p>
                                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                                    {text('PDF export now keeps the live document font and note formatting that the browser can render, which is the safer route for barcode-style fonts and other machine-local fonts.')}
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                <section id="section-language" className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm scroll-mt-6">
                    <div className="flex items-center gap-2 text-xl font-bold text-gray-800 dark:text-white">
                        <Languages size={20} /> {t('settings.language')}
                    </div>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                        {text('Choose the app language preference. English and Norwegian Bokmål are the supported app translations right now, while English remains the fallback.')}
                    </p>
                    <div className="mt-6 max-w-xl rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40" data-no-app-translate>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">{text('App language')}</label>
                        <select
                            value={appLanguage}
                            onChange={(event) => setAppLanguage(event.target.value)}
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-blue-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                        >
                            {APP_LANGUAGE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                            {text('System follows your device language when Norwegian Bokmål is available; otherwise the app falls back to English.')}
                        </p>
                    </div>
                </section>

                <section id="section-cloud" className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm scroll-mt-6">
          <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                        <Cloud size={20} /> {t('settings.cloudStorage')}
          </h3>
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
                            {text('Your data is automatically synced to your secure cloud account.')}
            </p>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="autosave"
                className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
                checked={autoSave}
                onChange={(e) => setAutoSave(e.target.checked)}
              />
                            <label htmlFor="autosave" className="text-gray-700 dark:text-gray-300">{text('Enable Auto-sync (every 5 minutes)')}</label>
            </div>
            {isAuthenticated && user && (
              <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800 flex items-center gap-3">
                <div className="bg-blue-100 dark:bg-blue-800 p-2 rounded-full">
                  <User size={20} className="text-blue-600 dark:text-blue-300" />
                </div>
                <div>
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">{text('Logged in as')}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">{user.username || user.email}</p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Keybinds ── */}
        <section id="section-mindmap" className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm scroll-mt-10">
          <div className="flex justify-between items-start mb-6">
            <h3 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                            <Keyboard size={20} /> {t('settings.keybinds')}
            </h3>
                        <button onClick={resetKeybinds} className="text-xs text-blue-500 hover:underline">{text('Reset All to Defaults')}</button>
          </div>

                    {KEYBIND_SECTION_ORDER.map((scope) => {
                        const definitions = KEYBIND_DEFINITIONS.filter((definition) => definition.scope === scope);
                        const sectionMeta = KEYBIND_SECTION_META[scope];
                        if (definitions.length === 0) return null;

                        return (
                            <div key={scope} id={`section-keybind-${scope}`} className="mb-8 scroll-mt-6">
                                <h4 className="text-base font-bold text-gray-800 dark:text-white mb-1 flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-600">
                                    {scope === 'mindmap' ? <Lightbulb size={17} /> : scope === 'moodboard' ? <Palette size={17} /> : scope === 'planner' ? <ClipboardList size={17} /> : <PenTool size={17} />}
                                    {text(sectionMeta.label)}
                                </h4>
                                <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">{text(sectionMeta.description)}</p>
                                <div className="space-y-1">
                                    {definitions.map((definition) => renderKeybindInput(definition.action))}
                                </div>
                            </div>
                        );
                    })}


        </section>

        {/* ── Account — moved to Profile tab — */}

    </div>
  );

    const renderKeybindInput = (action: string) => {
        const definition = getKeybindDefinition(action);
        if (!definition) return null;

        return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700 last:border-0">
                <div>
                    <div className="text-gray-700 dark:text-gray-300 font-medium">{text(definition.label)}</div>
                    <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">{text(definition.description)}</div>
                </div>
        <div className="flex items-center gap-2">
                        {definition.modifiers.map((modifier) => (
                            <span key={`${action}-${modifier}`} className="rounded border border-gray-200 bg-gray-100 px-2 py-1 text-xs font-mono text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400">
                                {formatKeybindModifier(modifier)}
                            </span>
                        ))}
            <input 
                type="text" 
                                value={formatKeybindKey(keybinds[action] || definition.defaultKey)}
                onKeyDown={(e) => handleKeybindChange(action, e)}
                readOnly
                                className="min-w-[4.5rem] text-center bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-sm font-mono uppercase focus:ring-2 focus:ring-primary outline-none cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                                title={`${text('Current shortcut:')} ${formatKeybindCombo(action, keybinds)}`}
            />
        </div>
    </div>
        );
    };


  // ─── Profile Settings ───────────────────────────────────────────────────────

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 400 * 1024) { setMessage({ type: 'error', text: text('Image must be under 400 KB.') }); return; }
    setUploadingAvatar(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      try {
        const token = useAuthStore.getState().token;
        const res = await fetch(`${getWorkerUrl()}/account/avatar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ avatar_url: dataUrl }),
        });
        if (res.ok) {
          setAvatarPreview(dataUrl);
          updateUser({ avatar_url: dataUrl });
                    setMessage({ type: 'success', text: text('Avatar updated!') });
        } else {
                    setMessage({ type: 'error', text: text('Failed to update avatar.') });
        }
            } catch { setMessage({ type: 'error', text: text('Upload failed.') }); }
      setUploadingAvatar(false);
    };
    reader.readAsDataURL(file);
  };

    const handleBannerImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 1500 * 1024) {
            setMessage({ type: 'error', text: text('Banner image must be under 1.5 MB.') });
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            const dataUrl = ev.target?.result as string;
            setBannerImagePreview(dataUrl);
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleSaveProfileOptions = async () => {
        const token = useAuthStore.getState().token;
        let nextUserUpdates: Record<string, unknown> = {};

        try {
            const payload: Record<string, unknown> = {};
            if (newAbout !== (user?.about || '')) payload.about = newAbout;
            if (bannerColorInput !== (user?.banner_color || '#6366f1')) payload.banner_color = bannerColorInput;
            if (bannerImagePreview !== ((user as any)?.banner_image || null)) payload.banner_image = bannerImagePreview;

            if (Object.keys(payload).length > 0) {
                const profileRes = await fetch(`${getWorkerUrl()}/account/update`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify(payload),
                });
                if (!profileRes.ok) throw new Error('profile');
                nextUserUpdates = { ...nextUserUpdates, ...payload };
            }

            if (Object.keys(nextUserUpdates).length > 0) {
                updateUser(nextUserUpdates as any);
            }

            setMessage({ type: 'success', text: text('Profile saved!') });
        } catch {
            setMessage({ type: 'error', text: text('Failed to save profile.') });
        }
    };

  const handleSavePresence = async (status: 'online' | 'idle' | 'busy' | 'offline') => {
    setSelectedPresence(status);
    const token = useAuthStore.getState().token;
    const res = await fetch(`${getWorkerUrl()}/presence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      updateUser({ presence: status });
            setMessage({ type: 'success', text: text('Status updated.') });
    } else {
            setMessage({ type: 'error', text: text('Failed to update status.') });
    }
  };

  const renderProfileSettings = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {message.text && (
        <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>{message.text}</div>
      )}

      {/* Avatar + Banner Card */}
            <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                {/* Banner strip */}
                                <div
                                        className="relative h-28 w-full bg-cover bg-center"
                                        style={{
                                                backgroundColor: bannerColorInput,
                                                backgroundImage: bannerImagePreview ? `url(${bannerImagePreview})` : undefined,
                                        }}
                                >
                                        <div className="absolute inset-0 bg-black/10" />
                                        <div className="absolute right-4 top-4 z-10 flex flex-wrap items-center gap-2">
                                                <button
                                                        type="button"
                                                        onClick={() => setShowBannerOptionsModal(true)}
                                                        className="inline-flex items-center justify-center rounded-lg bg-black/45 px-3 py-2 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/60"
                                                >
                                                        {text('Banner options')}
                                                </button>
                                        </div>
                </div>

                                <div className="px-6 pb-6 pt-4">
                    <div className="mb-5 flex min-w-0 items-end gap-4">
                        <div className="relative -mt-10 shrink-0">
                            {avatarPreview ? (
                                <img src={avatarPreview} alt="Avatar" className="h-20 w-20 rounded-full border-4 border-white dark:border-gray-800 object-cover shadow-sm" />
                            ) : (
                                <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-indigo-500 text-2xl font-bold text-white shadow-sm dark:border-gray-800">
                                    {(user?.username?.[0] ?? user?.email?.[0] ?? '?').toUpperCase()}
                                </div>
                            )}
                            <button
                                onClick={() => avatarInputRef.current?.click()}
                                disabled={uploadingAvatar}
                                className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-gray-800 text-white transition-colors hover:bg-gray-700 dark:border-gray-800"
                                title={text('Change avatar')}
                            >
                                <Camera size={13} />
                            </button>
                            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarFileChange} />
                        </div>

                        <div className="min-w-0 pb-1">
                            <p className="truncate text-xl font-semibold leading-tight text-gray-900 dark:text-white" title={user?.username || user?.email}>{user?.username || user?.email}</p>
              {user?.username && (
                                <p className="truncate text-sm font-mono leading-tight text-indigo-500">#{user.discriminator || '0000'}</p>
              )}
                        </div>
                    </div>

          {/* About bio */}
          <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{text('About me')}</label>
            <textarea
              rows={3}
              value={newAbout}
              onChange={(e) => setNewAbout(e.target.value)}
                            placeholder={text('Tell others a bit about yourself…')}
              className="w-full p-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-primary outline-none text-sm"
              maxLength={300}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">{newAbout.length}/300</span>
              <button
                                onClick={handleSaveProfileOptions}
                className="px-4 py-1.5 bg-primary hover:bg-blue-600 text-white text-sm rounded-lg transition-colors"
              >
                                                                {text('Save profile')}
              </button>
            </div>
          </div>

                    <Modal
                        isOpen={showBannerOptionsModal}
                        onClose={() => setShowBannerOptionsModal(false)}
                        title={text('Banner options')}
                        widthClassName="w-[34rem]"
                        description={text('Use Save profile to apply banner changes.')}
                    >
                        <div className="space-y-4">
                            <div
                                className="h-28 w-full rounded-xl border border-gray-200 bg-cover bg-center dark:border-gray-700"
                                style={{
                                    backgroundColor: bannerColorInput,
                                    backgroundImage: bannerImagePreview ? `url(${bannerImagePreview})` : undefined,
                                }}
                            />
                            <div className="flex flex-wrap items-center gap-3">
                                <ColorPicker
                                    color={bannerColorInput}
                                    onChange={setBannerColorInput}
                                    compact
                                    buttonLabel={text('Pick banner color')}
                                    className="min-w-[10rem]"
                                    paletteMode="office"
                                    commitMode="confirm"
                                />
                                <button
                                    type="button"
                                    onClick={() => bannerImageInputRef.current?.click()}
                                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
                                >
                                    <Upload size={15} /> {text('Upload banner image')}
                                </button>
                                {bannerImagePreview && (
                                    <button
                                        type="button"
                                        onClick={() => setBannerImagePreview(null)}
                                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-800/60 dark:text-red-400 dark:hover:bg-red-900/20"
                                    >
                                        <Trash2 size={15} /> {text('Remove banner image')}
                                    </button>
                                )}
                                <input ref={bannerImageInputRef} type="file" accept="image/*" className="hidden" onChange={handleBannerImageFileChange} />
                            </div>
                        </div>
                    </Modal>
        </div>
      </section>

      {/* Account & Security section (merged from Account tab) */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{text('Status')}</h3>
                <p className="text-xs text-gray-400 mb-4">{text('Set how others see your availability. The heartbeat will keep you "online" while the app is open; set a custom status here to override it.')}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([
                        { value: 'online',  label: text('Online'),         dot: 'bg-green-500' },
                        { value: 'idle',    label: text('Idle'),           dot: 'bg-yellow-400' },
                        { value: 'busy',    label: text('Do Not Disturb'), dot: 'bg-red-500' },
                        { value: 'offline', label: text('Appear Offline'), dot: 'bg-gray-400 dark:bg-gray-600' },
          ] as const).map(({ value, label, dot }) => (
            <button
              key={value}
              onClick={() => handleSavePresence(value)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                selectedPresence === value
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                  : 'border-gray-200 dark:border-gray-600 hover:border-indigo-300 text-gray-600 dark:text-gray-300'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
              {label}
              {selectedPresence === value && <Check size={13} className="ml-auto text-indigo-500" />}
            </button>
          ))}
        </div>
      </section>

      {/* Account & Security section (merged from Account tab) */}
      <div id="section-account" className="scroll-mt-6">
        {renderAccountSettings()}
      </div>
    </div>
  );

  const renderAccountSettings = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
            <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                <User size={20} /> {text('Account Management')}
            </h3>
            
            <div className="grid gap-8 md:grid-cols-2 items-start">
                <div className="space-y-4">
                    <h4 className="font-semibold text-gray-700 dark:text-gray-300">{text('Profile Information')}</h4>
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-600 dark:text-gray-400">{text('Username')}</label>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                value={newUsername}
                                onChange={(e) => setNewUsername(e.target.value)}
                                placeholder={user?.username || text('New username')}
                                className="flex-1 p-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary outline-none"
                            />
                            <button 
                                onClick={() => initiateChange('username')}
                                disabled={!newUsername}
                                className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
                            >
                                {text('Change')}
                            </button>
                        </div>
                        {/* Unique tag (discriminator) — read-only, assigned at registration */}
                        {user?.username && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600">
                                <span className="text-sm font-mono text-gray-700 dark:text-gray-200">
                                    {user.username}
                                    <span className="text-indigo-500 font-semibold">#{user.discriminator || '0000'}</span>
                                </span>
                                <span className="ml-auto text-[11px] text-gray-400 italic">{text('Your unique tag — share this so friends can find you')}</span>
                            </div>
                        )}
                    </div>
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-600 dark:text-gray-400">{text('Email')}</label>
                        {(user as any)?.auth_provider === 'google' ? (
                            <div className="flex gap-2 p-2 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-500">
                                <span className="flex-1">{user?.email}</span>
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full flex items-center">{text('Google')}</span>
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                <input 
                                    type="email" 
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                    placeholder={user?.email || text('New email')}
                                    className="flex-1 p-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary outline-none"
                                />
                                <button 
                                    onClick={() => initiateChange('email')}
                                    disabled={!newEmail}
                                    className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
                                >
                                    {text('Change')}
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-600 dark:text-gray-400">{text('Password')}</label>
                        {(user as any)?.auth_provider === 'google' ? (
                            <div className="flex gap-2 p-2 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-400 italic">
                                <span className="flex-1">{text('Managed by Google')}</span>
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                <input 
                                    type="password" 
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder={text('New password')}
                                    className="flex-1 p-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary outline-none"
                                />
                                <button 
                                    onClick={() => initiateChange('password')}
                                    disabled={!newPassword}
                                    className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
                                >
                                    {text('Change')}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-4">
                    <h4 className="font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                        <Shield size={16} /> {text('Security')}
                    </h4>
                    
                    <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <Smartphone size={20} className="text-primary" />
                                <div>
                                    <p className="font-medium text-gray-900 dark:text-white">{text('Two-Factor Authentication')}</p>
                                    <p className="text-xs text-gray-500">{text('Secure your account with Microsoft Authenticator')}</p>
                                </div>
                            </div>
                            {isTwoFactorEnabled ? (
                                <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium flex items-center gap-1">
                                    <Check size={12} /> {text('Enabled')}
                                </span>
                            ) : (
                                <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full font-medium flex items-center gap-1">
                                    <AlertTriangle size={12} /> {text('Not Configured')}
                                </span>
                            )}
                        </div>

                        {!isTwoFactorEnabled ? (
                            !showTwoFactorSetup ? (
                                <>
                                    <div className="mb-4 text-sm text-yellow-700 bg-yellow-50 p-3 rounded border border-yellow-200">
                                        {text('You have not set up 2FA or it has been reset. Please configure it now to secure your account.')}
                                    </div>
                                    <button 
                                        onClick={handleSetup2FA}
                                        disabled={setupLoading}
                                        className="w-full py-2 bg-primary text-white rounded hover:bg-blue-600 text-sm font-medium disabled:opacity-50 flex justify-center items-center gap-2"
                                    >
                                        {setupLoading ? text('Generating...') : text('Setup 2FA Now')}
                                    </button>
                                </>
                            ) : (
                                <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
                                    <div className="flex justify-center bg-white p-4 rounded-lg">
                                        {twoFactorSetup?.qr && <img src={twoFactorSetup.qr} alt="2FA QR Code" className="w-48 h-48" />}
                                    </div>
                                    <div className="text-center space-y-2">
                                        <p className="text-sm text-gray-600 dark:text-gray-400">{text('Scan this QR code with Microsoft Authenticator')}</p>
                                        <p className="text-xs font-mono bg-gray-200 dark:bg-gray-800 p-1 rounded select-all">{twoFactorSetup?.secret}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <input 
                                            type="text" 
                                            value={twoFactorCode}
                                            onChange={(e) => setTwoFactorCode(e.target.value)}
                                            placeholder={text('Enter 6-digit code')}
                                            className="flex-1 p-2 rounded border border-gray-300 dark:border-gray-600 text-center tracking-widest"
                                            maxLength={6}
                                        />
                                        <button 
                                            onClick={handleVerify2FA}
                                            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                                        >
                                            {text('Verify & Enable')}
                                        </button>
                                    </div>
                                    <button 
                                        onClick={() => setShowTwoFactorSetup(false)}
                                        className="w-full text-xs text-gray-500 hover:underline"
                                    >
                                        {text('Cancel')}
                                    </button>
                                </div>
                            )
                        ) : (
                            <div className="text-center text-sm text-gray-500 italic py-2 border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-800">
                                <p>{text('Two-factor authentication is active.')}</p>
                                <p className="text-xs mt-1">{text('Contact admin to reset.')}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
                <h4 className="text-lg font-semibold text-red-600 mb-2">{text('Danger Zone')}</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    {text('Deleting your account will mark it for deletion. It will be permanently removed after 14 days. You can recover it by logging in during this period.')}
                </p>
                <button 
                    onClick={handleDeleteAccountClick}
                    className="px-4 py-2 border border-red-200 text-red-600 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                    {text('Delete Account')}
                </button>
            </div>

            <ConfirmModal
                isOpen={showChangeModal}
                onClose={() => setShowChangeModal(false)}
                onConfirm={confirmChange}
                title={text('Confirm Change')}
                message={text('A confirmation email will be sent to verify this action.')}
                confirmLabel={text('Confirm Change')}
            />

            <ConfirmModal
                isOpen={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                onConfirm={confirmDeleteAccount}
                title={text('Delete Account?')}
                message={text('Are you absolutely sure? This action cannot be undone immediately, but you have a 14-day grace period.')}
                confirmLabel={text('Yes, Delete')}
                isDanger
            />
        </section>
    </div>
  );

  const renderAdminSettings = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full max-w-5xl">
        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    <Shield size={20} /> {text('Admin Dashboard')}
                </h3>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setAdminView('users')}
                        className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${adminView === 'users' ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'}`}
                    >
                        {text('Users')}
                    </button>
                    <button 
                        onClick={() => setAdminView('reports')}
                        className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${adminView === 'reports' ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'}`}
                    >
                        {text('Reports')}
                    </button>
                    <button 
                        onClick={() => setAdminView('2fa-requests')}
                        className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1.5 ${adminView === '2fa-requests' ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'}`}
                    >
                        {text('2FA Requests')}
                        {twoFAResetRequests.length > 0 && (
                            <span className="bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">{twoFAResetRequests.length}</span>
                        )}
                    </button>
                    <button
                        onClick={() => {
                            if (adminView === 'users') {
                                fetchUsers();
                                return;
                            }
                            if (adminView === '2fa-requests') {
                                fetchTwoFAResetRequests();
                                return;
                            }
                            fetchReports();
                        }}
                        className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                        title={text('Refresh')}
                    >
                        <RefreshCw size={16} />
                    </button>
                </div>
            </div>
            
            {adminView === 'users' ? (
                <>
                    {/* Bootstrap admin warning — only shown while the bootstrap account still exists */}
                    {adminUsers.some(u => u.is_bootstrap) && (
                        <div className="mb-4 flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                            <AlertTriangle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
                            <div className="text-sm">
                                <p className="font-semibold text-amber-800 dark:text-amber-400">{text('Bootstrap admin account is active')}</p>
                                <p className="text-amber-700 dark:text-amber-500 mt-0.5">
                                    {text('The')} <span className="font-mono">admin@local</span> {text('bootstrap account is still present. Once you have promoted a real user to admin, delete the bootstrap account using the button next to it.')}
                                </p>
                            </div>
                        </div>
                    )}
                    <div className="mb-4 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input 
                            type="text" 
                            placeholder={text('Search users by name or email...')} 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none"
                        />
                    </div>

                    {loadingUsers ? (
                        <p className="text-gray-500 text-center py-8">{text('Loading users...')}</p>
                    ) : (
                        <div className="overflow-x-auto px-2">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="border-b border-gray-200 dark:border-gray-700">
                                        <th className="pb-3 font-semibold text-gray-600 dark:text-gray-400">{text('User')}</th>
                                        <th className="pb-3 font-semibold text-gray-600 dark:text-gray-400">{text('Backup Email')}</th>
                                        <th className="pb-3 font-semibold text-gray-600 dark:text-gray-400">{text('Status')}</th>
                                        <th className="pb-3 font-semibold text-gray-600 dark:text-gray-400">{text('Subscription')}</th>
                                        <th className="pb-3 font-semibold text-gray-600 dark:text-gray-400">2FA</th>
                                        <th className="pb-3 font-semibold text-gray-600 dark:text-gray-400 text-right">{text('Actions')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {adminUsers
                                        .filter(u => 
                                            (u.username?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                            u.email?.toLowerCase().includes(searchQuery.toLowerCase()))
                                        )
                                        .map(u => (
                                        <tr key={u.id} className={`group hover:bg-gray-50 dark:hover:bg-gray-700/50 ${u.is_bootstrap ? 'bg-amber-50/40 dark:bg-amber-900/10' : ''}`}>
                                            <td className="py-3">
                                                <div className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                                    {u.username || text('No Username')}
                                                    {u.is_bootstrap ? (
                                                        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 rounded border border-amber-200 dark:border-amber-700 uppercase tracking-wide">{text('Bootstrap')}</span>
                                                    ) : u.role === 'admin' && (
                                                        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 rounded border border-blue-200 dark:border-blue-700 uppercase tracking-wide">{text('Admin')}</span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-gray-500">{u.email}</div>
                                            </td>
                                            <td className="py-3 text-gray-500">
                                                {u.backup_email || <span className="text-gray-400 italic">{text('None')}</span>}
                                            </td>
                                            <td className="py-3">
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                    u.status === 'active' ? 'bg-green-100 text-green-700' :
                                                    u.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                                    'bg-red-100 text-red-700'
                                                }`}>
                                                    {u.status}
                                                </span>
                                            </td>
                                            <td className="py-3">
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 w-fit ${
                                                    (u.subscription_tier || 'free') === 'pro' ? 'bg-purple-100 text-purple-700' :
                                                    (u.subscription_tier || 'free') === 'enterprise' ? 'bg-blue-100 text-blue-700' :
                                                    'bg-gray-100 text-gray-700'
                                                }`}>
                                                    {(u.subscription_tier || 'free') === 'pro' && <Crown size={12} />}
                                                    {(u.subscription_tier || 'free').charAt(0).toUpperCase() + (u.subscription_tier || 'free').slice(1)}
                                                </span>
                                            </td>
                                            <td className="py-3">
                                                {(u.two_factor_enabled || u.twoFactorEnabled) ? (
                                                    <span className="text-green-600 flex items-center gap-1 text-xs"><Check size={12} /> {text('On')}</span>
                                                ) : (
                                                    <span className="text-gray-400 text-xs">{text('Off')}</span>
                                                )}
                                            </td>
                                            <td className="py-3 text-right space-x-2">
                                                {/* Don't allow email edits on the bootstrap account — it's admin@local by design */}
                                                {!u.is_bootstrap && (
                                                    <button onClick={() => handleEditUserEmail(u.id, u.email)} className="p-1 text-blue-600 hover:bg-blue-50 rounded" title={text('Edit Email')}>
                                                        <PenTool size={16} />
                                                    </button>
                                                )}
                                                {(u.two_factor_enabled || u.twoFactorEnabled) ? (
                                                    <button onClick={() => handleAdminAction('reset-2fa', u.id)} className="p-1 text-orange-600 hover:bg-orange-50 rounded" title={text('Reset 2FA')}>
                                                        <RotateCcw size={16} />
                                                    </button>
                                                ) : (
                                                    <button onClick={() => handleAdminAction('reset-2fa', u.id)} className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded" title={text('Force Reset/Enable 2FA')}>
                                                        <RotateCcw size={16} className="opacity-50" />
                                                    </button>
                                                )}
                                                {u.is_bootstrap ? (
                                                    // Bootstrap admin: only action is to permanently delete it
                                                    <button
                                                        onClick={async () => {
                                                            if (await dialogs.confirm({ title: text('Remove bootstrap admin'), message: text('Remove the bootstrap admin account? Make sure at least one other admin is set up first.'), confirmLabel: text('Remove'), isDanger: true })) {
                                                                handleAdminAction('reject', u.id);
                                                            }
                                                        }}
                                                        className="p-1 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded"
                                                        title={text('Remove bootstrap admin account')}
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                ) : (
                                                    <>
                                                        {u.status === 'pending' && (
                                                            <>
                                                                <button onClick={() => handleAdminAction('approve', u.id)} className="p-1 text-green-600 hover:bg-green-50 rounded" title={text('Approve')}>
                                                                    <Check size={16} />
                                                                </button>
                                                                <button onClick={() => handleAdminAction('reject', u.id)} className="p-1 text-red-600 hover:bg-red-50 rounded" title={text('Reject & Delete')}>
                                                                    <X size={16} />
                                                                </button>
                                                            </>
                                                        )}
                                                        {u.status === 'active' && (
                                                            <button onClick={() => handleAdminAction('reject', u.id)} className="p-1 text-red-600 hover:bg-red-50 rounded" title={text('Delete User')}>
                                                                <X size={16} />
                                                            </button>
                                                        )}
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            ) : adminView === '2fa-requests' ? (
                <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                        {text('Users who have lost access to their authenticator app submit requests here. Verify their identity using the backup email before approving.')}
                    </p>
                    {loadingResetRequests ? (
                        <p className="text-gray-500 text-center py-8">{text('Loading requests...')}</p>
                    ) : twoFAResetRequests.length === 0 ? (
                        <p className="text-gray-400 text-center py-8 italic">{text('No pending 2FA reset requests.')}</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="border-b border-gray-200 dark:border-gray-700">
                                        <th className="pb-3 font-semibold text-gray-600 dark:text-gray-400">{text('Account Email')}</th>
                                        <th className="pb-3 font-semibold text-gray-600 dark:text-gray-400">{text('Backup Email (provided)')}</th>
                                        <th className="pb-3 font-semibold text-gray-600 dark:text-gray-400">{text('Submitted')}</th>
                                        <th className="pb-3 font-semibold text-gray-600 dark:text-gray-400 text-right">{text('Actions')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {twoFAResetRequests.map(r => (
                                        <tr key={r.requestId} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                            <td className="py-3 font-medium text-gray-900 dark:text-white">{r.email}</td>
                                            <td className="py-3 text-gray-500">{r.backupEmail}</td>
                                            <td className="py-3 text-gray-400 text-xs">{formatSettingsDateTime(r.submittedAt)}</td>
                                            <td className="py-3 text-right space-x-2">
                                                <button
                                                    onClick={() => handle2FAResetAction('approve', r.requestId)}
                                                    className="px-3 py-1 text-xs bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 rounded font-medium"
                                                >
                                                    {text('Approve Reset')}
                                                </button>
                                                <button
                                                    onClick={() => handle2FAResetAction('reject', r.requestId)}
                                                    className="px-3 py-1 text-xs bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 rounded font-medium"
                                                >
                                                    {text('Reject')}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            ) : loadingReports ? (
                <p className="text-gray-500 text-center py-8">{text('Loading reports...')}</p>
            ) : reports.length === 0 ? (
                <p className="text-gray-400 text-center py-8 italic">{text('No pending security reports.')}</p>
            ) : (
                <div className="overflow-x-auto px-2">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-gray-200 dark:border-gray-700">
                                <th className="pb-3 font-semibold text-gray-600 dark:text-gray-400">{text('Submitted')}</th>
                                <th className="pb-3 font-semibold text-gray-600 dark:text-gray-400">{text('Account')}</th>
                                <th className="pb-3 font-semibold text-gray-600 dark:text-gray-400">{text('Backup Email')}</th>
                                <th className="pb-3 font-semibold text-gray-600 dark:text-gray-400">{text('Status')}</th>
                                <th className="pb-3 font-semibold text-gray-600 dark:text-gray-400 text-right">{text('Actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {reports.map(r => (
                                <tr key={r.reportId} className="group hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <td className="py-3 text-gray-500">{r.submittedAt ? formatSettingsDateTime(r.submittedAt) : '-'}</td>
                                    <td className="py-3 font-medium text-gray-900 dark:text-white">{r.accountEmail || '-'}</td>
                                    <td className="py-3 text-gray-500">{r.backupEmail}</td>
                                    <td className="py-3">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                            r.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                        }`}>
                                            {r.status}
                                        </span>
                                    </td>
                                    <td className="py-3 text-right">
                                        <button 
                                            onClick={() => handleViewReport(r)}
                                            className="p-1 text-blue-600 hover:bg-blue-50 rounded" 
                                            title={text('View Details')}
                                        >
                                            <FileText size={16} />
                                        </button>
                                        <button
                                            onClick={() => handleDismissReport(r.reportId)}
                                            className="p-1 text-red-600 hover:bg-red-50 rounded"
                                            title={text('Dismiss Report')}
                                        >
                                            <X size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <Modal
                isOpen={showReportModal && !!selectedReport}
                onClose={() => setShowReportModal(false)}
                title={text('Report Details')}
                icon={<AlertTriangle size={24} className="text-yellow-500" />}
                widthClassName="w-[42rem]"
                footer={
                    <>
                        <button
                            onClick={() => setShowReportModal(false)}
                            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        >
                            {text('Close')}
                        </button>
                        <button
                            onClick={() => handleDismissReport(selectedReport.reportId)}
                            className="px-4 py-2 text-sm font-medium bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition-colors dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-100"
                        >
                            {text('Dismiss Report')}
                        </button>
                        <button
                            onClick={() => handleResetReportedAccount(selectedReport.reportId)}
                            className="px-4 py-2 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                        >
                            {text('Reset Password')}
                        </button>
                    </>
                }
            >
                {selectedReport && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-medium text-gray-500 uppercase">{text('Account')}</label>
                                <p className="text-sm font-medium text-gray-900 dark:text-white">{selectedReport.accountEmail || '-'}</p>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-500 uppercase">{text('Submitted')}</label>
                                <p className="text-sm text-gray-700 dark:text-gray-300">{selectedReport.submittedAt ? formatSettingsDateTime(selectedReport.submittedAt) : '-'}</p>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-500 uppercase">{text('Backup Email')}</label>
                                <p className="text-sm text-gray-700 dark:text-gray-300">{selectedReport.backupEmail}</p>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-500 uppercase">{text('Status')}</label>
                                <p className="text-sm text-gray-700 dark:text-gray-300">{selectedReport.status || 'pending'}</p>
                            </div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border border-gray-100 dark:border-gray-700">
                            <label className="text-xs font-medium text-gray-500 uppercase mb-2 block">{text('Report Description')}</label>
                            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                {selectedReport.description || text('No additional details provided.')}
                            </p>
                        </div>
                    </div>
                )}
            </Modal>
        </section>
    </div>
  );



  return (
    <div className="flex flex-col h-full">
      {/* Fixed settings header */}
      <div className="flex-shrink-0 px-8 pt-8 pb-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto">
                    <div className="flex items-start gap-4">
                        <button
                            type="button"
                            onClick={() => {
                                if (previousLocation) {
                                    navigate(previousLocation);
                                    return;
                                }
                                navigate(-1);
                            }}
                            className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                            title={text('Back')}
                        >
                            <ArrowLeft size={18} />
                        </button>
                        <div>
                            <h2 className="text-3xl font-bold text-gray-800 dark:text-white">{t('settings.title')}</h2>
                            <p className="mt-1 text-gray-500 dark:text-gray-400">{t('settings.subtitle')}</p>
                        </div>
                    </div>
        </div>
      </div>

      {/* Body: sidebar stays put, content scrolls */}
      <div className="flex gap-8 flex-1 min-h-0 px-8 py-6 max-w-7xl mx-auto w-full">
        {/* Sidebar Navigation */}
        <aside className="w-52 flex-shrink-0">
            <nav className="space-y-1">

                {/* Profile tab */}
                {isAuthenticated && (
                    <button
                        onClick={() => setActiveTab('profile')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                            activeTab === 'profile'
                            ? 'bg-blue-50 dark:bg-blue-900/20 text-primary'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                    >
                        <User size={18} /> {t('settings.profile')}
                    </button>
                )}

                <div className="py-1"><div className="border-t border-gray-200 dark:border-gray-700" /></div>

                <div className="space-y-2">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                        <input
                            value={settingsNavQuery}
                            onChange={(event) => setSettingsNavQuery(event.target.value)}
                            placeholder={t('settings.search')}
                            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-700 outline-none focus:border-blue-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                        />
                    </div>

                    <div className="space-y-1">
                        {visibleSettingsNavigationItems.map((item) => {
                            const isKeybindsItem = item.id === 'section-mindmap';
                            const isActive = activeTab === 'general' && (activeSection === item.id || (isKeybindsItem && activeSection.startsWith('section-keybind-')));

                            return (
                                <button
                                    key={item.id}
                                    onClick={() => scrollToSection(item.id)}
                                    className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                                        isActive
                                            ? 'bg-blue-50 dark:bg-blue-900/20 text-primary'
                                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    {item.label}
                                </button>
                            );
                        })}

                        {visibleSettingsNavigationItems.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-gray-200 px-3 py-3 text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500">
                                {t('settings.noMatch', { query: settingsNavQuery.trim() })}
                            </div>
                        ) : null}
                    </div>
                </div>

                {/* Admin tab */}
                {isAuthenticated && user?.role === 'admin' && (
                    <>
                        <div className="py-1"><div className="border-t border-gray-200 dark:border-gray-700" /></div>
                        <button
                            onClick={() => setActiveTab('admin')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                                activeTab === 'admin'
                                ? 'bg-blue-50 dark:bg-blue-900/20 text-primary'
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                        >
                            <Shield size={18} /> {t('settings.admin')}
                        </button>
                    </>
                )}
            </nav>
        </aside>

        {/* Content Area */}
        <div ref={contentRef} className="flex-1 min-w-0 overflow-y-auto pr-2">
            {activeTab === 'profile' && renderProfileSettings()}
            {activeTab === 'general' && renderGeneralSettings()}
            {activeTab === 'admin' && renderAdminSettings()}
        </div>
      </div>
    </div>
  );
}

