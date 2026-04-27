import React, { useState } from 'react';
import { BrainCircuit, CalendarCheck, Users, ShieldAlert } from 'lucide-react';

const ToolCard = ({ icon, name, description, activeByDefault, badge }) => {
  const [active, setActive] = useState(activeByDefault);
  
  return (
    <div className={`border rounded-2xl p-6 transition-all duration-300 ${active ? 'bg-[#168bf2]/5 border-[#168bf2]/30 shadow-[inset_0_0_20px_rgba(22,139,242,0.05)]' : 'bg-[#2d2d2d]/50 border-[#3d3d3d]/80 saturate-0 opacity-70'}`}>
       <div className="flex justify-between items-start mb-4">
          <div className="w-12 h-12 rounded-xl bg-[#3d3d3d] flex items-center justify-center text-2xl shadow-inner border border-[#4a4a4a] text-[#5bd893]">
             {icon}
          </div>
          <button
             onClick={() => setActive(!active)}
             className={`w-12 h-6 rounded-full relative transition-colors duration-300 focus:outline-none ${active ? 'bg-[#168bf2]' : 'bg-[#4a4a4a]'}`}
          >
             <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform duration-300 shadow-md ${active ? 'translate-x-7' : 'translate-x-1'}`}></div>
          </button>
       </div>
       <div className="flex items-center gap-2 mb-1">
         <h3 className={`text-lg font-semibold tracking-tight ${active ? 'text-white' : 'text-slate-400'}`}>{name}</h3>
         {badge && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">WIP</span>}
       </div>
       <p className="text-sm text-slate-500 mt-2 leading-relaxed">{description}</p>
       
       <div className="mt-6 pt-4 border-t border-[#3d3d3d]/50 flex items-center justify-between">
         <span className="text-xs font-mono text-slate-600">v1.2.0</span>
         <span className={`text-xs font-semibold px-2 py-0.5 rounded ${active ? 'bg-[#168bf2]/10 text-[#5bd893]' : 'bg-[#3d3d3d] text-slate-500'}`}>
            {active ? 'RUNNING' : 'DISABLED'}
         </span>
       </div>
    </div>
  );
};

export default function ToolsView() {
  return (
    <div className="max-w-7xl mx-auto animate-fade-in">
      <div className="mb-8">
         <h2 className="text-2xl font-bold text-white tracking-tight">Integraciones de IA (Function Calling)</h2>
         <p className="text-slate-400 text-sm mt-1">Habilita o deshabilita los super-poderes del agente GammIA globalmente.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
         <ToolCard 
           icon={<BrainCircuit size={22} />}
           name="Búsqueda Neural RAG"
           description="Habilita al agente para rastrear en pgvector y recuperar contexto interno ante preguntas técnicas o de política corporativa."
           activeByDefault={true}
         />
         <ToolCard 
           icon={<CalendarCheck size={22} />}
           name="Google Workspace Action"
           description="Inyecta la capacidad de leer calendarios, agendar citas o disparar correos desde la cuenta central ciso@gammaingenieros.com."
           activeByDefault={false}
         />
         <ToolCard 
           icon={<Users size={22} />}
           name="Salesforce CRM Link"
           description="Permite que GammIA consulte estatus de tickets o perfiles de clientes externos en tiempo real desde el CRM corporativo."
           activeByDefault={true}
         />
         <ToolCard 
           icon={<ShieldAlert size={22} />}
           name="Scanner Vulnerabilidades"
           description="[En Desarrollo] Interfaz para disparar análisis pasivos en infraestructura indicada y devolver el reporte JSON al agente."
           activeByDefault={false}
           badge="WIP"
         />
      </div>
    </div>
  );
}
