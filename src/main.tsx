import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Root from './Root.tsx';
import { AuthProvider } from './contexts/AuthContext.tsx';
import './index.css';

// Remove splash screen assim que o React montar
document.getElementById('splash')?.remove();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </StrictMode>,
);
