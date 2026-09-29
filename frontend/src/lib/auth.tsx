import { createContext, ReactNode, useContext, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, Me } from './api';

interface AuthCtx {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<unknown>;
  logout: () => Promise<void>;
  /** True for a moment after logout: guards send the visitor home instead of to /login. */
  leaving: boolean;
}

const Ctx = createContext<AuthCtx>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [leaving, setLeaving] = useState(false);
  const q = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      // /auth/session answers 200 with null when signed out (no failed request in the console).
      try {
        return (await api.get<{ me: Me | null }>('/auth/session')).data.me;
      } catch {
        return null;
      }
    },
    staleTime: 30_000,
  });
  const value: AuthCtx = {
    me: q.data ?? null,
    loading: q.isLoading,
    refresh: () => q.refetch(),
    logout: async () => {
      // Signed out immediately in the UI: update the observed 'me' query in place (qc.clear() used to
      // detach it, so the app kept showing the old user until a reload) and drop every other cached
      // query so no account data lingers. Then end the session on the server.
      const signOut = () => {
        qc.setQueryData(['me'], null);
        qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
      };
      setLeaving(true);
      await qc.cancelQueries({ queryKey: ['me'] });
      signOut();
      await api.post('/auth/logout').catch(() => undefined);
      signOut(); // in case a session check slipped in while the request was in flight
      window.setTimeout(() => setLeaving(false), 1500);
    },
    leaving,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

export const homeFor = (role?: string) =>
  role === 'SUPER_ADMIN' ? '/admin' : role === 'ORG_ADMIN' ? '/org' : '/app';
