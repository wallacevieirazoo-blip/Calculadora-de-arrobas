import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import App from './App.tsx';
import { LoginPage } from './components/LoginPage.tsx';
import { AtivarAcessoPage } from './components/AtivarAcessoPage.tsx';
import { SemLicenca } from './components/SemLicenca.tsx';
import { AdminPanel } from './components/AdminPanel.tsx';
import { useAuth, licencaValida } from './contexts/AuthContext.tsx';

export default function Root() {
  const { user, loading, configured, licenca, licencaLoading, isAdmin } = useAuth();
  const [showAtivar, setShowAtivar] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  // Verificando sessão
  if (loading && configured) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3 text-slate-600">
        <Loader2 className="animate-spin text-orange-600" size={32} />
        <p className="text-sm">Verificando sessão…</p>
      </div>
    );
  }

  // Não autenticado
  if (!user) {
    if (showAtivar) return <AtivarAcessoPage onBack={() => setShowAtivar(false)} />;
    return <LoginPage onCadastro={() => setShowAtivar(true)} />;
  }

  // Verificando licença
  if (licencaLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3 text-slate-600">
        <Loader2 className="animate-spin text-orange-600" size={32} />
        <p className="text-sm">Verificando licença…</p>
      </div>
    );
  }

  // Admin sempre tem acesso
  if (!isAdmin && !licencaValida(licenca)) {
    return <SemLicenca licenca={licenca} />;
  }

  // Painel admin
  if (showAdmin && isAdmin) {
    return <AdminPanel onClose={() => setShowAdmin(false)} />;
  }

  return <App onOpenAdmin={isAdmin ? () => setShowAdmin(true) : undefined} />;
}
