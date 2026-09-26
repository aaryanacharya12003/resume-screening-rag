import { createContext, ReactNode, useContext } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, Me } from './api';

interface AuthCtx {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<unknown>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api.get<Me>('/auth/me')).data;
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
      await api.post('/auth/logout');
      qc.clear();
      qc.setQueryData(['me'], null);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

export const homeFor = (role?: string) =>
  role === 'SUPER_ADMIN' ? '/admin' : role === 'ORG_ADMIN' ? '/org' : '/app';
