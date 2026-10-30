import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactElement } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import AppLayout from './components/AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import MessagesPage from './pages/MessagesPage';
import SettingsPage from './pages/SettingsPage';
import { SalonLogo } from './components/Logo';

/* ── Écran de chargement plein page ── */
function BootScreen() {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-salon-950 app-ambient gap-5">
      <SalonLogo size={64} className="animate-pulse" />
      <div className="text-center">
        <p className="font-display text-lg text-cream/90">Le Salon Privé</p>
        <p className="text-[10px] uppercase tracking-[0.3em] text-sage/70 mt-1.5">Ouverture des portes…</p>
      </div>
    </div>
  );
}

/* ── Garde de route : connexion obligatoire ── */
function Protected({ children }: { children: ReactElement }) {
  const { me, booting } = useApp();
  const location = useLocation();
  if (booting) return <BootScreen />;
  if (!me) {
    return <Navigate to="/connexion" state={{ from: location.pathname + location.search }} replace />;
  }
  return children;
}

/* ── /connexion redirige vers l'accueil si déjà connecté ── */
function LoginRoute() {
  const { me, booting } = useApp();
  if (booting) return <BootScreen />;
  if (me) return <Navigate to="/" replace />;
  return <LoginPage />;
}

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Routes>
          <Route path="/connexion" element={<LoginRoute />} />
          {/* Zone protégée par connexion */}
          <Route
            element={
              <Protected>
                <AppLayout />
              </Protected>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/messages/:conversationId" element={<MessagesPage />} />
            <Route path="/reglages" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AppProvider>
  );
}
