import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { getWorkerUrl, loadFromCloud, setAllAppData } from '@/lib/cloudSync';
import { setFileSystemUserId } from '@/lib/fileSystem';
import { Loader2, User, ArrowRight, Lock, AlertCircle } from 'lucide-react';
import { useAppTranslation } from '@/lib/appTranslations';

export default function GoogleCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuthStore();
    const { text } = useAppTranslation();
    const [status, setStatus] = useState('');
  
  // States for flows
  const [view, setView] = useState<'loading' | 'signup' | '2fa' | 'error'>('loading');
  const [error, setError] = useState('');
  
  // Data needed for flows
  const [signupToken, setSignupToken] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [suggestedName, setSuggestedName] = useState('');
  const [email, setEmail] = useState('');
  
  // Input values
  const [username, setUsername] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [loading, setLoading] = useState(false);
  const processedRef = useRef(false);

    useEffect(() => {
        setStatus(text('Processing Google Login...'));
    }, [text]);

  useEffect(() => {
    const code = searchParams.get('code');
    
    if (!code) {
            setStatus(text('Error: No authorization code received.'));
      setView('error');
            setError(text('No authorization code received from Google.'));
      return;
    }

    if (processedRef.current) return;
    processedRef.current = true;

    const processLogin = async () => {
      try {
        const workerUrl = getWorkerUrl();
        // Since the frontend is at /auth/google/callback, the redirect URI must match exactly what was sent to Google
        const redirectUri = `${window.location.origin}/auth/google/callback`;

        const response = await fetch(`${workerUrl}/auth/google/callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, redirectUri })
        });

        const data = await response.json();

        if (!response.ok) {
              throw new Error(data.details || data.error || text('Google authentication failed'));
        }

        // --- HANDLE SCENARIOS ---
        
        // 1. New User -> Needs Username -> Redirect to Setup Page
        if (data.requiresSignup) {
            navigate(`/auth/setup?token=${data.signupToken}&email=${encodeURIComponent(data.email)}&name=${encodeURIComponent(data.defaultName)}`);
            return;
        }

        // 2. 2FA Required
        if (data.require2fa) {
             setTempToken(data.tempToken);
             setView('2fa');
             setStatus('');
             return;
        }

        // 3. Success
        completeLogin(data);

      } catch (err: any) {
        console.error("Google Auth Error:", err);
        setError(err.message);
        setView('error');
      }
    };

    // Only run once
    if (view === 'loading') {
       processLogin();
    }
  }, [searchParams, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  const completeLogin = async (data: any) => {
      const user = data.user;
        
      // Normalize 2FA status
      if (user.twoFactorEnabled !== undefined) {
          user.two_factor_enabled = user.twoFactorEnabled;
      }
      if (typeof user.two_factor_enabled === 'number') {
           user.two_factor_enabled = user.two_factor_enabled === 1;
      }

      setFileSystemUserId(user.id);
      login(user, data.token);

      // Load data if available
      try {
          const cloudData = await loadFromCloud(data.token);
          if (cloudData) {
              await setAllAppData(cloudData);
          }
      } catch (loadError) {
          console.error("Failed to load initial data", loadError);
      }

      navigate('/');
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setError('');
      
      try {
          const workerUrl = getWorkerUrl();
          const res = await fetch(`${workerUrl}/auth/google/complete-signup`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ signupToken, username })
          });
          const data = await res.json();
          
          if (!res.ok) throw new Error(data.error || text('Signup failed'));
          
          completeLogin(data);
      } catch (e: any) {
          setError(e.message);
      } finally {
          setLoading(false);
      }
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setError('');

      try {
          const workerUrl = getWorkerUrl();
          const res = await fetch(`${workerUrl}/auth/google/verify-2fa`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tempToken, code: twoFactorCode })
          });
          const data = await res.json();
          
          if (!res.ok) throw new Error(data.error || text('Verification failed'));
          
          completeLogin(data);
      } catch (e: any) {
          setError(e.message);
      } finally {
          setLoading(false);
      }
  };

  if (view === 'loading') {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
            <Loader2 className="animate-spin mx-auto mb-4 text-primary" size={48} />
            <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-200">{status}</h2>
        </div>
        </div>
    );
  }

  if (view === 'error') {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
            <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
                <div className="bg-red-100 dark:bg-red-900/30 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertCircle className="text-red-500" size={32} />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{text('Authentication Failed')}</h2>
                <p className="text-gray-600 dark:text-gray-300 mb-6">{error}</p>
                <button 
                   onClick={() => navigate('/login')}
                   className="w-full bg-primary hover:bg-blue-600 text-white font-semibold py-3 rounded-lg transition-colors"
                >
                    {text('Back to Login')}
                </button>
            </div>
        </div>
      );
  }

  if (view === 'signup') {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 animate-in fade-in zoom-in duration-300">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden border border-gray-200 dark:border-gray-700">
            <div className="p-8">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{text('Almost There!')}</h1>
                    <p className="text-gray-500 dark:text-gray-400">
                        {text('Please choose a username to complete your registration for')} <b>{email}</b>.
                    </p>
                </div>
                
                <form onSubmit={handleSignupSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{text('Username')}</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                            <input
                                type="text"
                                required
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-primary outline-none transition-all"
                                placeholder={text('Choose a unique username')}
                                minLength={3}
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                            <AlertCircle size={16} />
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-primary hover:bg-blue-600 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="animate-spin" size={20} /> : (
                            <>
                                {text('Complete Registration')} <ArrowRight size={20} />
                            </>
                        )}
                    </button>
                </form>
            </div>
          </div>
        </div>
      );
  }

  if (view === '2fa') {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 animate-in fade-in zoom-in duration-300">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden border border-gray-200 dark:border-gray-700">
            <div className="p-8 text-center">
                 <div className="bg-blue-50 dark:bg-blue-900/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Lock className="text-primary" size={32} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{text('Two-Factor Authentication')}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{text('Enter the code from your authenticator app to continue.')}</p>
                
                <form onSubmit={handle2FASubmit} className="space-y-6">
                    <div>
                        <input
                            type="text"
                            required
                            autoFocus
                            value={twoFactorCode}
                            onChange={(e) => setTwoFactorCode(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-primary outline-none transition-all text-center text-3xl tracking-widest font-mono"
                            placeholder={text('000000')}
                            maxLength={6}
                        />
                    </div>
                    
                    {error && (
                        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded-lg justify-center">
                            <AlertCircle size={16} />
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-primary hover:bg-blue-600 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="animate-spin" size={20} /> : text('Verify')}
                    </button>
                </form>
            </div>
          </div>
        </div>
      );
  }

  return null;
}
