import { useAuthStore } from '@/store/useAuthStore';
import { LogOut, User as UserIcon, LogIn } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { getWorkerUrl } from '@/lib/cloudSync';
import { useAppTranslation } from '@/lib/appTranslations';

export default function Header() {
  const { user, logout, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const { t } = useAppTranslation();

  const handleLogout = async () => {
      const workerUrl = getWorkerUrl();
      const { token } = useAuthStore.getState();
      
      if (workerUrl && token) {
          try {
              await fetch(`${workerUrl}/logout`, {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${token}` }
              });
          } catch (e) {
              console.error("Logout failed", e);
          }
      }
      logout();
      navigate('/login');
  };

  return (
    <header className="absolute top-4 right-4 z-50 flex items-center gap-4">
      {!isAuthenticated && (
        <Link
          to="/login"
          className="flex items-center gap-2 bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-full shadow-sm transition-colors text-sm font-medium"
        >
          <LogIn size={16} />
          {t('login.logIn')}
        </Link>
      )}
    </header>
  );
}
