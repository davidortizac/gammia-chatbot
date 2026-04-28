import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Sidebar from './components/Sidebar';
import DashboardView from './views/DashboardView';
import RagView from './views/RagView';
import ToolsView from './views/ToolsView';
import WidgetView from './views/WidgetView';
import LoginView from './views/LoginView';
import AdminUsersView from './views/AdminUsersView';
import AgentsView from './views/AgentsView';

const TOKEN_KEY = 'gammia_admin_token';
const USER_KEY  = 'gammia_admin_user';

// Modal global renderizado en document.body, fuera de cualquier stacking context
export function GlobalModal({ children, onClose }) {
  if (!children) return null;
  return createPortal(
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      style={{ zIndex: 9999 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body
  );
}

function App() {
  const [token, setToken]       = useState(() => localStorage.getItem(TOKEN_KEY) || '');
  const [user, setUser]         = useState(() => {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
  });
  const [activeView, setActiveView] = useState('dashboard');

  function handleLogin(newToken, newUser) {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    setActiveView('dashboard');
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken('');
    setUser(null);
  }

  // Auto-logout if token is expired (basic client-side check)
  useEffect(() => {
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp && payload.exp * 1000 < Date.now()) handleLogout();
    } catch {
      handleLogout();
    }
  }, [token]);

  if (!token || !user) {
    return <LoginView onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen bg-[#1a1a1a] text-slate-300 font-sans selection:bg-[#168bf2]/30">
      <Sidebar
        activeView={activeView}
        setActiveView={setActiveView}
        user={user}
        onLogout={handleLogout}
      />
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <div className="absolute top-0 w-full h-40 bg-[#168bf2]/5 blur-[120px] pointer-events-none" />
        <header className="h-16 border-b border-[#3d3d3d]/60 bg-[#2d2d2d]/50 backdrop-blur-md flex items-center px-8 z-10 justify-between">
          <h1 className="text-xl font-medium tracking-tight text-white drop-shadow-sm">
            GammIA <span className="text-[#5bd893] font-light ml-1">Centro de Comando</span>
          </h1>
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-[#3dc156] shadow-[0_0_10px_rgba(61,193,86,0.8)] animate-pulse" />
            <span className="text-xs uppercase tracking-wider font-semibold text-[#3dc156]">API Online</span>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-8 z-10 custom-scrollbar">
          {activeView === 'dashboard' && <DashboardView />}
          {activeView === 'rag'       && <RagView />}
          {activeView === 'widget'    && <WidgetView token={token} />}
          {activeView === 'tools'     && <ToolsView />}
          {activeView === 'agents'    && <AgentsView token={token} />}
          {activeView === 'users'     && <AdminUsersView token={token} currentUser={user} />}
        </div>
      </main>
    </div>
  );
}

export default App;
