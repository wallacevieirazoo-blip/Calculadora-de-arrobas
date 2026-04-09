import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Users,
  CheckCircle,
  AlertCircle,
  Clock,
  Edit2,
  Loader2,
  Shield,
  RefreshCw,
  KeyRound,
  Copy,
  Check,
  Ticket,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/* ─── Tipos ─────────────────────────────────────────────── */
interface UsuarioAdmin {
  id: string;
  email: string;
  nome_completo: string;
  plano: string | null;
  ativa: boolean | null;
  data_inicio: string | null;
  data_vencimento: string | null;
  licenca_id: number | null;
  user_created_at: string;
}

interface Convite {
  id: number;
  email: string;
  nome: string;
  plano: string;
  data_vencimento: string | null;
  usado: boolean;
  codigo: string;
  created_at: string;
}

type PlanoType = 'mensal' | 'anual' | 'vitalicio';
type AbaType = 'usuarios' | 'convites';

interface LicencaForm {
  plano: PlanoType;
  data_vencimento: string;
  ativa: boolean;
}

interface ConviteForm {
  nome: string;
  email: string;
  plano: PlanoType;
  data_vencimento: string;
}

interface Props {
  onClose: () => void;
}

/* ─── Helpers ────────────────────────────────────────────── */
function defaultVencimento(plano: PlanoType): string {
  const d = new Date();
  if (plano === 'mensal') d.setMonth(d.getMonth() + 1);
  else if (plano === 'anual') d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function gerarCodigo(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/* ─── Componente ─────────────────────────────────────────── */
export function AdminPanel({ onClose }: Props) {
  const { user } = useAuth();
  const [aba, setAba] = useState<AbaType>('usuarios');

  // Usuários
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [loadingUsuarios, setLoadingUsuarios] = useState(true);
  const [errorUsuarios, setErrorUsuarios] = useState<string | null>(null);
  const [modalLicenca, setModalLicenca] = useState<UsuarioAdmin | null>(null);
  const [formLicenca, setFormLicenca] = useState<LicencaForm>({ plano: 'mensal', data_vencimento: defaultVencimento('mensal'), ativa: true });
  const [savingLicenca, setSavingLicenca] = useState(false);

  // Convites
  const [convites, setConvites] = useState<Convite[]>([]);
  const [loadingConvites, setLoadingConvites] = useState(false);
  const [showModalConvite, setShowModalConvite] = useState(false);
  const [formConvite, setFormConvite] = useState<ConviteForm>({ nome: '', email: '', plano: 'mensal', data_vencimento: defaultVencimento('mensal') });
  const [savingConvite, setSavingConvite] = useState(false);
  const [codigoCriado, setCodigoCriado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  /* ── Carregar usuários ── */
  const carregarUsuarios = useCallback(async () => {
    setLoadingUsuarios(true);
    setErrorUsuarios(null);
    try {
      const { data, error } = await supabase.rpc('listar_usuarios_admin');
      if (error) throw new Error(error.message);
      setUsuarios((data as UsuarioAdmin[]) ?? []);
    } catch (err) {
      setErrorUsuarios(err instanceof Error ? err.message : 'Erro ao carregar usuários');
    } finally {
      setLoadingUsuarios(false);
    }
  }, []);

  /* ── Carregar convites ── */
  const carregarConvites = useCallback(async () => {
    setLoadingConvites(true);
    try {
      const { data, error } = await supabase
        .from('convites')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      setConvites((data as Convite[]) ?? []);
    } finally {
      setLoadingConvites(false);
    }
  }, []);

  useEffect(() => { void carregarUsuarios(); }, [carregarUsuarios]);
  useEffect(() => { if (aba === 'convites') void carregarConvites(); }, [aba, carregarConvites]);

  /* ── Licença: abrir modal ── */
  const abrirModalLicenca = (u: UsuarioAdmin) => {
    const plano: PlanoType = (u.plano as PlanoType) || 'mensal';
    setFormLicenca({
      plano,
      data_vencimento: u.data_vencimento
        ? new Date(u.data_vencimento).toISOString().slice(0, 10)
        : defaultVencimento(plano),
      ativa: u.ativa ?? true,
    });
    setModalLicenca(u);
  };

  /* ── Licença: salvar ── */
  const salvarLicenca = async () => {
    if (!modalLicenca) return;
    setSavingLicenca(true);
    try {
      const vencimento = formLicenca.plano === 'vitalicio' ? null : formLicenca.data_vencimento || null;
      if (modalLicenca.licenca_id) {
        const { error } = await supabase.from('licencas')
          .update({ plano: formLicenca.plano, ativa: formLicenca.ativa, data_vencimento: vencimento })
          .eq('id', modalLicenca.licenca_id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from('licencas').insert({
          user_id: modalLicenca.id,
          plano: formLicenca.plano,
          ativa: formLicenca.ativa,
          data_inicio: new Date().toISOString(),
          data_vencimento: vencimento,
        });
        if (error) throw new Error(error.message);
      }
      setModalLicenca(null);
      await carregarUsuarios();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar licença');
    } finally {
      setSavingLicenca(false);
    }
  };

  /* ── Licença: toggle ativar/desativar ── */
  const toggleLicenca = async (u: UsuarioAdmin) => {
    if (!u.licenca_id) return;
    await supabase.from('licencas').update({ ativa: !u.ativa }).eq('id', u.licenca_id);
    await carregarUsuarios();
  };

  /* ── Convite: criar ── */
  const criarConvite = async () => {
    if (!formConvite.nome.trim() || !formConvite.email.trim()) return;
    setSavingConvite(true);
    try {
      const codigo = gerarCodigo();
      const { error } = await supabase.from('convites').insert({
        nome: formConvite.nome.trim(),
        email: formConvite.email.trim().toLowerCase(),
        plano: formConvite.plano,
        data_vencimento: formConvite.plano === 'vitalicio' ? null : formConvite.data_vencimento || null,
        codigo,
      });
      if (error) throw new Error(error.message);
      setCodigoCriado(codigo);
      await carregarConvites();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao criar convite');
    } finally {
      setSavingConvite(false);
    }
  };

  const copiarCodigo = async (cod: string) => {
    await navigator.clipboard.writeText(cod);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  /* ── Status da licença ── */
  const statusLicenca = (u: UsuarioAdmin) => {
    if (!u.plano) return { label: 'Sem licença', color: 'text-slate-500', bg: 'bg-slate-100' };
    if (!u.ativa) return { label: 'Desativada', color: 'text-red-600', bg: 'bg-red-50' };
    if (u.plano === 'vitalicio') return { label: 'Vitalício', color: 'text-purple-700', bg: 'bg-purple-50' };
    if (u.data_vencimento && new Date(u.data_vencimento) <= new Date())
      return { label: 'Expirada', color: 'text-red-600', bg: 'bg-red-50' };
    return { label: 'Ativa', color: 'text-green-700', bg: 'bg-green-50' };
  };

  const stats = {
    total: usuarios.length,
    ativas: usuarios.filter((u) => ['Ativa', 'Vitalício'].includes(statusLicenca(u).label)).length,
    aguardando: usuarios.filter((u) => !u.plano).length,
  };

  const nomePlano = (p: string) => p === 'vitalicio' ? 'Vitalício' : p === 'anual' ? 'Anual' : 'Mensal';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Shield className="text-orange-400" size={22} />
          <div>
            <h1 className="font-bold text-base leading-tight">Painel Administrativo</h1>
            <p className="text-slate-400 text-xs">Gerenciamento de licenças</p>
          </div>
        </div>
        <button onClick={onClose} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors">
          <X size={18} /> Voltar ao app
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <Users className="mx-auto text-slate-400 mb-1" size={20} />
            <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
            <p className="text-xs text-slate-500 mt-0.5">Usuários</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <CheckCircle className="mx-auto text-green-500 mb-1" size={20} />
            <p className="text-2xl font-bold text-slate-900">{stats.ativas}</p>
            <p className="text-xs text-slate-500 mt-0.5">Licenças ativas</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <Clock className="mx-auto text-orange-500 mb-1" size={20} />
            <p className="text-2xl font-bold text-slate-900">{stats.aguardando}</p>
            <p className="text-xs text-slate-500 mt-0.5">Aguardando</p>
          </div>
        </div>

        {/* Abas */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
          <button
            onClick={() => setAba('usuarios')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${aba === 'usuarios' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Users size={15} /> Usuários
          </button>
          <button
            onClick={() => setAba('convites')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${aba === 'convites' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Ticket size={15} /> Convites
          </button>
        </div>

        {/* ── ABA USUÁRIOS ── */}
        {aba === 'usuarios' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Usuários cadastrados</h2>
              <button onClick={() => void carregarUsuarios()} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors">
                <RefreshCw size={13} /> Atualizar
              </button>
            </div>
            {loadingUsuarios ? (
              <div className="flex justify-center py-16"><Loader2 className="animate-spin text-orange-600" size={28} /></div>
            ) : errorUsuarios ? (
              <div className="p-6 text-red-600 text-sm text-center">{errorUsuarios}</div>
            ) : usuarios.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">Nenhum usuário cadastrado ainda</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {usuarios.map((u) => {
                  const status = statusLicenca(u);
                  const isMe = u.id === user?.id;
                  return (
                    <div key={u.id} className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-900 truncate">{u.nome_completo || u.email}</p>
                          {isMe && <span className="shrink-0 text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-semibold">você</span>}
                        </div>
                        <p className="text-xs text-slate-400 truncate">{u.email}</p>
                        <p className="text-xs text-slate-400 mt-0.5">Desde {new Date(u.user_created_at).toLocaleDateString('pt-BR')}</p>
                      </div>
                      {u.data_vencimento && u.plano !== 'vitalicio' && (
                        <div className="text-right shrink-0 hidden sm:block">
                          <p className="text-xs text-slate-400">vence em</p>
                          <p className="text-xs font-medium text-slate-600">{new Date(u.data_vencimento).toLocaleDateString('pt-BR')}</p>
                        </div>
                      )}
                      <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${status.bg} ${status.color}`}>
                        {status.label}{u.plano && u.plano !== 'vitalicio' ? ` · ${u.plano}` : ''}
                      </span>
                      {!isMe && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => abrirModalLicenca(u)} title="Editar licença" className="p-1.5 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors">
                            <Edit2 size={15} />
                          </button>
                          {u.licenca_id && (
                            <button onClick={() => void toggleLicenca(u)} title={u.ativa ? 'Desativar' : 'Ativar'} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                              {u.ativa ? <AlertCircle size={15} /> : <CheckCircle size={15} />}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── ABA CONVITES ── */}
        {aba === 'convites' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">Convites de acesso</h2>
                <button
                  onClick={() => {
                    setFormConvite({ nome: '', email: '', plano: 'mensal', data_vencimento: defaultVencimento('mensal') });
                    setCodigoCriado(null);
                    setShowModalConvite(true);
                  }}
                  className="flex items-center gap-1.5 text-xs bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                >
                  <KeyRound size={13} /> Novo convite
                </button>
              </div>

              {loadingConvites ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin text-orange-600" size={24} /></div>
              ) : convites.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">Nenhum convite criado ainda</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {convites.map((c) => (
                    <div key={c.id} className="px-6 py-4 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900">{c.nome}</p>
                        <p className="text-xs text-slate-400">{c.email}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{nomePlano(c.plano)}{c.data_vencimento ? ` · até ${new Date(c.data_vencimento).toLocaleDateString('pt-BR')}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <code className="text-xs font-mono bg-slate-100 px-2 py-1 rounded tracking-widest text-slate-700">{c.codigo}</code>
                        <button onClick={() => void copiarCodigo(c.codigo)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded transition-colors">
                          <Copy size={13} />
                        </button>
                      </div>
                      <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${c.usado ? 'bg-slate-100 text-slate-400' : 'bg-green-50 text-green-700'}`}>
                        {c.usado ? 'Utilizado' : 'Pendente'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Modal editar licença ── */}
      {modalLicenca && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-5">
              <h3 className="font-bold">{modalLicenca.licenca_id ? 'Editar licença' : 'Ativar licença'}</h3>
              <p className="text-slate-400 text-xs mt-0.5 truncate">{modalLicenca.nome_completo} · {modalLicenca.email}</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Plano</label>
                <select
                  value={formLicenca.plano}
                  onChange={(e) => {
                    const p = e.target.value as PlanoType;
                    setFormLicenca((f) => ({ ...f, plano: p, data_vencimento: p !== 'vitalicio' ? defaultVencimento(p) : f.data_vencimento }));
                  }}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                >
                  <option value="mensal">Mensal</option>
                  <option value="anual">Anual</option>
                  <option value="vitalicio">Vitalício</option>
                </select>
              </div>
              {formLicenca.plano !== 'vitalicio' && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Data de vencimento</label>
                  <input
                    type="date"
                    value={formLicenca.data_vencimento}
                    onChange={(e) => setFormLicenca((f) => ({ ...f, data_vencimento: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                  />
                </div>
              )}
              <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                <input type="checkbox" checked={formLicenca.ativa} onChange={(e) => setFormLicenca((f) => ({ ...f, ativa: e.target.checked }))} className="w-4 h-4 accent-orange-600" />
                <span className="text-sm text-slate-700">Licença ativa</span>
              </label>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setModalLicenca(null)} className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 py-2.5 rounded-lg text-sm font-medium transition-colors">Cancelar</button>
              <button onClick={() => void salvarLicenca()} disabled={savingLicenca} className="flex-1 flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors">
                {savingLicenca ? <Loader2 className="animate-spin" size={16} /> : null}
                {savingLicenca ? 'Salvando…' : 'Salvar licença'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal novo convite ── */}
      {showModalConvite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-5">
              <h3 className="font-bold">{codigoCriado ? 'Convite criado!' : 'Novo convite'}</h3>
              <p className="text-slate-400 text-xs mt-0.5">
                {codigoCriado ? 'Envie o código abaixo para o cliente' : 'Preencha os dados do novo usuário'}
              </p>
            </div>

            {codigoCriado ? (
              <div className="p-6 space-y-5 text-center">
                <p className="text-sm text-slate-600">
                  O código abaixo deve ser enviado para <strong>{formConvite.email}</strong>
                </p>
                <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-5">
                  <p className="text-xs text-orange-600 font-semibold uppercase tracking-wider mb-2">Código de acesso</p>
                  <p className="text-3xl font-mono font-bold text-orange-700 tracking-widest">{codigoCriado}</p>
                </div>
                <button
                  onClick={() => void copiarCodigo(codigoCriado)}
                  className="flex items-center gap-2 mx-auto text-sm text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 px-4 py-2 rounded-lg transition-colors"
                >
                  {copiado ? <Check size={15} className="text-green-600" /> : <Copy size={15} />}
                  {copiado ? 'Copiado!' : 'Copiar código'}
                </button>
                <p className="text-xs text-slate-400">
                  Instrua o cliente a acessar o app, clicar em "Ativar acesso" e inserir o e-mail + este código.
                </p>
                <button
                  onClick={() => setShowModalConvite(false)}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 rounded-lg transition-colors"
                >
                  Fechar
                </button>
              </div>
            ) : (
              <div className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Nome do cliente</label>
                  <input
                    type="text"
                    value={formConvite.nome}
                    onChange={(e) => setFormConvite((f) => ({ ...f, nome: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                    placeholder="Nome completo"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">E-mail do cliente</label>
                  <input
                    type="email"
                    value={formConvite.email}
                    onChange={(e) => setFormConvite((f) => ({ ...f, email: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                    placeholder="cliente@email.com"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Plano</label>
                  <select
                    value={formConvite.plano}
                    onChange={(e) => {
                      const p = e.target.value as PlanoType;
                      setFormConvite((f) => ({ ...f, plano: p, data_vencimento: p !== 'vitalicio' ? defaultVencimento(p) : f.data_vencimento }));
                    }}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                  >
                    <option value="mensal">Mensal</option>
                    <option value="anual">Anual</option>
                    <option value="vitalicio">Vitalício</option>
                  </select>
                </div>
                {formConvite.plano !== 'vitalicio' && (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Vencimento</label>
                    <input
                      type="date"
                      value={formConvite.data_vencimento}
                      onChange={(e) => setFormConvite((f) => ({ ...f, data_vencimento: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                    />
                  </div>
                )}
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowModalConvite(false)} className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 py-2.5 rounded-lg text-sm font-medium transition-colors">Cancelar</button>
                  <button
                    onClick={() => void criarConvite()}
                    disabled={savingConvite || !formConvite.nome.trim() || !formConvite.email.trim()}
                    className="flex-1 flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors"
                  >
                    {savingConvite ? <Loader2 className="animate-spin" size={16} /> : null}
                    {savingConvite ? 'Gerando…' : 'Gerar código'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
