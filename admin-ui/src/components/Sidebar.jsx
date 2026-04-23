import React from 'react';

const SidebarItem = ({ icon, label, isActive, onClick }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-300 text-sm font-medium
      ${isActive 
        ? 'bg-emerald-500/10 text-emerald-400 shadow-[inset_2px_0_0_rgba(16,185,129,1)]' 
        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
      }`}
  >
    <span className="text-lg">{icon}</span>
    {label}
  </button>
);

export default function Sidebar({ activeView, setActiveView }) {
  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800/80 flex flex-col z-20 shadow-2xl relative">
       {/* Brand Logo Area */}
       <div className="h-24 flex items-center px-6 border-b border-slate-800/50 mb-6">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 border border-slate-700 flex items-center justify-center shadow-lg">
                <span className="text-emerald-400 text-xl font-bold font-mono">G</span>
             </div>
             <div>
                <h2 className="text-white font-bold leading-tight tracking-wide">Gamma</h2>
                <p className="text-xs text-slate-500 tracking-widest uppercase">Admin Panel</p>
             </div>
          </div>
       </div>

       {/* Navigation */}
       <nav className="flex-1 px-4 space-y-2">
         <SidebarItem 
           icon="??" 
           label="Dashboard" 
           isActive={activeView === 'dashboard'} 
           onClick={() => setActiveView('dashboard')} 
         />
         <SidebarItem 
           icon="??" 
           label="RAG Brain" 
           isActive={activeView === 'rag'} 
           onClick={() => setActiveView('rag')} 
         />
         <SidebarItem 
           icon="??" 
           label="Integraciones (Tools)" 
           isActive={activeView === 'tools'} 
           onClick={() => setActiveView('tools')} 
         />
       </nav>

       {/* Bottom Profile/Info */}
       <div className="p-4 m-4 rounded-xl bg-slate-800/30 border border-slate-700/50 relative overflow-hidden group hover:border-emerald-500/30 transition-colors">
          <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 blur-xl group-hover:bg-emerald-500/20 transition-all rounded-full transform translate-x-8 -translate-y-8"></div>
          <p className="text-xs text-slate-400">Admin</p>
          <p className="text-sm font-semibold text-slate-200">ciso@gammaingenieros.com</p>
       </div>
    </aside>
  );
}
