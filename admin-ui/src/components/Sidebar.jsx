import React from 'react';
import { LayoutDashboard, Database, Wrench, MessageSquareCode, Users, LogOut, ShieldCheck, Shield } from 'lucide-react';

const SidebarItem = ({ icon, label, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-300 text-sm font-medium
      ${isActive
        ? 'bg-[#168bf2]/10 text-[#168bf2] shadow-[inset_2px_0_0_#168bf2]'
        : 'text-slate-400 hover:text-slate-200 hover:bg-[#3d3d3d]/50'
      }`}
  >
    <span className="text-lg w-5 h-5 flex items-center justify-center">{icon}</span>
    {label}
  </button>
);

export default function Sidebar({ activeView, setActiveView, user, onLogout }) {
  const isSuperadmin = user?.role === 'superadmin';

  return (
    <aside className="w-64 bg-[#2d2d2d] border-r border-[#3d3d3d]/80 flex flex-col z-20 shadow-2xl relative">
      {/* Brand Logo Area */}
      <div className="h-24 flex items-center px-6 border-b border-[#3d3d3d]/50 mb-6">
        <div className="flex items-center gap-3 w-full">
          <div className="bg-white p-1.5 rounded-lg shadow-lg">
            <img src="/Logo-Gamma-Ingenieros-(Negro).png" alt="Gamma Logo" className="h-8 w-auto object-contain" />
          </div>
          <div>
            <h2 className="text-white font-bold leading-tight tracking-wide">Gamma</h2>
            <p className="text-xs text-[#5bd893] tracking-widest uppercase font-semibold">Admin Panel</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-2">
        <SidebarItem
          icon={<LayoutDashboard size={20} />}
          label="Dashboard"
          isActive={activeView === 'dashboard'}
          onClick={() => setActiveView('dashboard')}
        />
        <SidebarItem
          icon={<Database size={20} />}
          label="RAG Brain"
          isActive={activeView === 'rag'}
          onClick={() => setActiveView('rag')}
        />
        <SidebarItem
          icon={<MessageSquareCode size={20} />}
          label="Widget Chat"
          isActive={activeView === 'widget'}
          onClick={() => setActiveView('widget')}
        />
        <SidebarItem
          icon={<Wrench size={20} />}
          label="Integraciones (Tools)"
          isActive={activeView === 'tools'}
          onClick={() => setActiveView('tools')}
        />

        {/* Separator */}
        <div className="border-t border-[#3d3d3d]/60 my-2 pt-2">
          <SidebarItem
            icon={<Users size={20} />}
            label="Administradores"
            isActive={activeView === 'users'}
            onClick={() => setActiveView('users')}
          />
        </div>
      </nav>

      {/* Bottom Profile + Logout */}
      <div className="p-4 space-y-2">
        <div className="p-3 rounded-xl bg-[#3d3d3d]/30 border border-[#4a4a4a]/50 relative overflow-hidden group hover:border-[#168bf2]/30 transition-colors">
          <div className="absolute top-0 right-0 w-16 h-16 bg-[#168bf2]/10 blur-xl group-hover:bg-[#168bf2]/20 transition-all rounded-full transform translate-x-8 -translate-y-8" />
          <div className="flex items-center gap-2 mb-0.5">
            {isSuperadmin
              ? <ShieldCheck size={12} className="text-purple-400" />
              : <Shield size={12} className="text-[#5bd893]" />}
            <p className="text-xs text-slate-400 capitalize">{user?.role || 'admin'}</p>
          </div>
          <p className="text-sm font-semibold text-slate-200 truncate">{user?.full_name || user?.email}</p>
          {user?.full_name && <p className="text-xs text-slate-500 truncate">{user?.email}</p>}
        </div>

        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/5 transition-colors text-sm"
        >
          <LogOut size={16} />
          Cerrar Sesión
        </button>
      </div>
    </aside>
  );
}
