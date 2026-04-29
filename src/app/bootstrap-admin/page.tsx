import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, Loader2, Lock, User } from 'lucide-react';
import { getWorkerUrl } from '@/lib/cloudSync';
import { useAppDialogs } from '@/components/AppDialogs';

type BootstrapStatus = 'checking' | 'enabled' | 'locked';

export default function BootstrapAdminPage() {
  const dialogs = useAppDialogs();
  const navigate = useNavigate();
  const [status, setStatus] = useState<BootstrapStatus>('checking');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const workerUrl = getWorkerUrl();

    const loadStatus = async () => {
      try {
        const response = await fetch(`${workerUrl}/bootstrap-admin/status?t=${Date.now()}`);
        const data = await response.json();
        if (!cancelled) setStatus(data.enabled ? 'enabled' : 'locked');
      } catch {
        if (!cancelled) {
          setStatus('locked');
          setError('Unable to reach bootstrap setup right now.');
        }
      }
    };

    loadStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setError('');

    if (username.trim().length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }

    if (password.length < 12) {
      setError('Password must be at least 12 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const workerUrl = getWorkerUrl();
      const response = await fetch(`${workerUrl}/bootstrap-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Bootstrap setup failed.');
      }

      await dialogs.alert({
        title: 'Admin account created',
        message: 'The first admin account was created and bootstrap setup is now locked for this installation. Continue to the login page and sign in with your new account.',
      });
      navigate('/login', { replace: true });
    } catch (submitError: any) {
      setError(submitError?.message || 'Bootstrap setup failed.');
      setLoading(false);
      return;
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),_transparent_40%),linear-gradient(180deg,_#0f172a_0%,_#111827_45%,_#020617_100%)] text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-12 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-stretch">
          <section className="rounded-[32px] border border-white/10 bg-white/8 p-8 shadow-2xl shadow-cyan-950/30 backdrop-blur xl:p-10">
            <div className="mb-8 inline-flex items-center gap-3 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100">
              <ShieldCheck size={18} />
              First-install admin setup
            </div>
            <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-white xl:text-5xl">
              Create the admin account before anyone else enters the workspace.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-200/90 xl:text-lg">
              This page is only available while the app has no admin users. Once you create the first admin account, the bootstrap page locks permanently for this installation.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-5">
                <p className="text-sm font-medium text-cyan-100">One-time rule</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">The setup form stays open only until the first admin exists. After that, the app sends visitors to the normal login page.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-5">
                <p className="text-sm font-medium text-cyan-100">Locked by data</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">The boolean behavior is driven by the database state. Reinstalling with a fresh database opens bootstrap again.</p>
              </div>
            </div>
          </section>

          <section className="rounded-[32px] border border-white/10 bg-slate-950/60 p-8 shadow-2xl shadow-black/30 backdrop-blur xl:p-10">
            {status === 'checking' ? (
              <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-4 text-slate-200">
                <Loader2 className="animate-spin" size={28} />
                <p className="text-sm">Checking whether bootstrap setup is still allowed...</p>
              </div>
            ) : status === 'locked' ? (
              <div className="flex h-full min-h-[420px] flex-col justify-center rounded-3xl border border-amber-300/20 bg-amber-400/10 p-8 text-amber-50">
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs uppercase tracking-[0.2em]">
                  <Lock size={14} />
                  Locked
                </div>
                <h2 className="mt-6 text-3xl font-semibold">Bootstrap setup is already closed.</h2>
                <p className="mt-4 text-sm leading-6 text-amber-100/90">
                  An admin account already exists for this installation, so the bootstrap page cannot be used again. Sign in with the existing admin account instead.
                </p>
                {error ? <p className="mt-4 text-sm text-rose-200">{error}</p> : null}
                <Link
                  to="/login"
                  className="mt-8 inline-flex w-fit items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
                >
                  Go to login
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Bootstrap Admin</p>
                  <h2 className="mt-3 text-3xl font-semibold text-white">Set the first admin credentials</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    Use a password you can store safely. After this succeeds, the page locks and future visitors must sign in through the standard login page.
                  </p>
                </div>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-200">Admin username</span>
                  <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <User size={18} className="text-slate-400" />
                    <input
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      className="w-full bg-transparent text-white outline-none placeholder:text-slate-500"
                      placeholder="admin"
                      autoComplete="username"
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-200">Password</span>
                  <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <Lock size={18} className="text-slate-400" />
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="w-full bg-transparent text-white outline-none placeholder:text-slate-500"
                      placeholder="At least 12 characters"
                      autoComplete="new-password"
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-200">Confirm password</span>
                  <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <Lock size={18} className="text-slate-400" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      className="w-full bg-transparent text-white outline-none placeholder:text-slate-500"
                      placeholder="Repeat the password"
                      autoComplete="new-password"
                    />
                  </div>
                </label>

                {error ? <p className="rounded-2xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading ? <Loader2 className="animate-spin" size={18} /> : 'Create first admin account'}
                </button>
              </form>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}