/**
 * Cargofy — Login Page
 * Email/Password + Google OAuth · Premium Split UI
 */

import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { signIn, supabase } from "../../lib/supabase";
import {
  Eye,
  EyeOff,
  Loader,
  AlertCircle,
  ArrowRight,
  Shield,
  Zap,
  Globe,
} from "lucide-react";

async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/dashboard` },
  });
  if (error) throw error;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gLoading, setGLoading] = useState(false);
  const [error, setError] = useState("");

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) {
      setError("Email address is required.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      const { data, error: authError } = await signIn(email.trim(), password);
      if (authError) {
        setError(
          authError.message.includes("Invalid login credentials")
            ? "Invalid email or password. Please try again."
            : authError.message,
        );
        return;
      }
      if (data.session) {
        localStorage.setItem("cargofy_authed", "true");
        localStorage.setItem("cargofy_token", data.session.access_token);
        localStorage.setItem("cargofy_email", data.user?.email ?? email);
        localStorage.setItem(
          "cargofy_user",
          JSON.stringify({
            id: data.user?.id,
            email: data.user?.email,
            name: data.user?.user_metadata?.full_name ?? email.split("@")[0],
            avatar: data.user?.user_metadata?.avatar_url ?? null,
          }),
        );
        navigate("/dashboard");
      }
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setGLoading(true);
    setError("");
    try {
      await signInWithGoogle();
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : "Google sign-in failed. Please try again.",
      );
      setGLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050810] flex overflow-hidden">
      {/* ── LEFT BRAND PANEL ──────────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col justify-between w-[48%] relative p-14 overflow-hidden">
        {/* Bg layers */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 25% 55%, rgba(77,217,172,0.13) 0%, transparent 55%), radial-gradient(ellipse at 75% 20%, rgba(99,102,241,0.10) 0%, transparent 50%), #060A14",
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(77,217,172,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(77,217,172,0.035) 1px, transparent 1px)",
            backgroundSize: "52px 52px",
          }}
        />
        {/* Glow orb */}
        <div
          className="absolute top-[38%] left-[45%] w-72 h-72 rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(77,217,172,0.07) 0%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />

        {/* Content */}
        <div className="relative z-10">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-16">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #4DD9AC, #34c994)",
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"
                  stroke="#022518"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle
                  cx="12"
                  cy="10"
                  r="3"
                  stroke="#022518"
                  strokeWidth="2.5"
                />
              </svg>
            </div>
            <span className="text-white font-black text-2xl tracking-tight">
              CARGOFY
            </span>
          </div>

          <div className="mb-14">
            <h2 className="text-[42px] font-black text-white leading-[1.12] mb-5">
              Autonomous
              <br />
              <span
                style={{
                  background:
                    "linear-gradient(130deg, #4DD9AC 30%, #818cf8 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Cold-Chain
              </span>
              <br />
              Intelligence.
            </h2>
            <p className="text-slate-400 text-[15px] leading-relaxed max-w-[300px]">
              AI-powered logistics that monitors, predicts, and autonomously
              reroutes cargo — in under 2 seconds.
            </p>
          </div>

          <div className="space-y-3">
            {[
              {
                icon: <Zap size={13} />,
                label: "Gemini AI risk scoring in real-time",
                c: "#4DD9AC",
              },
              {
                icon: <Globe size={13} />,
                label: "3D fleet tracking across India",
                c: "#818cf8",
              },
              {
                icon: <Shield size={13} />,
                label: "Blockchain-certified audit trail",
                c: "#F59E0B",
              },
            ].map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
                style={{
                  background: "rgba(255,255,255,0.025)",
                  border: "1px solid rgba(255,255,255,0.055)",
                }}
              >
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `${f.c}15`, color: f.c }}
                >
                  {f.icon}
                </div>
                <span className="text-slate-300 text-[13px]">{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4DD9AC] animate-pulse" />
          <span className="text-slate-600 text-xs">
            FAR AWAY 2026 · Logistics & Transit Theme
          </span>
        </div>
      </div>

      {/* ── RIGHT FORM PANEL ─────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-14 bg-[#080C16]">
        <div className="w-full max-w-[390px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-10">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #4DD9AC, #34c994)",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path
                  d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"
                  stroke="#022518"
                  strokeWidth="2.5"
                />
              </svg>
            </div>
            <span className="text-white font-black text-lg">CARGOFY</span>
          </div>

          <h1 className="text-[26px] font-bold text-white mb-1">
            Welcome back
          </h1>
          <p className="text-slate-500 text-sm mb-8">
            Sign in to your operations dashboard
          </p>

          {/* Google */}
          <button
            onClick={handleGoogle}
            disabled={gLoading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl text-[13px] font-semibold text-white transition-all hover:border-white/20 active:scale-[0.98] disabled:opacity-60 mb-5"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {gLoading ? (
              <Loader size={16} className="animate-spin" />
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
            )}
            Continue with Google
          </button>

          <div className="flex items-center gap-3 mb-5">
            <div
              className="flex-1 h-px"
              style={{ background: "rgba(255,255,255,0.07)" }}
            />
            <span className="text-[11px] text-slate-600 font-medium tracking-wide">
              OR CONTINUE WITH EMAIL
            </span>
            <div
              className="flex-1 h-px"
              style={{ background: "rgba(255,255,255,0.07)" }}
            />
          </div>

          {error && (
            <div
              className="flex items-start gap-2.5 text-red-400 text-[13px] px-4 py-3 rounded-xl mb-4"
              style={{
                background: "rgba(239,68,68,0.07)",
                border: "1px solid rgba(239,68,68,0.18)",
              }}
            >
              <AlertCircle size={14} className="shrink-0 mt-0.5" /> {error}
            </div>
          )}

          <form onSubmit={handleEmail} className="space-y-4">
            <div>
              <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-1.5 font-semibold">
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                className="w-full px-4 py-3 rounded-xl text-white text-sm placeholder-slate-700 outline-none transition-all"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  caretColor: "#4DD9AC",
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = "rgba(77,217,172,0.45)")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")
                }
                required
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-1.5 font-semibold">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPwd ? "text" : "password"}
                  id="password"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full px-4 py-3 pr-11 rounded-xl text-white text-sm placeholder-slate-700 outline-none transition-all"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    caretColor: "#4DD9AC",
                  }}
                  onFocus={(e) =>
                    (e.currentTarget.style.borderColor =
                      "rgba(77,217,172,0.45)")
                  }
                  onBlur={(e) =>
                    (e.currentTarget.style.borderColor =
                      "rgba(255,255,255,0.08)")
                  }
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300 p-1 transition-colors"
                >
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-bold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed mt-1"
              style={{
                background: "linear-gradient(135deg, #4DD9AC, #34c994)",
                color: "#022518",
              }}
            >
              {loading ? (
                <>
                  <Loader size={14} className="animate-spin" /> Signing in...
                </>
              ) : (
                <>
                  Sign In <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>

          <p className="text-center text-slate-600 text-[13px] mt-7">
            Don't have an account?{" "}
            <Link
              to="/signup"
              className="text-[#4DD9AC] hover:text-[#6ef6c7] font-semibold transition-colors"
            >
              Create one
            </Link>
          </p>

          <p className="text-center text-slate-700 text-[11px] mt-5 flex items-center justify-center gap-1.5">
            <Shield size={10} /> Secured by Supabase Auth · End-to-end encrypted
          </p>
        </div>
      </div>
    </div>
  );
}
