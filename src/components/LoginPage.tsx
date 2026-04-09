import { useState, type FormEvent } from 'react';
import { Beef, Loader2, Lock, KeyRound } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  onCadastro: () => void;
}

export function LoginPage({ onCadastro }: Props) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      const low = msg.toLowerCase();
      if (low.includes('invalid login credentials') || low.includes('invalid_credentials')) {
        setError('E-mail ou senha incorretos.');
      } else if (low.includes('email not confirmed')) {
        setError('Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.');
      } else if (low.includes('too many requests')) {
        setError('Muitas tentativas. Aguarde alguns minutos e tente novamente.');
      } else if (low.includes('user not found')) {
        setError('Usuário não encontrado.');
      } else {
        setError(msg || 'Não foi possível entrar. Tente novamente.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-200 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200/80 overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 text-white px-8 py-10 text-center">
          <Beef className="mx-auto mb-3 text-orange-400" size={40} />
          <h1 className="text-2xl font-bold tracking-tight">Calculadora de Arrobas</h1>
          <p className="text-slate-300 text-sm mt-2">Simulador de Confinamento de Bovinos</p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-8 space-y-5">
          <div className="flex items-center gap-2 text-slate-700 font-medium text-sm">
            <Lock size={16} className="text-orange-600" />
            Entrar
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="space-y-1">
            <label
              htmlFor="login-email"
              className="text-xs font-semibold text-slate-500 uppercase tracking-wider"
            >
              E-mail
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
              placeholder="seu@email.com"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="login-password"
              className="text-xs font-semibold text-slate-500 uppercase tracking-wider"
            >
              Senha
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {submitting ? <Loader2 className="animate-spin" size={20} /> : null}
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>

          <div className="relative flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-xs text-slate-400">ou</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <button
            type="button"
            onClick={onCadastro}
            className="w-full flex items-center justify-center gap-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium py-3 rounded-lg text-sm transition-colors"
          >
            <KeyRound size={16} className="text-orange-600" />
            Ativar acesso com código
          </button>
        </form>
      </div>
    </div>
  );
}
