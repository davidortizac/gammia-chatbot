import React, { useState, useEffect } from 'react';
import { Activity, Database, Cpu, Zap } from 'lucide-react';
import { API_CONFIG } from '../config';

const StatCard = ({ icon, title, value, subtext, trend, isPositive, loading }) => (
  <div className="bg-[#2d2d2d]/50 backdrop-blur-sm border border-[#3d3d3d]/80 rounded-2xl p-6 relative overflow-hidden group hover:border-[#3d3d3d] transition-colors">
    <div className="relative z-10">
      <div className="flex items-center gap-2 mb-3">
        <div className="text-[#5bd893] opacity-70">{icon}</div>
        <h3 className="text-slate-400 text-sm font-medium">{title}</h3>
      </div>
      <div className="flex items-baseline gap-2">
        {loading ? (
          <div className="h-8 w-24 bg-[#3d3d3d] animate-pulse rounded" />
        ) : (
          <span className="text-3xl font-bold text-white tracking-tight">{value}</span>
        )}
        {trend && !loading && (
          <span className={`text-xs font-semibold ${isPositive ? 'text-[#3dc156]' : 'text-rose-400'}`}>
            {trend}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500 mt-2">{subtext}</p>
    </div>
    <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-gradient-to-br from-[#3d3d3d] to-transparent rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500"></div>
  </div>
);

export default function DashboardView() {
  const [stats, setStats]         = useState(null);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [statsRes, chartRes] = await Promise.all([
          fetch(`${API_CONFIG.BASE_URL}/api/v1/analytics/stats`,                { headers: API_CONFIG.getHeaders() }),
          fetch(`${API_CONFIG.BASE_URL}/api/v1/analytics/daily-interactions`,   { headers: API_CONFIG.getHeaders() }),
        ]);
        if (statsRes.ok) setStats(await statsRes.json());
        if (chartRes.ok) setChartData(await chartRes.json());
      } catch (e) {
        console.error('Error fetching dashboard data:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const fmtTokens = (n) => n >= 1000000 ? `${(n/1000000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(1)}K` : `${n}`;

  const maxCount = chartData.length ? Math.max(...chartData.map(d => d.count), 1) : 1;

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
      <div className="flex justify-between items-end mb-8">
         <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Centro de Comando</h2>
            <p className="text-slate-400 text-sm mt-1">Métricas en tiempo real — GammIA Engine (gemini-2.5-flash)</p>
         </div>
         <button
           onClick={() => { setLoading(true); setStats(null); setChartData([]); setTimeout(() => setLoading(false), 800); }}
           className="text-xs text-slate-400 hover:text-[#5bd893] transition-colors border border-[#3d3d3d] rounded-lg px-3 py-1.5"
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

      {/* Bar chart — interacciones reales por día */}
      <div className="mt-8 bg-[#2d2d2d]/50 backdrop-blur-sm border border-[#3d3d3d]/80 rounded-2xl p-6 h-72 flex flex-col relative overflow-hidden">
         <div className="flex items-center justify-between mb-6">
           <h3 className="text-slate-400 text-sm font-medium">Interacciones por día (últimos 7 días)</h3>
           {!loading && chartData.length > 0 && (
             <span className="text-xs text-slate-500 font-mono">
               Total: {chartData.reduce((s, d) => s + d.count, 0)}
             </span>
           )}
         </div>

         {loading ? (
           <div className="flex-1 flex items-end justify-between px-4 pb-4 gap-2">
             {Array.from({ length: 7 }).map((_, i) => (
               <div key={i} className="flex-1 bg-[#3d3d3d] animate-pulse rounded-t-sm" style={{ height: `${30 + Math.random() * 50}%` }} />
             ))}
           </div>
         ) : chartData.every(d => d.count === 0) ? (
           <div className="flex-1 flex items-center justify-center">
             <p className="text-slate-600 text-sm">Sin interacciones registradas aún.</p>
           </div>
         ) : (
           <div className="flex-1 border-b border-l border-[#3d3d3d] flex items-end justify-between px-4 pb-4 gap-2">
             {chartData.map((d, i) => {
               const pct = maxCount > 0 ? Math.max((d.count / maxCount) * 100, d.count > 0 ? 6 : 0) : 0;
               return (
                 <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                   {d.count > 0 && (
                     <span className="text-[10px] text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity font-mono">{d.count}</span>
                   )}
                   <div
                     className="w-full bg-gradient-to-t from-[#168bf2]/30 to-[#5bd893]/80 rounded-t-sm hover:from-[#168bf2]/50 hover:to-[#5bd893] transition-colors"
                     style={{ height: `${pct}%` }}
                   />
                 </div>
               );
             })}
           </div>
         )}

         <div className="flex justify-between px-4 text-xs text-slate-500 mt-2 font-mono">
           {(chartData.length ? chartData : [{day:'Lun'},{day:'Mar'},{day:'Mié'},{day:'Jue'},{day:'Vie'},{day:'Sáb'},{day:'Dom'}]).map((d, i) => (
             <span key={i}>{d.day}</span>
           ))}
         </div>
      </div>
    </div>
  );
}
