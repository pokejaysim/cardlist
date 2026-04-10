import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  initialize: () => Promise<void>;
  signOut: () => Promise<void>;
}

/**
 * Clear all Supabase auth keys from localStorage.
 * Supabase stores tokens under keys like `sb-<ref>-auth-token`.
 * If these become stale/corrupted, the client enters a refresh loop.
 */
function clearSupabaseStorage() {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith("sb-") || key === "access_token")) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,

  initialize: async () => {
    try {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        // Stale or invalid session — clear everything and start fresh
        console.warn("Auth session error, clearing stale tokens:", error.message);
        clearSupabaseStorage();
        set({ session: null, user: null, loading: false });
        return;
      }

      set({
        session: data.session,
        user: data.session?.user ?? null,
        loading: false,
      });
    } catch (err) {
      // Network error or corrupted storage
      console.warn("Auth initialization failed:", err);
      clearSupabaseStorage();
      set({ session: null, user: null, loading: false });
      return;
    }

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null });
      if (session?.access_token) {
        localStorage.setItem("access_token", session.access_token);
      } else {
        localStorage.removeItem("access_token");
      }
    });
  },

  signOut: async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // If signOut fails (e.g. network), still clear local state
    }
    clearSupabaseStorage();
    set({ user: null, session: null });
  },
}));
