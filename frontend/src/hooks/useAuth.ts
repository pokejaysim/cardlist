import { useEffect } from "react";
import { useAuthStore } from "@/store/auth";
import { DEV_MODE, DEV_USER } from "@/lib/devMode";

export function useAuth() {
  const { user, session, loading, initialize, signOut } = useAuthStore();

  useEffect(() => {
    if (!DEV_MODE) {
      initialize();
    }
  }, [initialize]);

  if (DEV_MODE) {
    return {
      user: DEV_USER as unknown as typeof user,
      session: {} as typeof session,
      loading: false,
      isAuthenticated: true,
      signOut: async () => {
        console.log("[DEV MODE] Sign out (no-op)");
      },
    };
  }

  return {
    user,
    session,
    loading,
    isAuthenticated: !!session,
    signOut,
  };
}
