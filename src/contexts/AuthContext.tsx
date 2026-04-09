import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface Licenca {
  id: number;
  plano: 'mensal' | 'anual' | 'vitalicio';
  ativa: boolean;
  data_inicio: string;
  data_vencimento: string | null;
}

export function licencaValida(licenca: Licenca | null): boolean {
  if (!licenca || !licenca.ativa) return false;
  if (licenca.plano === 'vitalicio') return true;
  if (!licenca.data_vencimento) return false;
  return new Date(licenca.data_vencimento) > new Date();
}

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  configured: boolean;
  licenca: Licenca | null;
  licencaLoading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  recarregarLicenca: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [licenca, setLicenca] = useState<Licenca | null>(null);
  const [licencaLoading, setLicencaLoading] = useState(false);

  const isAdmin = user?.user_metadata?.role === 'admin';

  const carregarLicenca = useCallback(async (userId: string | null) => {
    if (!userId) {
      setLicenca(null);
      return;
    }
    setLicencaLoading(true);
    try {
      const { data } = await supabase
        .from('licencas')
        .select('id, plano, ativa, data_inicio, data_vencimento')
        .eq('user_id', userId)
        .maybeSingle();
      setLicenca(data ?? null);
    } finally {
      setLicencaLoading(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
      void carregarLicenca(session?.user?.id ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      void carregarLicenca(session?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, [carregarLicenca]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(error.message);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setLicenca(null);
  }, []);

  const recarregarLicenca = useCallback(async () => {
    await carregarLicenca(user?.id ?? null);
  }, [user, carregarLicenca]);

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      configured: true,
      licenca,
      licencaLoading,
      isAdmin,
      signIn,
      signOut,
      recarregarLicenca,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
