import { useState, type FormEvent } from 'react';
import { Beef, Loader2, ArrowLeft, KeyRound, CheckCircle, Lock } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Props {
  onBack: () => void;
}

type Etapa = 'codigo' | 'senha' | 'sucesso';

interface ConviteInfo {
  nome: string;
  plano: string;
}

export function AtivarAcessoPage({ onBack }: Props) {
  const [etapa, setEtapa] = useState<Etapa>('codigo');
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [conviteInfo, setConviteInfo] = useState<ConviteInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Etapa 1: valida o código
  const handleValidarCodigo = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('validar_convite', {
        p_email: email.trim().toLowerCase(),
        p_codigo: codigo.trim().toUpperCase(),
      });
      if (rpcError) throw new Error(rpcError.message);
      if (!data || data.length === 0) {
        setError('Código inválido ou já utilizado. Verifique e tente novamente.');
        return;
      }
      setConviteInfo({ nome: data[0].nome, plano: data[0].plano });
      setEtapa('senha');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao validar código');
    } finally {
      setLoading(false);
    }
  };

  // Etapa 2: cria a conta com senha
  const handleCriarConta = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    if (password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.');
      return;
    }
    setLoading(true);
    try {
      // Cria o usuário
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (signUpError) throw new Error(signUpError.message);
      if (!signUpData.user) throw new Error('Erro ao criar conta.');

      // Usa o convite (cria perfil + licença automaticamente)
      const { data: usouConvite, error: conviteError } = await supabase.rpc('usar_convite', {
        p_email: email.trim().toLowerCase(),
        p_codigo: codigo.trim().toUpperCase(),
        p_user_id: signUpData.user.id,
      });
      if (conviteError) throw new Error(conviteError.message);
      if (!usouConvite) throw new Error('Não foi possível ativar o convite.');

      setEtapa('sucesso');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao criar conta';
      if (msg.toLowerCase().includes('already registered')) {
        setError('Este e-mail já possui uma conta. Faça login normalmente.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const nomePlano = (p: string) =>
    p === 'vitalicio' ? 'Vitalício' : p === 'anual' ? 'Anual' : 'Mensal';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-200 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200/80 overflow-hidden">

        {/* Header */}
        <div className="bg-slate-900 text-white px-8 py-10 text-center">
          <Beef className="mx-auto mb-3 text-orange-400" size={40} />
          <h1 className="text-2xl font-bold tracking-tight">Calculadora de Arrobas</h1>
          <p className="text-slate-300 text-sm mt-2">
            {etapa === 'codigo' && 'Ativar acesso'}
            {etapa === 'senha' && 'Criar senha'}
            {etapa === 'sucesso' && 'Acesso ativado!'}
          </p>
        </div>

        {/* Etapa 1 — Código */}
        {etapa === 'codigo' && (
          <form onSubmit={(e) => void handleValidarCodigo(e)} className="p-8 space-y-5">
            <div className="flex items-center gap-2 text-slate-700 font-medium text-sm">
              <KeyRound size={16} className="text-orange-600" />
              Insira seu código de acesso
            </div>
            <p className="text-xs text-slate-500">
              Você recebeu um código do administrador. Insira abaixo para ativar seu acesso.
            </p>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">E-mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                placeholder="seu@email.com"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Código de acesso</label>
              <input
                type="text"
                required
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                maxLength={10}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-mono tracking-widest text-center uppercase focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                placeholder="EX: AB3K9XTY"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : null}
              {loading ? 'Validando…' : 'Validar código'}
            </button>

            <button
              type="button"
              onClick={onBack}
              className="w-full flex items-center justify-center gap-2 text-slate-500 hover:text-slate-700 text-sm transition-colors"
            >
              <ArrowLeft size={14} />
              Voltar ao login
            </button>
          </form>
        )}

        {/* Etapa 2 — Criar senha */}
        {etapa === 'senha' && conviteInfo && (
          <form onSubmit={(e) => void handleCriarConta(e)} className="p-8 space-y-5">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-green-800">Código válido! ✓</p>
              <p className="text-xs text-green-700 mt-1">
                Olá, <strong>{conviteInfo.nome}</strong> — plano <strong>{nomePlano(conviteInfo.plano)}</strong>
              </p>
            </div>

            <div className="flex items-center gap-2 text-slate-700 font-medium text-sm">
              <Lock size={16} className="text-orange-600" />
              Crie sua senha
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">E-mail</label>
              <input
                type="email"
                value={email}
                disabled
                className="w-full border border-slate-100 bg-slate-50 rounded-lg px-3 py-2.5 text-sm text-slate-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Nova senha</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Confirmar senha</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                placeholder="Repita a senha"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : null}
              {loading ? 'Ativando acesso…' : 'Ativar acesso'}
            </button>
          </form>
        )}

        {/* Etapa 3 — Sucesso */}
        {etapa === 'sucesso' && (
          <div className="p-8 text-center space-y-5">
            <CheckCircle className="mx-auto text-green-500" size={48} />
            <h2 className="text-lg font-bold text-slate-900">Acesso ativado!</h2>
            <p className="text-sm text-slate-600">
              Sua conta foi criada e sua licença já está ativa. Faça login para começar.
            </p>
            <button
              onClick={onBack}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              Ir para o login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
