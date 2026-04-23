import React, { useState, useEffect, useRef } from 'react';
import { FileText, Upload, Tag, CheckCircle, AlertCircle, Loader, RotateCcw, Globe, HardDrive, Plus, X, Sparkles } from 'lucide-react';
import { API_CONFIG } from '../config';

const COLOR_OPTIONS = ['emerald','sky','violet','amber','rose','orange','teal','indigo','pink','red','lime','slate'];

function TagChip({ tag, selected, onClick }) {
  const colors = {
    emerald:'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    sky:'bg-sky-500/10 text-sky-400 border-sky-500/30',
    violet:'bg-violet-500/10 text-violet-400 border-violet-500/30',
    amber:'bg-amber-500/10 text-amber-400 border-amber-500/30',
    rose:'bg-rose-500/10 text-rose-400 border-rose-500/30',
    orange:'bg-orange-500/10 text-orange-400 border-orange-500/30',
    teal:'bg-teal-500/10 text-teal-400 border-teal-500/30',
    indigo:'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
    pink:'bg-pink-500/10 text-pink-400 border-pink-500/30',
    red:'bg-red-500/10 text-red-400 border-red-500/30',
    lime:'bg-lime-500/10 text-lime-400 border-lime-500/30',
    slate:'bg-slate-500/10 text-slate-400 border-slate-500/30',
  };
  const c = colors[tag.color] || colors.slate;
  return (
    <button type="button" onClick={() => onClick(tag.id)}
      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all
        ${selected ? `${c} scale-105 shadow-sm` : 'bg-slate-800/50 text-slate-500 border-slate-700 hover:border-slate-500'}`}>
      <Tag size={9} />{tag.label}
    </button>
  );
}

export default function RagView() {
  const [tab, setTab] = useState('upload'); // 'upload' | 'drive' | 'docs'
  const [tags, setTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState(['internal']);
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [driveFolder, setDriveFolder] = useState('');
  const [driveResult, setDriveResult] = useState(null);
  const [showNewTag, setShowNewTag] = useState(false);
  const [newTag, setNewTag] = useState({ id: '', label: '', color: 'emerald' });
  const [urlInput, setUrlInput] = useState('');
  const fileRef = useRef();

  const headers = API_CONFIG.getHeaders();

  const fetchTags = async () => {
    try {
      const r = await fetch(`${API_CONFIG.BASE_URL}/api/v1/rag/tags`, { headers });
      if (r.ok) { const d = await r.json(); setTags(d.tags || []); }
    } catch {}
  };

  const fetchDocs = async () => {
    setIsLoading(true);
    try {
      const r = await fetch(`${API_CONFIG.BASE_URL}/api/v1/rag/nodes`, { headers });
      if (r.ok) { const d = await r.json(); setDocuments(d.documents || []); }
    } catch {} finally { setIsLoading(false); }
  };

  useEffect(() => { fetchTags(); fetchDocs(); }, []);

  const toggleTag = (id) => setSelectedTags(p => p.includes(id) ? p.filter(t => t !== id) : [...p, id]);

  const processFile = async (file, autoSuggest = true) => {
    setStatus('loading'); setMessage('Analizando archivo...');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('tags', JSON.stringify(selectedTags));
    fd.append('requested_by', 'admin');
    fd.append('suggest_tags', autoSuggest ? 'true' : 'false');
    try {
      const r = await fetch(`${API_CONFIG.BASE_URL}/api/v1/rag/upload-file`, {
        method: 'POST', headers: { 'Authorization': headers['Authorization'] }, body: fd
      });
      const d = await r.json();
      if (d.status === 'suggestion') {
        setSuggestedTags(d.suggested_tags || []);
        setPendingFile(file);
        setSelectedTags(d.suggested_tags || selectedTags);
        setStatus('suggest');
        setMessage(`La IA sugiere estos tags para "${file.name}". Revisa, ajusta y confirma.`);
      } else if (d.status === 'success') {
        setStatus('ok'); setMessage(`✓ ${file.name}: ${d.chunks_inserted} fragmentos vectorizados con tags [${selectedTags.join(', ')}].`);
        setSuggestedTags(null); setPendingFile(null); fetchDocs();
      } else {
        setStatus('error'); setMessage(d.message || d.detail || 'Error en el servidor.');
      }
    } catch (e) { setStatus('error'); setMessage(`Error de conexión: ${e.message}`); }
  };

  const confirmUpload = async () => {
    if (!pendingFile) return;
    await processFile(pendingFile, false);
  };

  const handleUrlUpload = async () => {
    if (!urlInput) return;
    setStatus('loading'); setMessage('Scrapeando URL...');
    try {
      const r = await fetch(`${API_CONFIG.BASE_URL}/api/v1/rag/upload-url`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput, tags: selectedTags, suggest_tags: true })
      });
      const d = await r.json();
      if (d.status === 'suggestion') {
        setSuggestedTags(d.suggested_tags);
        setSelectedTags(d.suggested_tags);
        setStatus('suggest');
        setMessage(`Tags sugeridos para "${urlInput}". Revisa y confirma.`);
        setPendingFile({ type: 'url' });
      } else if (d.status === 'success') {
        setStatus('ok'); setMessage(`URL vectorizada: ${d.chunks_inserted} fragmentos.`); fetchDocs();
      } else { setStatus('error'); setMessage(d.message || 'Error'); }
    } catch (e) { setStatus('error'); setMessage(e.message); }
  };

  const confirmUrlUpload = async () => {
    setStatus('loading');
    try {
      const r = await fetch(`${API_CONFIG.BASE_URL}/api/v1/rag/upload-url`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput, tags: selectedTags, suggest_tags: false })
      });
      const d = await r.json();
      if (d.status === 'success') { setStatus('ok'); setMessage(`URL vectorizada: ${d.chunks_inserted} fragmentos.`); setSuggestedTags(null); setPendingFile(null); fetchDocs(); }
      else { setStatus('error'); setMessage(d.message || 'Error'); }
    } catch (e) { setStatus('error'); setMessage(e.message); }
  };

  const syncDrive = async () => {
    if (!driveFolder) return;
    setStatus('loading'); setMessage('Sincronizando carpeta de Google Drive...');
    try {
      const r = await fetch(`${API_CONFIG.BASE_URL}/api/v1/rag/sync-drive-folder`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_id: driveFolder, tags: selectedTags })
      });
      const d = await r.json();
      setDriveResult(d);
      setStatus('ok'); setMessage(`Drive sync completo: ${d.synced} nuevos, ${d.skipped} omitidos.`); fetchDocs();
    } catch (e) { setStatus('error'); setMessage(e.message); }
  };

  const createTag = async () => {
    if (!newTag.id || !newTag.label) return;
    try {
      const r = await fetch(`${API_CONFIG.BASE_URL}/api/v1/rag/tags`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(newTag)
      });
      if (r.ok) { setShowNewTag(false); setNewTag({ id:'', label:'', color:'emerald' }); fetchTags(); }
      else { const d = await r.json(); alert(d.detail); }
    } catch {}
  };

  const accepted = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md';

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Gobernanza RAG</h2>
          <p className="text-slate-400 text-sm mt-1">Base vectorial — pgvector en Google Cloud SQL</p>
        </div>
        <div className="flex gap-2">
          {['upload','drive','docs'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${tab===t ? 'bg-emerald-500 text-slate-900' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
              {t === 'upload' ? '↑ Subir' : t === 'drive' ? '⊟ Drive' : '≡ Documentos'}
            </button>
          ))}
        </div>
      </div>

      {/* Tag Picker + Create */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
        <div className="flex justify-between items-center mb-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tags RBAC — {selectedTags.length} seleccionado{selectedTags.length !== 1 ? 's' : ''}</p>
          <button onClick={() => setShowNewTag(true)} className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
            <Plus size={12} /> Nuevo tag
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {tags.map(t => <TagChip key={t.id} tag={t} selected={selectedTags.includes(t.id)} onClick={toggleTag} />)}
        </div>
      </div>

      {/* New Tag Modal */}
      {showNewTag && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md">
            <div className="flex justify-between mb-4">
              <h3 className="text-white font-semibold">Crear nuevo tag</h3>
              <button onClick={() => setShowNewTag(false)}><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              <input value={newTag.id} onChange={e => setNewTag({...newTag, id: e.target.value.toLowerCase().replace(/\s/g,'_')})}
                placeholder="ID (ej: legal, compliance)" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500" />
              <input value={newTag.label} onChange={e => setNewTag({...newTag, label: e.target.value})}
                placeholder="Etiqueta visual (ej: Legal)" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500" />
              <div>
                <p className="text-xs text-slate-400 mb-2">Color</p>
                <div className="flex flex-wrap gap-2">
                  {COLOR_OPTIONS.map(c => (
                    <button key={c} type="button" onClick={() => setNewTag({...newTag, color: c})}
                      className={`w-6 h-6 rounded-full bg-${c}-400 border-2 transition-all ${newTag.color===c ? 'border-white scale-125' : 'border-transparent'}`} />
                  ))}
                </div>
              </div>
              <button onClick={createTag} className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold py-2 rounded-lg text-sm transition-all">
                Crear tag
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UPLOAD TAB */}
      {tab === 'upload' && (
        <div className="space-y-4">
          {/* Drag & Drop Zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if(f) processFile(f, true); }}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all
              ${dragOver ? 'border-emerald-400 bg-emerald-500/10' : 'border-slate-700 hover:border-slate-500 bg-slate-900/30'}`}>
            <input ref={fileRef} type="file" accept={accepted} className="hidden" onChange={e => { if(e.target.files[0]) processFile(e.target.files[0], true); }} />
            <Upload size={36} className="mx-auto text-slate-500 mb-3" />
            <p className="text-slate-300 font-medium">Arrastra tu archivo aquí o haz clic para seleccionar</p>
            <p className="text-slate-600 text-xs mt-2">PDF, Word, Excel, PowerPoint, TXT, Markdown — máx. 50 MB</p>
          </div>

          {/* URL Input */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Globe size={16} className="text-slate-400" />
              <p className="text-sm font-medium text-slate-300">O vectoriza una página web</p>
            </div>
            <div className="flex gap-3">
              <input value={urlInput} onChange={e => setUrlInput(e.target.value)}
                placeholder="https://gammaingenieros.com/blog/zero-trust"
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500" />
              <button onClick={handleUrlUpload} disabled={!urlInput || status==='loading'}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium text-sm rounded-lg transition-all disabled:opacity-50">
                <Globe size={14} /> Scrapear
              </button>
            </div>
          </div>

          {/* AI Tag Suggestion Panel */}
          {status === 'suggest' && (
            <div className="bg-violet-900/20 border border-violet-500/30 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={16} className="text-violet-400" />
                <p className="text-sm font-semibold text-violet-300">Sugerencia de tags por IA</p>
              </div>
              <p className="text-xs text-slate-400 mb-3">{message}</p>
              <div className="flex flex-wrap gap-2 mb-4">
                {tags.map(t => <TagChip key={t.id} tag={t} selected={selectedTags.includes(t.id)} onClick={toggleTag} />)}
              </div>
              <div className="flex gap-3">
                <button onClick={pendingFile?.type === 'url' ? confirmUrlUpload : confirmUpload}
                  className="flex items-center gap-2 px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold text-sm rounded-lg transition-all">
                  <CheckCircle size={14} /> Confirmar y vectorizar
                </button>
                <button onClick={() => { setSuggestedTags(null); setPendingFile(null); setStatus(null); }}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancelar</button>
              </div>
            </div>
          )}

          {/* Status Messages */}
          {status === 'loading' && (
            <div className="flex items-center gap-3 p-4 bg-slate-800/50 rounded-xl">
              <Loader size={16} className="animate-spin text-emerald-400" />
              <p className="text-sm text-slate-300">{message || 'Procesando...'}</p>
            </div>
          )}
          {status === 'ok' && (
            <div className="flex items-start gap-2 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
              <CheckCircle size={16} className="text-emerald-400 mt-0.5 shrink-0" />
              <p className="text-sm text-emerald-300">{message}</p>
            </div>
          )}
          {status === 'error' && (
            <div className="flex items-start gap-2 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl">
              <AlertCircle size={16} className="text-rose-400 mt-0.5 shrink-0" />
              <p className="text-sm text-rose-300">{message}</p>
            </div>
          )}
        </div>
      )}

      {/* DRIVE TAB */}
      {tab === 'drive' && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <HardDrive size={18} className="text-emerald-400" />
            <h3 className="text-white font-semibold">Sincronización con Google Drive</h3>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-xs text-amber-300">
            <strong>Requisito:</strong> Comparte la carpeta de Drive con la cuenta de servicio de GammIA.<br/>
            El backend leerá todos los archivos soportados y vectorizará los nuevos automáticamente.
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">ID de la carpeta de Google Drive</label>
            <input value={driveFolder} onChange={e => setDriveFolder(e.target.value)}
              placeholder="Ej: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono" />
            <p className="text-xs text-slate-600 mt-1">Lo encuentras en la URL de Drive: drive.google.com/drive/folders/<strong>ID_AQUÍ</strong></p>
          </div>
          <p className="text-xs text-slate-500">Tags que se asignarán a todos los documentos importados de esta carpeta:</p>
          <div className="flex flex-wrap gap-2">
            {tags.map(t => <TagChip key={t.id} tag={t} selected={selectedTags.includes(t.id)} onClick={toggleTag} />)}
          </div>
          <button onClick={syncDrive} disabled={!driveFolder || status==='loading'}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-900 font-semibold text-sm rounded-lg transition-all">
            {status==='loading' ? <Loader size={14} className="animate-spin" /> : <HardDrive size={14} />}
            {status==='loading' ? 'Sincronizando...' : 'Sincronizar ahora'}
          </button>

          {driveResult && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase">Resultado</p>
              <div className="max-h-64 overflow-y-auto space-y-1">
                {driveResult.results?.map((r, i) => (
                  <div key={i} className={`flex justify-between items-center p-2 rounded-lg text-xs
                    ${r.status==='success' ? 'bg-emerald-500/10 text-emerald-300' : r.status==='error' ? 'bg-rose-500/10 text-rose-300' : 'bg-slate-800 text-slate-400'}`}>
                    <span className="font-mono truncate flex-1">{r.file}</span>
                    <span className="ml-3 font-semibold shrink-0">{r.status === 'success' ? `✓ ${r.chunks_inserted} chunks` : r.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* DOCS TAB */}
      {tab === 'docs' && (
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-800/50 border-b border-slate-700">
                <th className="p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Documento</th>
                <th className="p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Tags</th>
                <th className="p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Fuente</th>
                <th className="p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {isLoading ? (
                <tr><td colSpan="4" className="p-8 text-center text-slate-500"><Loader size={20} className="animate-spin inline mr-2" />Cargando...</td></tr>
              ) : documents.length === 0 ? (
                <tr><td colSpan="4" className="p-12 text-center text-slate-500">
                  Sin documentos. Ve a la pestaña "Subir" para agregar el primero.
                </td></tr>
              ) : documents.map(doc => (
                <tr key={doc.id} className="hover:bg-slate-800/20 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <FileText size={18} className="text-slate-500 shrink-0" strokeWidth={1.5} />
                      <div>
                        <p className="text-sm font-medium text-slate-200">{doc.title}</p>
                        <p className="text-xs text-slate-600 font-mono">{doc.hash} · v{doc.version}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-1">
                      {doc.tags?.map(tid => {
                        const found = tags.find(t => t.id === tid);
                        return <TagChip key={tid} tag={found || {id: tid, label: tid, color:'slate'}} selected={false} onClick={() => {}} />;
                      })}
                    </div>
                  </td>
                  <td className="p-4"><span className="text-xs text-slate-500 font-mono">{doc.source}</span></td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                      <span className="text-xs text-emerald-400 font-medium">Activo</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-4 border-t border-slate-800 flex justify-between items-center text-xs text-slate-500">
            <span>{documents.length} documentos únicos</span>
            <button onClick={fetchDocs} className="flex items-center gap-1 hover:text-emerald-400 transition-colors">
              <RotateCcw size={12} /> Actualizar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
