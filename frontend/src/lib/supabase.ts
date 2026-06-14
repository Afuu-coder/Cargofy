/**
 * Cargofy — Supabase Client
 *
 * SETUP KARO (2 min):
 * 1. supabase.com pe jao → New Project banao (free)
 * 2. Project Settings → API → copy "Project URL" aur "anon public" key
 * 3. frontend/.env mein yeh dono add karo:
 *    VITE_SUPABASE_URL=https://xxxx.supabase.co
 *    VITE_SUPABASE_ANON_KEY=eyJ...
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    "[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY missing in .env\n" +
      "Auth will not work. Please add these to frontend/.env",
  );
}

export const supabase = createClient(
  SUPABASE_URL || "https://placeholder.supabase.co",
  SUPABASE_ANON_KEY || "placeholder",
);

// ── Auth helpers ───────────────────────────────────────────────────────────────

/** Sign up with email + password */
export async function signUp(
  email: string,
  password: string,
  fullName: string,
) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
    },
  });
  return { data, error };
}

/** Sign in with email + password */
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
}

/** Sign out */
export async function signOut() {
  await supabase.auth.signOut();
  localStorage.removeItem("cargofy_authed");
  localStorage.removeItem("cargofy_token");
  localStorage.removeItem("cargofy_email");
  localStorage.removeItem("cargofy_user");
}

/** Get current session (null if not logged in) */
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/** Get current user */
export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

/** Check if user is authenticated */
export function isAuthed(): boolean {
  return localStorage.getItem("cargofy_authed") === "true";
}
