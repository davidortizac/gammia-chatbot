import React, { useState, useEffect } from 'react';
import { Activity, Database, Cpu, Zap } from 'lucide-react';
import { API_CONFIG } from '../config';

const StatCard = ({ icon, title, value, subtext, trend, isPositive, loading }) => (
  <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800/80 rounded-2xl p-6 relative overflow-hidden group hover:border-slate-700 transition-colors">
    <div className="relative z-10">
      <div className="flex items-center gap-2 mb-3">
        <div className="text-emerald-400 opacity-70">{icon}</div>
        <h3 className="text-slate-400 text-sm font-medium">{title}</h3>
      </div>
      <div className="flex items-baseline gap-2">
        {loading ? (
          <div className="h-8 w-24 bg-slate-800 animate-pulse rounded" />
        ) : (
          <span className="text-3xl font-bold text-white tracking-tight">{value}</span>
        )}
        {trend && !loading && (
          <span className={`text-xs font-semibold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
            {trend}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500 mt-2">{subtext}</p>
    </div>
    <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-gradient-to-br from-slate-800 to-transparent rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500"></div>
  </div>
);

export default function DashboardView() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_CONFIG.BASE_URL}/api/v1/analytics/stats`, {
          headers: API_CONFIG.getHeaders()
        });
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (e) {
        console.error('Error fetching stats:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const fmtTokens = (n) => n >= 1000000 ? `${(n/1000000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(1)}K` : `${n}`;

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
      <div className="flex justify-between items-end mb-8">
         <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Centro de Comando</h2>
            <p className="text-slate-400 text-sm mt-1">Métricas en tiempo real — GammIA Engine (gemini-2.5-flash)</p>
         </div>
         <button 
           onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 1000); }}
           className="text-xs text-slate-400 hover:text-emerald-400 transition-colors border border-slate-700 rounded-lg px-3 py-1.5"
         >
           Actualizar
         </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          icon={<Zap size={16} />}
          title="Tokens Consumidos (Total)" 
          value={stats ? fmtTokens(stats.total_tokens) : '0'} 
          subtext={`${stats?.total_interactions ?? 0} interacciones registradas`}
          loading={loading}
        />
        <StatCard 
          icon={<Activity size={16} />}
          title="Latencia Promedio" 
          value={stats ? `${stats.avg_latency_ms}ms` : '—'} 
          subtext="Vector Search + GenAI"
          loading={loading}
        />
        <StatCard 
          icon={<Database size={16} />}
          title="Vectores RAG Activos" 
          value={stats ? stats.total_vectors.toLocaleString() : '0'}
          subtext="Fragmentos en pgvector (PostgreSQL)"
          loading={loading}
        />
        <StatCard 
          icon={<Cpu size={16} />}
          title="Modelo Activo"
          value="2.5-flash"
          subtext="gemini-2.5-flash — Google GenAI"
          loading={false}
        />
      </div>

      {/* Bar chart — token traffic, estético */}
      <div className="mt-8 bg-slate-900/50 backdrop-blur-sm border border-slate-800/80 rounded-2xl p-6 h-72 flex flex-col relative overflow-hidden">
         <h3 className="text-slate-400 text-sm font-medium mb-6">Actividad de Vectores RAG</h3>
         {stats && stats.total_vectors === 0 ? (
           <div className="flex-1 flex items-center justify-center">
             <p className="text-slate-600 text-sm">Sin datos aún — ejecuta el script de inyección para poblar el RAG.</p>
           </div>
         ) : (
           <div className="flex-1 border-b border-l border-slate-800 flex items-end justify-between px-4 pb-4">
             {[40, 70, 45, 90, 65, 80, 100].map((h, i) => (
                <div key={i} className="w-12 bg-gradient-to-t from-emerald-500/20 to-emerald-400/80 rounded-t-sm hover:from-emerald-400/40 hover:to-emerald-300 transition-colors" style={{ height: `${h}%` }}></div>
             ))}
           </div>
         )}
         <div className="flex justify-between px-4 text-xs text-slate-500 mt-2 font-mono">
            <span>Lun</span><span>Mar</span><span>Mie</span><span>Jue</span><span>Vie</span><span>Sab</span><span>Dom</span>
         </div>
      </div>
    </div>
  );
}
