import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { getWorkerUrl } from '@/lib/cloudSync';
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [isHydrated, setIsHydrated] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previousSidebarCollapsedRef = useRef(false);
  const presenceUnauthorizedRef = useRef(false);
  const sessionUnauthorizedRef = useRef(false);

  const isDocumentRoute = pathname === '/mindmap/editor' || pathname === '/mindmap/moodboard' || pathname === '/office/editor';

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    const disablePageZoom = pathname === '/mindmap/editor' || pathname === '/mindmap/moodboard' || pathname === '/office/editor';
    document.body.classList.toggle('app-page-zoom-disabled', disablePageZoom);

    return () => {
      document.body.classList.remove('app-page-zoom-disabled');
    };
  }, [pathname]);

  useEffect(() => {
    if (isDocumentRoute) {
      previousSidebarCollapsedRef.current = isSidebarCollapsed;
      setIsSidebarCollapsed(true);
      return;
    }

    setIsSidebarCollapsed(previousSidebarCollapsedRef.current);
  }, [isDocumentRoute]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const token = useAuthStore.getState().token;
    const baseUrl = getWorkerUrl();
    if (!token || !baseUrl || sessionUnauthorizedRef.current) return;

    let cancelled = false;

    const validateSession = async () => {
      try {
        const response = await fetch(`${baseUrl}/me?t=${Date.now()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled && (response.status === 401 || response.status === 403)) {
          sessionUnauthorizedRef.current = true;
          useAuthStore.getState().logout();
        }
      } catch {
        // Ignore transient network failures; this effect is only for invalid-session recovery.
      }
    };

    validateSession();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // ── Presence heartbeat ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;

    const token = useAuthStore.getState().token;
    const baseUrl = getWorkerUrl();
    if (!token || !baseUrl) return;

    let isDisposed = false;

    const stopPresenceHeartbeat = () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      document.removeEventListener('visibilitychange', onVisibility);
    };

    const sendPresence = async (status: string) => {
      if (isDisposed || presenceUnauthorizedRef.current) return;
      try {
        const response = await fetch(`${baseUrl}/presence`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status }),
        });
        if (response.status === 401 || response.status === 403) {
          presenceUnauthorizedRef.current = true;
          sessionUnauthorizedRef.current = true;
          stopPresenceHeartbeat();
          useAuthStore.getState().logout();
        }
      } catch {}
    };

    // Go online immediately
    sendPresence('online');

    // Pulse every 45 s to stay online
    heartbeatRef.current = setInterval(() => {
      const s = document.hidden ? 'idle' : 'online';
      sendPresence(s);
    }, 45_000);

    // Visibility change: idle ↔ online
    const onVisibility = () => sendPresence(document.hidden ? 'idle' : 'online');
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      isDisposed = true;
      stopPresenceHeartbeat();
      if (!presenceUnauthorizedRef.current) {
        sendPresence('offline');
      }
    };
  }, [isAuthenticated]);
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const isPublicRoute = pathname === '/login' || pathname.startsWith('/auth/');

    if (!isHydrated) return;

    if (!isAuthenticated && !isPublicRoute) {
      navigate('/login');
    }
    // First time the user lands in the app after login → take them to /chat
    if (isAuthenticated && !isPublicRoute && pathname === '/') {
      if (!localStorage.getItem('hasVisitedChat')) {
        localStorage.setItem('hasVisitedChat', '1');
        navigate('/chat');
      }
    }
  }, [isHydrated, isAuthenticated, pathname, navigate]);

  if (!isHydrated) {
    return null; 
  }

  // If on login/auth pages, render just the children
  if (pathname === '/login' || pathname?.startsWith('/auth/')) {
    return <main className="h-screen w-screen bg-background">{children}</main>;
  }

  // If not authenticated (and not on public page), we are redirecting, so render nothing
  if (!isAuthenticated) {
    return null;
  }

  // Authenticated and inside the app
  return (
    <div className="flex h-screen bg-background dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-300">
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((value) => !value)}
        collapseLocked={isDocumentRoute}
      />
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <Header />
        <div className="flex-1 min-h-0 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
