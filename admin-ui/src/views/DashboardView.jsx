import React from 'react';

const StatCard = ({ title, value, subtext, trend, isPositive }) => (
  <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800/80 rounded-2xl p-6 relative overflow-hidden group hover:border-slate-700 transition-colors">
    <div className="relative z-10">
      <h3 className="text-slate-400 text-sm font-medium mb-2">{title}</h3>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-white tracking-tight">{value}</span>
        {trend && (
          <span className={`text-xs font-semibold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
            {trend}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500 mt-2">{subtext}</p>
    </div>
    {/* Subtle Background Glow on Hover */}
    <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-gradient-to-br from-slate-800 to-transparent rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500"></div>
  </div>
);

export default function DashboardView() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
      <div className="flex justify-between items-end mb-8">
         <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Financial & Usage Overview</h2>
            <p className="text-slate-400 text-sm mt-1">Monitoreo en tiempo real de GammIA Engine (gemini-2.5-flash)</p>
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Tokens Consumidos (Hoy)" 
          value="1.2M" 
          subtext="? 45,000 requests" 
          trend="+12%" 
          isPositive={false} 
        />
        <StatCard 
          title="Costo Estimado LLM" 
          value="$0.45" 
          subtext="USD / día" 
          trend="-2%" 
          isPositive={true} 
        />
        <StatCard 
          title="Latencia Promedio" 
          value="850ms" 
          subtext="Vector Search + GenAI" 
          trend="-50ms" 
          isPositive={true} 
        />
        <StatCard 
          title="Vectores RAG Activos" 
          value="14,204" 
          subtext="Fragmentos en pgvector" 
          trend="+402" 
          isPositive={true} 
        />
      </div>

      {/* Mock Chart Area */}
      <div className="mt-8 bg-slate-900/50 backdrop-blur-sm border border-slate-800/80 rounded-2xl p-6 h-96 flex flex-col relative overflow-hidden group">
         <h3 className="text-slate-400 text-sm font-medium mb-6">Tráfico de Tokens (Últimos 7 días)</h3>
         <div className="flex-1 border-b border-l border-slate-800 flex items-end justify-between px-4 pb-4">
            {/* Dummy bars */}
            {[40, 70, 45, 90, 65, 80, 100].map((h, i) => (
               <div key={i} className="w-12 bg-gradient-to-t from-emerald-500/20 to-emerald-400/80 rounded-t-sm hover:from-emerald-400/40 hover:to-emerald-300 transition-colors" style={{ height: `${h}%` }}></div>
            ))}
         </div>
         <div className="flex justify-between px-4 text-xs text-slate-500 mt-2 font-mono">
            <span>Lun</span><span>Mar</span><span>Mie</span><span>Jue</span><span>Vie</span><span>Sab</span><span>Dom</span>
         </div>
      </div>
    </div>
  );
}
