import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { getWorkerUrl } from '@/lib/cloudSync';
import { Loader2, ArrowRight, ShieldCheck, User as UserIcon, Check } from 'lucide-react';
import QRCode from 'qrcode';
import { useAppDialogs } from '@/components/AppDialogs';
import { useAppTranslation } from '@/lib/appTranslations';

export default function SetupPage() {
    const dialogs = useAppDialogs();
    const { text } = useAppTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuthStore();

  const [signupToken, setSignupToken] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  
  // 2FA Data
  const [secret, setSecret] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    const emailParam = searchParams.get('email');
    const nameParam = searchParams.get('name');

    if (!token) {
      navigate('/login');
      return;
    }

    setSignupToken(token);
    setEmail(emailParam || '');
    setUsername(nameParam || '');

    // Fetch 2FA Params immediately
    const fetchParams = async () => {
        try {
            const workerUrl = getWorkerUrl();
            const res = await fetch(`${workerUrl}/auth/google/signup-params`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ signupToken: token })
            });
            const data = await res.json();
            
            if (res.ok && data.success) {
                setSecret(data.secret);
                // Generate QR Code
                const dataUrl = await QRCode.toDataURL(data.uri);
                setQrDataUrl(dataUrl);
            } else {
                setError(data.error || text('Failed to initialize setup'));
            }
        } catch (e: any) {
            setError(e.message || text('Connection failed'));
        } finally {
            setLoading(false);
        }
    };

    fetchParams();
  }, [searchParams, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !twoFactorCode) return;
    
    setSubmitting(true);
    setError('');

    try {
        const workerUrl = getWorkerUrl();
        const res = await fetch(`${workerUrl}/auth/google/complete-signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                signupToken,
                username,
                twoFactorSecret: secret,
                twoFactorCode
            })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || text('Setup failed'));
        }

        // Check for pending approval
        if (data.pendingApproval) {
             setSubmitting(false); // Stop loading
             // Determine if we show a dedicated message or redirect
             // For simplicity, let's use the error state to show a Success Message (styling it differently would be better but keeping it simple)
             // Actually, let's replace the form with a success message.
                         await dialogs.alert({
                             title: text('Account created'),
                             message: data.message || text('Please wait for admin approval.'),
                         });
             navigate('/login');
             return;
        }

        // Success!
        login(data.user, data.token);
        // Login store automatically handles redirect, but we can force it too if needed
        // The store does `window.location.assign('/')` so we don't need to push here necessarily, 
        // but let's be safe and show a success state or just wait.
        
    } catch (err: any) {
        setError(err.message);
        setSubmitting(false);
    }
  };

  if (loading) {
      return (
          <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
              <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
              <span className="ml-3">{text('Preparing setup...')}</span>
          </div>
      );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-zinc-800/50 p-6 border-b border-zinc-800">
             <h2 className="text-xl font-bold text-white flex items-center gap-2">
                 <ShieldCheck className="w-5 h-5 text-green-500" />
                 {text('Account Setup')}
             </h2>
             <p className="text-zinc-400 text-sm mt-1">
                 {text('Complete your account configuration to continue.')}
             </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-sm">
                    {error}
                </div>
            )}

            {/* Username Section */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 text-blue-400 font-medium pb-2 border-b border-zinc-800">
                    <UserIcon className="w-4 h-4" />
                    <span>{text('1. Choose Username')}</span>
                </div>
                <div>
                   <label className="block text-xs font-semibold text-zinc-500 uppercase mb-1">{text('Username')}</label>
                   <input 
                       type="text" 
                       value={username}
                       onChange={(e) => setUsername(e.target.value)}
                       className="w-full bg-zinc-950 border border-zinc-800 rounded p-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
                       placeholder={text('Unique username')}
                       required
                       minLength={3}
                   />
                   <p className="text-xs text-zinc-500 mt-2">{text('This will be your display name and unique identifier.')}</p>
                </div>
            </div>

            {/* 2FA Section */}
            <div className="space-y-4">
                 <div className="flex items-center gap-2 text-purple-400 font-medium pb-2 border-b border-zinc-800">
                    <ShieldCheck className="w-4 h-4" />
                          <span>{text('2. Secure Account (2FA)')}</span>
                 </div>
                 
                 <div className="flex flex-col items-center justify-center bg-white p-4 rounded-lg">
                      {qrDataUrl ? (
                          <img src={qrDataUrl} alt="2FA QR Code" className="w-32 h-32" />
                      ) : (
                          <div className="w-32 h-32 bg-gray-200 animate-pulse rounded" />
                      )}
                 </div>
                 
                 <div className="text-center">
                     <p className="text-sm text-zinc-300">{text('Scan this code with your Authenticator App')}</p>
                     <p className="text-xs text-zinc-500 mt-1 font-mono break-all px-4 select-all cursor-pointer hover:text-zinc-300 transition-colors" title={text('Click to copy')} onClick={() => navigator.clipboard.writeText(secret)}>
                         {text('Secret:')} {secret}
                     </p>
                 </div>

                 <div>
                   <label className="block text-xs font-semibold text-zinc-500 uppercase mb-1">{text('Verification Code')}</label>
                   <input 
                       type="text" 
                       value={twoFactorCode}
                       onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g,'').slice(0,6))}
                       className="w-full bg-zinc-950 border border-zinc-800 rounded p-3 text-white text-center tracking-[0.5em] text-lg focus:outline-none focus:border-purple-500 transition-colors"
                       placeholder={text('000000')}
                       required
                       minLength={6}
                   />
                </div>
            </div>

            <button 
                type="submit" 
                disabled={submitting || !username || twoFactorCode.length !== 6}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
                {submitting ? <Loader2 className="animate-spin" /> : <Check className="w-5 h-5" />}
                                {text('Complete Setup')}
            </button>
        </form>
      </div>
    </div>
  );
}
