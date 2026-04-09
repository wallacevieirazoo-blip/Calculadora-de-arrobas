import { Beef, Clock, AlertTriangle, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { Licenca } from '../contexts/AuthContext';

interface Props {
  licenca: Licenca | null;
}

export function SemLicenca({ licenca }: Props) {
  const { signOut } = useAuth();

  const expirou =
    licenca &&
    (!licenca.ativa ||
      (licenca.data_vencimento != null &&
        new Date(licenca.data_vencimento) <= new Date()));

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-200 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200/80 overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 text-white px-8 py-10 text-center">
          <Beef className="mx-auto mb-3 text-orange-400" size={40} />
          <h1 className="text-2xl font-bold tracking-tight">Calculadora de Arrobas</h1>
        </div>

        <div className="p-8 text-center space-y-5">
          {expirou ? (
            <>
              <AlertTriangle className="mx-auto text-red-500" size={40} />
              <h2 className="text-lg font-bold text-slate-900">Licença expirada</h2>
              <p className="text-sm text-slate-600">
                Sua licença venceu. Entre em contato para renovar e continuar acessando.
              </p>
            </>
          ) : (
            <>
              <Clock className="mx-auto text-orange-500" size={40} />
              <h2 className="text-lg font-bold text-slate-900">Aguardando ativação</h2>
              <p className="text-sm text-slate-600">
                Sua conta foi criada com sucesso!<br />
                Aguarde a ativação da sua licença pelo administrador.
              </p>
            </>
          )}

          {/* Contato */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-sm text-orange-800 text-left space-y-1">
            <p className="font-semibold mb-2">Entre em contato para {expirou ? 'renovar' : 'ativar'} sua licença:</p>
            <p>📱 WhatsApp: (XX) XXXXX-XXXX</p>
            <p>📧 seu@email.com.br</p>
          </div>

          <button
            onClick={() => void signOut()}
            className="flex items-center gap-2 mx-auto text-sm text-slate-400 hover:text-slate-700 transition-colors"
          >
            <LogOut size={14} />
            Sair da conta
          </button>
        </div>
      </div>
    </div>
  );
}
