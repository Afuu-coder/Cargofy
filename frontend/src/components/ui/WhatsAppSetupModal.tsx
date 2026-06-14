/**
 * Cargofy — WhatsApp Alert Setup Modal
 *
 * Step-by-step guide to configure CallMeBot (FREE WhatsApp alerts).
 * User enters their phone + API key → test message sent → alerts enabled.
 *
 * Used in: IoTSimulator.tsx, Fleet3DView.tsx, Dashboard settings
 */

import React, { useState, useEffect } from "react";
import {
  MessageCircle,
  X,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  Phone,
  Key,
  Send,
  Loader,
  Copy,
  ExternalLink,
  Smartphone,
} from "lucide-react";

const API = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────────────────────

interface WhatsAppConfig {
  configured: boolean;
  phone: string | null;
}

// ── Hook: useWhatsAppConfig ────────────────────────────────────────────────────

export function useWhatsAppConfig() {
  const [config, setConfig] = useState<WhatsAppConfig>({
    configured: false,
    phone: null,
  });

  const reload = async () => {
    try {
      const r = await fetch(`${API}/api/v1/notify/whatsapp-config`);
      if (r.ok) setConfig(await r.json());
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    reload();
  }, []);
  return { config, reload };
}

// ── Main Modal Component ───────────────────────────────────────────────────────

interface WhatsAppSetupModalProps {
  onClose: () => void;
  onSuccess?: (phone: string) => void;
}

