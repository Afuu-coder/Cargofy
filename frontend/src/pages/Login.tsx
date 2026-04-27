import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || password.length < 4) {
      setError('Please enter a valid email and password (min 4 chars).');
      return;
    }
    setLoading(true);
    setError('');
    // Demo mode — accept any email/password
    await new Promise(r => setTimeout(r, 800));
    localStorage.setItem('axon_authed', 'true');
    localStorage.setItem('axon_email', email);
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-[#080B12] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-4xl font-black text-[#4DD9AC] tracking-tighter mb-2">AXON</div>
          <p className="text-slate-400 text-sm">Cold-Chain Command Platform</p>
        </div>

        {/* Card */}
        <div className="bg-[#0D1117] border border-slate-800 rounded-xl p-8 shadow-2xl">
          <h1 className="text-xl font-bold text-white mb-6">Sign in to your account</h1>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-widest mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full bg-[#10131b] border border-slate-700 text-white px-4 py-3 rounded-lg focus:outline-none focus:border-[#4DD9AC] transition-colors"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 uppercase tracking-widest mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#10131b] border border-slate-700 text-white px-4 py-3 rounded-lg focus:outline-none focus:border-[#4DD9AC] transition-colors"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-[#4DD9AC] to-[#6ef6c7] text-[#003829] font-bold py-3 rounded-lg hover:scale-[0.98] transition-transform disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-slate-500 text-sm mt-6">
            Don't have an account?{' '}
            <a href="/signup" className="text-[#4DD9AC] hover:underline">Sign up</a>
          </p>
        </div>

        <p className="text-center text-slate-600 text-xs mt-4">
          Demo mode: any email + 4+ char password works
        </p>
      </div>
    </div>
  );
}
