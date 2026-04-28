import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@/components/ThemeProvider';
import { AppDialogsProvider } from '@/components/AppDialogs';
import StorageInitializer from '@/components/StorageInitializer';
import ClientLayout from '@/components/ClientLayout';
import AppFontManager from '@/components/AppFontManager';
import AppLanguageManager from '@/components/AppLanguageManager';

const HomePage = lazy(() => import('@/app/page'));
const LoginPage = lazy(() => import('@/app/login/page'));
const BrainstormingPage = lazy(() => import('@/app/brainstorming/page'));
const CalendarPage = lazy(() => import('@/app/calendar/page'));
const FilesPage = lazy(() => import('@/app/files/page'));
const DocumentsPage = lazy(() => import('@/app/documents/page'));
const SpreadsheetsPage = lazy(() => import('@/app/spreadsheets/page'));
const PresentationsPage = lazy(() => import('@/app/presentations/page'));
const MindmapPage = lazy(() => import('@/app/mindmap/page'));
const MindmapEditorPage = lazy(() => import('@/app/mindmap/editor/page'));
const MoodboardEditorPage = lazy(() => import('@/app/mindmap/moodboard/page'));
const OfficeEditorPage = lazy(() => import('@/app/office/editor/page'));
const PluginsPage = lazy(() => import('@/app/plugins/page'));
const SettingsPage = lazy(() => import('@/app/settings/page'));
const AuthSetupPage = lazy(() => import('@/app/auth/setup/page'));
const GoogleCallbackPage = lazy(() => import('@/app/auth/google/callback/page'));
const TodoPage = lazy(() => import('@/app/todo/page'));
const PlannerPage = lazy(() => import('@/app/planner/page'));
const StorytellingPage = lazy(() => import('@/app/storytelling/page'));
const AdminPage = lazy(() => import('@/app/admin/page'));
const ChatPage = lazy(() => import('@/app/chat/page'));

function RouteLoader() {
  return (
    <div className="h-full min-h-[40vh] flex items-center justify-center bg-background dark:bg-gray-900 text-gray-500 dark:text-gray-400">
      <div className="flex items-center gap-3 text-sm font-medium">
        <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
        Loading...
      </div>
    </div>
  );
}


export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AppLanguageManager />
      <AppFontManager />
      <AppDialogsProvider>
        <BrowserRouter>
          <StorageInitializer />
          <ClientLayout>
            <Suspense fallback={<RouteLoader />}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/brainstorming" element={<BrainstormingPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/files" element={<FilesPage />} />
                <Route path="/documents" element={<DocumentsPage />} />
                <Route path="/spreadsheets" element={<SpreadsheetsPage />} />
                <Route path="/presentations" element={<PresentationsPage />} />
                <Route path="/mindmap" element={<MindmapPage />} />
                <Route path="/mindmap/editor" element={<MindmapEditorPage />} />
                <Route path="/mindmap/moodboard" element={<MoodboardEditorPage />} />
                <Route path="/office/editor" element={<OfficeEditorPage />} />
                <Route path="/todo" element={<TodoPage />} />
                <Route path="/planner" element={<PlannerPage />} />
                <Route path="/storytelling" element={<StorytellingPage />} />
                <Route path="/plugins" element={<PluginsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/chat" element={<ChatPage />} />

                <Route path="/auth/setup" element={<AuthSetupPage />} />
                <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </ClientLayout>
        </BrowserRouter>
      </AppDialogsProvider>
    </ThemeProvider>
  );
}