export function WhatsAppSetupModal({
  onClose,
  onSuccess,
}: WhatsAppSetupModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [phone, setPhone] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  const CALLMEBOT_NUMBER = "+34 644 59 74 21";
  const CALLMEBOT_MSG = "I allow callmebot to send me messages";

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSetup = async () => {
    setError("");
    if (!phone.trim().startsWith("+")) {
      setError(
        "Phone number must start with + and country code. Example: +919876543210",
      );
      return;
    }
    if (!apiKey.trim()) {
      setError("Please enter your CallMeBot API key");
      return;
    }

    setLoading(true);
    try {
      // 1. Save config
      const setupRes = await fetch(`${API}/api/v1/notify/whatsapp-setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), api_key: apiKey.trim() }),
      });
      if (!setupRes.ok) {
        const err = await setupRes.json();
        throw new Error(err.detail?.error || err.detail || "Setup failed");
      }

      // 2. Send test message
      const testRes = await fetch(`${API}/api/v1/notify/test-whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), api_key: apiKey.trim() }),
      });

      if (!testRes.ok) {
        const err = await testRes.json();
        const detail = err.detail;
        if (typeof detail === "object") {
          throw new Error(
            detail.troubleshoot?.[0] || detail.error || "Test message failed",
          );
        }
        throw new Error(String(detail));
      }

      setSuccess(true);
      setStep(3);
      onSuccess?.(phone.trim());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#0D1117",
          border: "1px solid #1E293B",
          borderRadius: 16,
          width: "100%",
          maxWidth: 520,
          boxShadow: "0 0 60px rgba(37,211,102,0.1)",
          overflow: "hidden",
          animation: "slideUp 0.25s ease",
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div
          style={{
            background: "linear-gradient(135deg, #128C7E 0%, #25D366 100%)",
            padding: "20px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                background: "rgba(255,255,255,0.2)",
                borderRadius: 10,
                padding: 8,
                display: "flex",
                alignItems: "center",
              }}
            >
              <MessageCircle size={22} color="white" />
            </div>
            <div>
              <div style={{ color: "white", fontWeight: 800, fontSize: 16 }}>
                WhatsApp Alerts Setup
              </div>
              <div
                style={{
                  color: "rgba(255,255,255,0.75)",
                  fontSize: 12,
                  marginTop: 2,
                }}
              >
                Free • No credit card • Setup in 2 min
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.15)",
              border: "none",
              borderRadius: 8,
              padding: 6,
              cursor: "pointer",
              color: "white",
              display: "flex",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Progress Bar ────────────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            gap: 0,
            borderBottom: "1px solid #1E293B",
          }}
        >
          {[
            { n: 1, label: "Add Contact" },
            { n: 2, label: "Enter Details" },
            { n: 3, label: "Test Alert" },
          ].map(({ n, label }) => (
            <div
              key={n}
              style={{
                flex: 1,
                padding: "10px 0",
                textAlign: "center",
                borderBottom:
                  step >= n ? "2px solid #25D366" : "2px solid transparent",
                background: step >= n ? "rgba(37,211,102,0.05)" : "transparent",
                transition: "all 0.2s",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: step >= n ? "#25D366" : "#475569",
                }}
              >
                {n}. {label}
              </span>
            </div>
          ))}
        </div>

        <div style={{ padding: 24 }}>
          {/* ── STEP 1: Add Contact ──────────────────────────────────────────── */}
          {step === 1 && (
            <div>
              <div
                style={{
                  background: "rgba(37,211,102,0.06)",
                  border: "1px solid rgba(37,211,102,0.2)",
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 20,
                  display: "flex",
                  gap: 12,
                }}
              >
                <Smartphone
                  size={20}
                  color="#25D366"
                  style={{ flexShrink: 0, marginTop: 2 }}
                />
                <div
                  style={{ fontSize: 13, color: "#94A3B8", lineHeight: 1.6 }}
                >
                  <strong style={{ color: "#E2E8F0" }}>CallMeBot</strong> —
                  bilkul free WhatsApp API. Koi Twilio account ya credit card ki
                  zarurat nahi! Sirf ek WhatsApp message bhejne se activate hota
                  hai.
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    color: "#64748B",
                    fontSize: 12,
                    fontWeight: 700,
                    marginBottom: 8,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}
                >
                  Step 1: Yeh number WhatsApp pe save karo
                </div>
                <div
                  style={{
                    background: "#111622",
                    border: "1px solid #1E293B",
                    borderRadius: 10,
                    padding: "12px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div
                      style={{
                        color: "#25D366",
                        fontWeight: 800,
                        fontSize: 18,
                        fontFamily: "monospace",
                      }}
                    >
                      {CALLMEBOT_NUMBER}
                    </div>
                    <div
                      style={{ color: "#475569", fontSize: 11, marginTop: 4 }}
                    >
                      Save as "CallMeBot" in contacts
                    </div>
                  </div>
                  <button
                    onClick={() => copyText(CALLMEBOT_NUMBER)}
                    style={{
                      background: "rgba(37,211,102,0.1)",
                      border: "1px solid rgba(37,211,102,0.3)",
                      color: "#25D366",
                      borderRadius: 8,
                      padding: "6px 10px",
                      cursor: "pointer",
                      fontSize: 12,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Copy size={12} /> {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    color: "#64748B",
                    fontSize: 12,
                    fontWeight: 700,
                    marginBottom: 8,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}
                >
                  Step 2: Yeh exact message bhejo unhe
                </div>
                <div
                  style={{
                    background: "#111622",
                    border: "1px solid #1E293B",
                    borderRadius: 10,
                    padding: "12px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div
                    style={{
                      color: "#E2E8F0",
                      fontStyle: "italic",
                      fontSize: 14,
                      fontFamily: "monospace",
                    }}
                  >
                    "{CALLMEBOT_MSG}"
                  </div>
                  <button
                    onClick={() => copyText(CALLMEBOT_MSG)}
                    style={{
                      background: "rgba(37,211,102,0.1)",
                      border: "1px solid rgba(37,211,102,0.3)",
                      color: "#25D366",
                      borderRadius: 8,
                      padding: "6px 10px",
                      cursor: "pointer",
                      fontSize: 12,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      flexShrink: 0,
                      marginLeft: 8,
                    }}
                  >
                    <Copy size={12} /> Copy
                  </button>
                </div>
              </div>

              <div
                style={{
                  background: "rgba(96,165,250,0.06)",
                  border: "1px solid rgba(96,165,250,0.2)",
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 20,
                  fontSize: 12,
                  color: "#94A3B8",
                  display: "flex",
                  gap: 8,
                }}
              >
                <AlertCircle
                  size={14}
                  color="#60A5FA"
                  style={{ flexShrink: 0, marginTop: 1 }}
                />
                <span>
                  <strong style={{ color: "#93C5FD" }}>
                    Message bhejne ke baad
                  </strong>{" "}
                  CallMeBot aapko WhatsApp pe aapka{" "}
                  <strong style={{ color: "#93C5FD" }}>API key</strong> bhejega.
                  Phir "Next" button dabao aur key enter karo.
                </span>
              </div>

              <a
                href="https://www.callmebot.com/blog/free-api-whatsapp-messages/"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  color: "#25D366",
                  fontSize: 12,
                  marginBottom: 20,
                  textDecoration: "none",
                }}
              >
                <ExternalLink size={12} /> Full setup guide →
              </a>

              <button
                onClick={() => setStep(2)}
                style={{
                  width: "100%",
                  padding: "12px 0",
                  background: "linear-gradient(135deg, #128C7E, #25D366)",
                  color: "white",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  transition: "opacity 0.2s",
                }}
              >
                Message bhej diya — Next <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* ── STEP 2: Enter Details ────────────────────────────────────────── */}
          {step === 2 && (
            <div>
              <div style={{ marginBottom: 18 }}>
                <label
                  style={{
                    display: "block",
                    color: "#94A3B8",
                    fontSize: 12,
                    fontWeight: 600,
                    marginBottom: 8,
                  }}
                >
                  <Phone
                    size={12}
                    style={{ display: "inline", marginRight: 4 }}
                  />
                  Aapka WhatsApp Number
                </label>
                <input
                  type="tel"
                  placeholder="+919876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    boxSizing: "border-box",
                    background: "#111622",
                    border: `1px solid ${phone && !phone.startsWith("+") ? "#EF4444" : "#1E293B"}`,
                    borderRadius: 10,
                    color: "#F1F5F9",
                    fontSize: 15,
                    fontFamily: "monospace",
                    outline: "none",
                    transition: "border-color 0.2s",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#25D366")}
                  onBlur={(e) => (e.target.style.borderColor = "#1E293B")}
                />
                <div style={{ color: "#475569", fontSize: 11, marginTop: 5 }}>
                  Country code ke saath likho. India: +91...
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label
                  style={{
                    display: "block",
                    color: "#94A3B8",
                    fontSize: 12,
                    fontWeight: 600,
                    marginBottom: 8,
                  }}
                >
                  <Key
                    size={12}
                    style={{ display: "inline", marginRight: 4 }}
                  />
                  CallMeBot API Key
                </label>
                <input
                  type="text"
                  placeholder="Aapka API key enter karo (e.g. 1234567)"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    boxSizing: "border-box",
                    background: "#111622",
                    border: "1px solid #1E293B",
                    borderRadius: 10,
                    color: "#F1F5F9",
                    fontSize: 15,
                    fontFamily: "monospace",
                    outline: "none",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#25D366")}
                  onBlur={(e) => (e.target.style.borderColor = "#1E293B")}
                />
                <div style={{ color: "#475569", fontSize: 11, marginTop: 5 }}>
                  Yeh key CallMeBot ne WhatsApp pe bheja hoga
                </div>
              </div>

              {error && (
                <div
                  style={{
                    background: "rgba(239,68,68,0.1)",
                    border: "1px solid rgba(239,68,68,0.3)",
                    borderRadius: 8,
                    padding: "10px 14px",
                    marginBottom: 16,
                    fontSize: 13,
                    color: "#F87171",
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                  }}
                >
                  <AlertCircle
                    size={14}
                    style={{ flexShrink: 0, marginTop: 1 }}
                  />
                  {error}
                </div>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => {
                    setStep(1);
                    setError("");
                  }}
                  style={{
                    flex: 1,
                    padding: "12px 0",
                    background: "transparent",
                    border: "1px solid #1E293B",
                    color: "#64748B",
                    borderRadius: 10,
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  ← Back
                </button>
                <button
                  onClick={handleSetup}
                  disabled={loading || !phone || !apiKey}
                  style={{
                    flex: 2,
                    padding: "12px 0",
                    background:
                      loading || !phone || !apiKey
                        ? "rgba(37,211,102,0.3)"
                        : "linear-gradient(135deg, #128C7E, #25D366)",
                    color: "white",
                    border: "none",
                    borderRadius: 10,
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: loading ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  {loading ? (
                    <>
                      <Loader
                        size={16}
                        style={{ animation: "spin 1s linear infinite" }}
                      />{" "}
                      Sending test...
                    </>
                  ) : (
                    <>
                      <Send size={15} /> Save & Send Test
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Success ──────────────────────────────────────────────── */}
          {step === 3 && success && (
            <div style={{ textAlign: "center", padding: "10px 0" }}>
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: "50%",
                  background: "rgba(37,211,102,0.15)",
                  border: "2px solid rgba(37,211,102,0.4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 20px",
                  animation: "pulse 2s infinite",
                }}
              >
                <CheckCircle size={36} color="#25D366" />
              </div>

              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: "#E2E8F0",
                  marginBottom: 8,
                }}
              >
                WhatsApp Connected! 🎉
              </div>
              <div
                style={{
                  color: "#94A3B8",
                  fontSize: 14,
                  marginBottom: 24,
                  lineHeight: 1.6,
                }}
              >
                Test message send ho gaya{" "}
                <strong style={{ color: "#25D366" }}>
                  {phone.slice(0, 4)}****{phone.slice(-3)}
                </strong>{" "}
                pe! Ab jab bhi AI agent CRITICAL risk detect karega, aapko
                turant WhatsApp alert milega.
              </div>

              <div
                style={{
                  background: "#111622",
                  border: "1px solid #1E293B",
                  borderRadius: 12,
                  padding: 16,
                  textAlign: "left",
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    color: "#64748B",
                    fontSize: 11,
                    fontWeight: 700,
                    marginBottom: 10,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}
                >
                  Ab aapko alert milega jab:
                </div>
                {[
                  "🔴 Risk score 80% se zyada ho",
                  "🤖 AI agent rerouting karega",
                  "🌡️ Temperature safe limit se upar jaye",
                  "⚡ Battery critical level pe ho",
                ].map((item, i) => (
                  <div
                    key={i}
                    style={{
                      color: "#94A3B8",
                      fontSize: 13,
                      padding: "4px 0",
                      display: "flex",
                      gap: 8,
                    }}
                  >
                    {item}
                  </div>
                ))}
              </div>

              <button
                onClick={onClose}
                style={{
                  width: "100%",
                  padding: "12px 0",
                  background: "linear-gradient(135deg, #128C7E, #25D366)",
                  color: "white",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Done — IoT Simulator pe jao
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(30px); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(37,211,102,0.3); }
          50% { box-shadow: 0 0 0 12px rgba(37,211,102,0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ── WhatsApp Status Badge (compact, for toolbars) ─────────────────────────────

interface WhatsAppBadgeProps {
  onClick: () => void;
}

export function WhatsAppBadge({ onClick }: WhatsAppBadgeProps) {
  const { config } = useWhatsAppConfig();

  return (
    <button
      onClick={onClick}
      title={
        config.configured
          ? `WhatsApp alerts active: ${config.phone}`
          : "Setup WhatsApp alerts"
      }
      style={{
        background: config.configured
          ? "rgba(37,211,102,0.12)"
          : "rgba(100,116,139,0.12)",
        border: `1px solid ${config.configured ? "rgba(37,211,102,0.35)" : "#1E293B"}`,
        borderRadius: 8,
        padding: "5px 10px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 6,
        transition: "all 0.2s",
      }}
    >
      <MessageCircle
        size={13}
        color={config.configured ? "#25D366" : "#475569"}
      />
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: config.configured ? "#25D366" : "#475569",
        }}
      >
        {config.configured ? `WA: ${config.phone}` : "Setup WhatsApp"}
      </span>
      {config.configured && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#25D366",
            boxShadow: "0 0 6px #25D366",
          }}
        />
      )}
    </button>
  );
}
