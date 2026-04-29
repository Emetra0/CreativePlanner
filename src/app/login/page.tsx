import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { getWorkerUrl, loadFromCloud, setAllAppData } from '@/lib/cloudSync';
import { setFileSystemUserId } from '@/lib/fileSystem';
import { Lock, Mail, ArrowRight, Loader2, AlertCircle, User, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAppDialogs } from '@/components/AppDialogs';
import { useAppTranslation } from '@/lib/appTranslations';
import { translateStaticAppText } from '@/lib/appStaticUiTranslations';

export default function LoginPage() {
    const dialogs = useAppDialogs();
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuthStore();
  const { theme, setTheme } = useTheme();
        const { language, t } = useAppTranslation();
    const staticText = (text: string) => (language.startsWith('en') ? text : translateStaticAppText(language, text) ?? text);
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [backupEmail, setBackupEmail] = useState('');
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const [showTwoFactorInput, setShowTwoFactorInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Report Hacked Account State
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportName, setReportName] = useState('');
  const [reportEmail, setReportEmail] = useState('');
  const [reportBackupEmail, setReportBackupEmail] = useState('');

  // 2FA Reset Request State (admin-reviewed — no automated email yet)
  const [showReset2FAModal, setShowReset2FAModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetBackupEmail, setResetBackupEmail] = useState('');
  const [resetRequestSent, setResetRequestSent] = useState(false);
  const [resetError, setResetError] = useState('');

    const readResponseBody = async (response: Response) => {
        const raw = await response.text();
        if (!raw) return {};

        try {
            return JSON.parse(raw);
        } catch {
            const snippet = raw.replace(/\s+/g, ' ').trim().slice(0, 180);
            return { error: snippet || 'Unexpected server response' };
        }
    };

  useEffect(() => {
      if (isAuthenticated) {
          navigate('/');
      }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const workerUrl = getWorkerUrl();
    // No need to check for workerUrl existence as it is now hardcoded

    const endpoint = isRegistering ? '/register' : '/login';
    
    // Test Admin Bypass Removed to ensure database consistency
    

    try {
        const body: any = isRegistering 
            ? { email, password, username, backup_email: backupEmail } 
            : { email, password };

        if (showTwoFactorInput && twoFactorToken) {
            body.token = twoFactorToken;
        }

        const response = await fetch(`${workerUrl}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await readResponseBody(response);

        if (!response.ok) {
            throw new Error(data.message || data.error || 'Authentication failed');
        }

        if (data.require2fa) {
            setShowTwoFactorInput(true);
            setLoading(false);
            return;
        }

        if (isRegistering) {
            setIsRegistering(false);
            setError('');
            await dialogs.alert({
                title: staticText('Account created'),
                message: staticText(data.message || 'Please wait for admin approval.'),
            });
        } else {
            // Normalize user data (handle potential casing differences from backend)
            const user = data.user;
            
            // Sync both naming conventions used across the codebase
            if (user.twoFactorEnabled !== undefined && user.two_factor_enabled === undefined) {
                user.two_factor_enabled = user.twoFactorEnabled;
            }
            
            // Force boolean
            if (typeof user.two_factor_enabled === 'number') {
                user.two_factor_enabled = user.two_factor_enabled === 1;
            } else if (typeof user.two_factor_enabled === 'string') {
                user.two_factor_enabled = user.two_factor_enabled === 'true' || user.two_factor_enabled === '1';
            }

            // Keep camelCase in sync
            user.twoFactorEnabled = Boolean(user.two_factor_enabled);

            // Set File System User ID for segregation
            setFileSystemUserId(user.id);

            login(user, data.token);
            
            // Redirect to 2FA setup if not enabled (Optional: Remove this if you don't want forced setup)
            /* if (!user.two_factor_enabled) {
                router.push('/settings?setup2fa=true');
                return;
            } */
            
            try {
                const cloudData = await loadFromCloud(data.token);
                if (cloudData) {
                    await setAllAppData(cloudData);
                }
            } catch (loadError) {
                console.error("Failed to load initial data", loadError);
            }
            
            navigate('/');
        }
    } catch (err: any) {
        setError(staticText(err.message));
    } finally {
        setLoading(false);
    }
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      try {
          await fetch(`${getWorkerUrl()}/auth/report-hack`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  email: reportEmail,
                  backupEmail: reportBackupEmail,
                  description: reportName ? `Name: ${reportName}` : '',
              }),
          });
          // Always show success (prevent enumeration)
          await dialogs.alert({
              title: staticText('Report submitted'),
              message: staticText('An admin will review it and contact you at your backup email if needed.'),
          });
          setShowReportModal(false);
          setReportName('');
          setReportEmail('');
          setReportBackupEmail('');
      } catch {
          await dialogs.alert({
              title: staticText('Report failed'),
              message: staticText('Failed to submit report. Please try again.'),
              tone: 'danger',
          });
      } finally {
          setLoading(false);
      }
  };

  const handleReset2FASubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setResetError('');
      try {
          await fetch(`${getWorkerUrl()}/auth/2fa-reset-request`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: resetEmail, backupEmail: resetBackupEmail })
          });
          // Always show the same confirmation regardless of whether the account exists,
          // so we don't leak information about which emails are registered.
          setResetRequestSent(true);
      } catch (e: any) {
          setResetError(staticText('Network error. Please try again.'));
      } finally {
          setLoading(false);
      }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background dark:bg-gray-900 p-4 relative">
      <button
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      >
        {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
      </button>

      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                            {isRegistering ? t('login.createAccount') : t('login.welcomeBack')}
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
                            {isRegistering ? t('login.signUpPlans') : t('login.loginWorkspace')}
            </p>
          </div>

          <div className="mb-6">
            <button
                type="button"
                onClick={() => {
                    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
                    if (!clientId) {
                        alert('Google sign-in is not configured for this app.');
                        return;
                    }

                    const redirectUri = `${window.location.origin}/auth/google/callback`;
                    const scope = 'email profile';
                    const responseType = 'code';
                    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&response_type=${responseType}`;
                    window.location.href = authUrl;
                }}
                className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-white font-semibold py-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
            >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                        fill="currentColor"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                        fill="currentColor"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z"
                    />
                    <path
                        fill="currentColor"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                </svg>
                {t('login.signInGoogle')}
            </button>
            <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white dark:bg-gray-800 text-gray-500">{t('login.continueWith')}</span>
                </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {!showTwoFactorInput ? (
                <>
                    {isRegistering && (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{staticText('Display name')}</label>
                            <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                            <input
                                type="text"
                                required
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-primary outline-none transition-all"
                                placeholder={staticText('Your name')}
                            />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{staticText('Recovery email')}</label>
                            <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                            <input
                                type="email"
                                required
                                value={backupEmail}
                                onChange={(e) => setBackupEmail(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-primary outline-none transition-all"
                                placeholder={staticText('recovery@example.com')}
                            />
                            </div>
                        </div>
                    </>
                    )}

                    <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{isRegistering ? t('login.accountEmail') : t('login.emailOrUsername')}</label>
                    <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <input
                        type="text"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-primary outline-none transition-all"
                        placeholder={isRegistering ? staticText('you@example.com') : staticText('you@example.com or username')}
                        />
                    </div>
                    </div>

                    <div>
                    <div className="flex justify-between items-center mb-1">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('login.password')}</label>
                        <button
                            type="button"
                            onClick={() => setShowReset2FAModal(true)}
                            className="text-xs text-primary hover:text-blue-700 hover:underline"
                        >
                            {t('login.forgotPassword')}
                        </button>
                    </div>
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-primary outline-none transition-all"
                        placeholder="••••••••"
                        />
                    </div>
                    </div>
                </>
            ) : (
                <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="text-center mb-6">
                        <div className="bg-blue-50 dark:bg-blue-900/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Lock className="text-primary" size={32} />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{staticText('Two-Factor Authentication')}</h3>
                        <p className="text-sm text-gray-500">{staticText('Enter the code from your authenticator app.')}</p>
                    </div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{staticText('Verification Code')}</label>
                    <input
                        type="text"
                        required
                        autoFocus
                        value={twoFactorToken}
                        onChange={(e) => setTwoFactorToken(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-primary outline-none transition-all text-center text-2xl tracking-widest"
                        placeholder="000000"
                        maxLength={6}
                    />
                    <div className="flex flex-col gap-2 mt-4">
                        <button
                            type="button"
                            onClick={() => setShowReset2FAModal(true)}
                            className="text-sm text-primary hover:text-blue-700 hover:underline"
                        >
                            {staticText('Lost your device? Request 2FA Reset')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowTwoFactorInput(false)}
                            className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        >
                            {staticText('Back to Login')}
                        </button>
                    </div>
                </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-blue-600 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <>
                                    {showTwoFactorInput ? t('login.verify') : (isRegistering ? t('login.signUp') : t('login.logIn'))}
                  <ArrowRight size={20} />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center space-y-4">
            <button
              onClick={() => setIsRegistering(!isRegistering)}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-primary dark:hover:text-primary transition-colors block w-full"
            >
              {isRegistering ? t('login.alreadyHaveAccount') : t('login.needAccount')}
            </button>
            {!isRegistering && (
                <button
                    onClick={() => setShowReportModal(true)}
                    className="text-xs text-red-500 hover:text-red-600 hover:underline block w-full"
                >
                    {t('login.reportHackedAccount')}
                </button>
            )}
          </div>
        </div>
      </div>

      {/* Report Modal */}
      {showReportModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700 overflow-hidden animate-in fade-in zoom-in duration-200">
                  <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                      <h3 className="text-lg font-bold text-red-600 flex items-center gap-2">
                          <AlertCircle size={20} /> {staticText('Report Compromised Account')}
                      </h3>
                      <button onClick={() => setShowReportModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                          ✕
                      </button>
                  </div>
                  <form onSubmit={handleReportSubmit} className="p-6 space-y-4">
                      <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                          {staticText('If you cannot access your account, please fill out this form. We will verify your identity using your backup email.')}
                      </p>
                      <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{staticText('Full Name')}</label>
                          <input
                              type="text"
                              required
                              value={reportName}
                              onChange={(e) => setReportName(e.target.value)}
                              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                          />
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{staticText('Account Email')}</label>
                          <input
                              type="email"
                              required
                              value={reportEmail}
                              onChange={(e) => setReportEmail(e.target.value)}
                              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                          />
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{staticText('Backup Email (for contact)')}</label>
                          <input
                              type="email"
                              required
                              value={reportBackupEmail}
                              onChange={(e) => setReportBackupEmail(e.target.value)}
                              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                          />
                      </div>
                      <div className="pt-2 flex justify-end gap-2">
                          <button
                              type="button"
                              onClick={() => setShowReportModal(false)}
                              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                          >
                              {staticText('Cancel')}
                          </button>
                          <button
                              type="submit"
                              disabled={loading}
                              className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-2"
                          >
                              {loading ? <Loader2 className="animate-spin" size={16} /> : staticText('Submit Report')}
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {/* 2FA Reset Request Modal */}
      {showReset2FAModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700 overflow-hidden animate-in fade-in zoom-in duration-200">
                  <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                      <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                          <Lock size={20} /> {staticText('Request 2FA Reset')}
                      </h3>
                      <button onClick={() => { setShowReset2FAModal(false); setResetRequestSent(false); setResetEmail(''); setResetBackupEmail(''); setResetError(''); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                          ✕
                      </button>
                  </div>

                  {resetRequestSent ? (
                      <div className="p-8 text-center space-y-4">
                          <div className="w-14 h-14 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto">
                              <Mail size={28} className="text-green-600" />
                          </div>
                          <h4 className="font-semibold text-gray-900 dark:text-white text-lg">{staticText('Request Submitted')}</h4>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                              {staticText('Your request has been sent to the admin. They will verify your identity using your backup email and reset your 2FA access. This usually takes up to 24 hours.')}
                          </p>
                          <button
                              onClick={() => { setShowReset2FAModal(false); setResetRequestSent(false); setResetEmail(''); setResetBackupEmail(''); }}
                              className="px-6 py-2 text-sm bg-primary hover:bg-blue-700 text-white rounded-lg"
                          >
                              {staticText('Close')}
                          </button>
                      </div>
                  ) : (
                      <form onSubmit={handleReset2FASubmit} className="p-6 space-y-4">
                          <p className="text-sm text-gray-600 dark:text-gray-300">
                              {staticText('Lost access to your authenticator? Submit a reset request. The admin will verify your identity via your backup email before resetting your 2FA.')}
                          </p>
                          <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{staticText('Account Email or Username')}</label>
                              <input
                                  type="text"
                                  required
                                  value={resetEmail}
                                  onChange={(e) => setResetEmail(e.target.value)}
                                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                                  placeholder={staticText('you@example.com')}
                              />
                          </div>
                          <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{staticText('Backup Email')} <span className="text-gray-400 font-normal">{staticText('(for identity verification)')}</span></label>
                              <input
                                  type="email"
                                  required
                                  value={resetBackupEmail}
                                  onChange={(e) => setResetBackupEmail(e.target.value)}
                                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                                  placeholder={staticText('backup@example.com')}
                              />
                              <p className="text-xs text-gray-400 mt-1">{staticText('This must match the backup email you registered with.')}</p>
                          </div>

                          {resetError && (
                              <div className="text-red-500 text-sm bg-red-50 dark:bg-red-900/20 p-2 rounded">{resetError}</div>
                          )}

                          <div className="pt-2 flex justify-end gap-2">
                              <button
                                  type="button"
                                  onClick={() => setShowReset2FAModal(false)}
                                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                              >
                                  {staticText('Cancel')}
                              </button>
                              <button
                                  type="submit"
                                  disabled={loading}
                                  className="px-4 py-2 text-sm bg-primary hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 disabled:opacity-50"
                              >
                                  {loading ? <Loader2 className="animate-spin" size={16} /> : staticText('Submit Request')}
                              </button>
                          </div>
                      </form>
                  )}
              </div>
          </div>
      )}
    </div>
  );
}
