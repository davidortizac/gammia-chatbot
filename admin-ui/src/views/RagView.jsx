import React from 'react';

const mockDocuments = [
  { id: '1a2b', title: 'Politicas_Data_Loss_Prevention.pdf', hash: '8f2x...a1', version: 3, status: 'SYNCED', date: '2026-04-23' },
  { id: '3c4d', title: 'Guia_Zero_Trust_Gamma.docx', hash: 'p99s...e2', version: 1, status: 'SYNCED', date: '2026-04-20' },
  { id: '5e6f', title: 'Passwords_Produccion_OLD.pdf', hash: 'c51z...r4', version: 2, status: 'PENDING_DELETE', date: '2026-04-23' },
];

export default function RagView() {
  return (
    <div className="max-w-7xl mx-auto animate-fade-in">
      <div className="flex justify-between items-end mb-8">
         <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Gobernanza RAG</h2>
            <p className="text-slate-400 text-sm mt-1">Sincronización con "GammIA - Brain" (Google Drive)</p>
         </div>
         <button className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold px-4 py-2 rounded-lg text-sm shadow-[0_0_15px_rgba(16,185,129,0.4)] transition-all">
            + Forzar Sync
         </button>
      </div>

      <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800/80 rounded-2xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-800/50 border-b border-slate-700/80">
              <th className="p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Documento</th>
              <th className="p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Versión</th>
              <th className="p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Estado</th>
              <th className="p-4 text-xs font-medium text-slate-400 uppercase tracking-wider text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {mockDocuments.map((doc) => (
              <tr key={doc.id} className="hover:bg-slate-800/20 transition-colors">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">?</span>
                    <div>
                      <p className="text-sm font-medium text-slate-200">{doc.title}</p>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">Hash: {doc.hash}</p>
                    </div>
                  </div>
                </td>
                <td className="p-4">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
                    v{doc.version}
                  </span>
                </td>
                <td className="p-4">
                  {doc.status === 'SYNCED' ? (
                     <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                        <span className="text-xs font-medium text-emerald-400">Sincronizado</span>
                     </div>
                  ) : (
                     <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></div>
                        <span className="text-xs font-medium text-amber-400">Baja Pendiente</span>
                     </div>
                  )}
                </td>
                <td className="p-4 text-right">
                  {doc.status === 'PENDING_DELETE' ? (
                    <button className="text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30 px-3 py-1.5 rounded hover:bg-rose-500/20 transition-colors">
                      Aprobar Eliminación
                    </button>
                  ) : (
                    <button className="text-xs font-medium text-slate-400 hover:text-slate-200 underline decoration-slate-600 underline-offset-4">
                      Ver Log
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* Helper Footer */}
        <div className="bg-slate-900/80 p-4 border-t border-slate-800 text-xs text-slate-500 flex justify-between items-center">
           <span>Mostrando 3 de 145 documentos vectorizados.</span>
           <span>Último webhook recibido: Hoy, 09:14 AM</span>
        </div>
      </div>
    </div>
  );
}
