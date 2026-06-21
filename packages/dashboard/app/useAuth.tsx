"use client";

// SuiPass: zkLogin auth context (Google OAuth JWT)
// Replaces Privy with Google OAuth + id_token for zkLogin.

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { GOOGLE_CLIENT_ID, ZKLOGIN_REDIRECT_URI, API_BASE } from "@/lib/chain";
import { setToken, clearToken, isAuthenticated as checkAuth, api } from "@/lib/api";

type AuthState = {
  /** Whether the user is authenticated */
  authenticated: boolean;
  /** Loading state during initial token check */
  loading: boolean;
  /** The zkLogin JWT */
  token: string | null;
  /** Derived Sui address */
  address: string | null;
  /** User profile from the id_token */
  user: { sub: string; name?: string; email?: string; picture?: string } | null;
  /** Start Google OAuth zkLogin flow */
  login: () => void;
  /** Logout: clear stored token */
  logout: () => void;
};

const AuthContext = createContext<AuthState>({
  authenticated: false,
  loading: true,
  token: null,
  address: null,
  user: null,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthState["user"]>(null);
  const [address, setAddress] = useState<string | null>(null);

  // On mount: check localStorage for existing token, verify with server
  useEffect(() => {
    const saved = localStorage.getItem("suipass_zk_token");
    if (!saved) {
      setLoading(false);
      return;
    }
    setTokenState(saved);
    // Verify the token is still valid
    api
      .authStatus()
      .then((res) => {
        if (res.authed) {
          setUser({ sub: res.userId ?? "", name: res.name, email: res.email, picture: res.picture as string | undefined });
          setAddress(res.address ?? null);
        } else {
          clearToken();
          setTokenState(null);
        }
      })
      .catch(() => {
        // Token might be expired; leave it in state, login flow will overwrite
      })
      .finally(() => setLoading(false));
  }, []);

  // Listen for Google OAuth redirect (id_token in URL hash)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.hash.replace("#", "?"));
    const idToken = params.get("id_token");
    if (idToken) {
      // Clean the URL
      window.history.replaceState({}, "", window.location.pathname);
      setToken(idToken);
      setTokenState(idToken);
      api
        .authStatus()
        .then((res) => {
          if (res.authed) {
            setUser({ sub: res.userId ?? "", name: res.name, email: res.email, picture: res.picture as string | undefined });
            setAddress(res.address ?? null);
          }
        })
        .catch(() => {});
    }
  }, []);

  const login = useCallback(() => {
    if (!GOOGLE_CLIENT_ID) {
      console.error("NEXT_PUBLIC_GOOGLE_CLIENT_ID not configured");
      return;
    }
    // Generate a nonce (in production, get from server)
    const nonce = Math.random().toString(36).substring(2, 15);
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: ZKLOGIN_REDIRECT_URI,
      response_type: "id_token",
      scope: "openid email profile",
      nonce,
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setTokenState(null);
    setUser(null);
    setAddress(null);
  }, []);

  return (
    <AuthContext.Provider value={{ authenticated: !!token, loading, token, address, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
