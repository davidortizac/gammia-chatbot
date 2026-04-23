import { useState } from 'react';
import Sidebar from './components/Sidebar';
import DashboardView from './views/DashboardView';
import RagView from './views/RagView';
import ToolsView from './views/ToolsView';

function App() {
  const [activeView, setActiveView] = useState('dashboard');

  return (
    <div className="flex h-screen bg-[#0B1120] text-slate-300 font-sans selection:bg-emerald-500/30">
      
      {/* Navigation Sidebar */}
      <Sidebar activeView={activeView} setActiveView={setActiveView} />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Top Gradient Blur Effect for Premium Feel */}
        <div className="absolute top-0 w-full h-40 bg-emerald-500/5 blur-[120px] pointer-events-none"></div>

        {/* Top Header */}
        <header className="h-16 border-b border-slate-800/60 bg-slate-900/50 backdrop-blur-md flex items-center px-8 z-10 justify-between">
          <h1 className="text-xl font-medium tracking-tight text-white drop-shadow-sm">GammIA <span className="text-emerald-400 font-light ml-1">Centro de Comando</span></h1>
          <div className="flex items-center gap-3">
             <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)] animate-pulse"></div>
             <span className="text-xs uppercase tracking-wider font-semibold text-emerald-500">API Online</span>
          </div>
        </header>

        {/* Dynamic Views */}
        <div className="flex-1 overflow-y-auto p-8 z-10 custom-scrollbar">
          {activeView === 'dashboard' && <DashboardView />}
          {activeView === 'rag' && <RagView />}
          {activeView === 'tools' && <ToolsView />}
        </div>
      </main>
    </div>
  );
}

export default App;
