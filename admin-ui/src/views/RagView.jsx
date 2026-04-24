import React, { useState, useEffect } from 'react';
import { FileText, Upload, Tag, CheckCircle, AlertCircle, Loader, RotateCcw, Globe, HardDrive, Plus, X, Sparkles, Trash2, Pencil, RefreshCw, Eye, ArchiveRestore } from 'lucide-react';
import { API_CONFIG } from '../config';
import { GlobalModal } from '../App';

const COLOR_OPTIONS = ['emerald','sky','violet','amber','rose','orange','teal','indigo','pink','red','lime','slate'];
const colorClass = {
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

function TagChip({ tag, selected, onClick }) {
  const c = colorClass[tag.color] || colorClass.slate;
  return (
    <button type="button" onClick={() => onClick && onClick(tag.id)}
      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all
        ${selected ? `${c} scale-105 shadow-sm ring-1 ring-current/20` : 'bg-slate-800/50 text-slate-500 border-slate-700 hover:border-slate-500'}`}>
      <Tag size={9}/>{tag.label}
    </button>
  );
}

function StatusBanner({ status, message }) {
  if (!status || status === 'suggest') return null;
  const cfg = {
    loading: { icon: <Loader size={16} className="animate-spin text-emerald-400"/>, cls: 'bg-slate-800/60 border-slate-700' },
    ok:      { icon: <CheckCircle size={16} className="text-emerald-400"/>, cls: 'bg-emerald-500/10 border-emerald-500/30' },
    error:   { icon: <AlertCircle size={16} className="text-rose-400"/>, cls: 'bg-rose-500/10 border-rose-500/30' },
  };
  const { icon, cls } = cfg[status] || cfg.error;
  return (
    <div className={`flex items-start gap-2 p-4 border rounded-xl ${cls}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <p className="text-sm text-slate-200">{message}</p>
    </div>
  );
}

export default function RagView() {
  const [tab, setTab]               = useState('upload');
  const [tags, setTags]             = useState([]);
  const [selectedTags, setSelectedTags] = useState(['internal']);
  const [documents, setDocuments]   = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [status, setStatus]         = useState(null);
  const [message, setMessage]       = useState('');
  const [dragOver, setDragOver]     = useState(false);
  const [suggestedTags, setSuggestedTags] = useState(null);
  const [pendingPayload, setPendingPayload] = useState(null);
  const [driveFolder, setDriveFolder] = useState('');
  const [driveResult, setDriveResult] = useState(null);
  const [showNewTag, setShowNewTag] = useState(false);
  const [newTag, setNewTag]         = useState({ id:'', label:'', color:'emerald' });
  const [urlInput, setUrlInput]     = useState('');

  // Maintenance state
  const [editDoc, setEditDoc]       = useState(null); // { id, title, tags } — modal editar tags
  const [chunksDoc, setChunksDoc]   = useState(null); // { doc_id, chunks } — modal ver chunks
  const [confirmDelete, setConfirmDelete] = useState(null); // { id, title } — modal confirmar borrado
  const [maintStatus, setMaintStatus] = useState({}); // { [doc_id]: 'loading'|'ok'|'error' }

  const authHeaders = API_CONFIG.getHeaders();
  const base = API_CONFIG.BASE_URL;

  const fetchTags = async () => {
    try {
      const r = await fetch(`${base}/api/v1/rag/tags`, { headers: authHeaders });
      if (r.ok) { const d = await r.json(); setTags(d.tags || []); }
    } catch {}
  };

  const fetchDocs = async () => {
    setLoadingDocs(true);
    try {
      const r = await fetch(`${base}/api/v1/rag/nodes`, { headers: authHeaders });
      if (r.ok) { const d = await r.json(); setDocuments(d.documents || []); }
    } catch {} finally { setLoadingDocs(false); }
  };

  // Maintenance actions
  const softDelete = async (docId) => {
    setMaintStatus(p => ({...p, [docId]: 'loading'}));
    try {
      const r = await fetch(`${base}/api/v1/rag/nodes/${docId}?force=false`, {
        method: 'DELETE', headers: authHeaders
      });
      const d = await r.json();
      setMaintStatus(p => ({...p, [docId]: r.ok ? 'ok' : 'error'}));
      if (r.ok) { setConfirmDelete(null); fetchDocs(); }
      else alert(d.detail || 'Error al desactivar');
    } catch (e) { setMaintStatus(p => ({...p, [docId]: 'error'})); alert(e.message); }
  };

  const hardDelete = async (docId) => {
    setMaintStatus(p => ({...p, [docId]: 'loading'}));
    try {
      const r = await fetch(`${base}/api/v1/rag/nodes/${docId}?force=true`, {
        method: 'DELETE', headers: authHeaders
      });
      const d = await r.json();
      setMaintStatus(p => ({...p, [docId]: r.ok ? 'ok' : 'error'}));
      if (r.ok) { setConfirmDelete(null); fetchDocs(); }
      else alert(d.detail || 'Error al eliminar');
    } catch (e) { alert(e.message); }
  };

  const updateTags = async (docId, newTags) => {
    setMaintStatus(p => ({...p, [docId]: 'loading'}));
    try {
      const r = await fetch(`${base}/api/v1/rag/nodes/${docId}/tags`, {
        method: 'PATCH',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: newTags })
      });
      const d = await r.json();
      setMaintStatus(p => ({...p, [docId]: r.ok ? 'ok' : 'error'}));
      if (r.ok) { setEditDoc(null); fetchDocs(); }
      else alert(d.detail || 'Error');
    } catch (e) { alert(e.message); }
  };

  const loadChunks = async (docId) => {
    try {
      const r = await fetch(`${base}/api/v1/rag/nodes/${docId}/chunks`, { headers: authHeaders });
      if (r.ok) { const d = await r.json(); setChunksDoc(d); }
    } catch (e) { alert(e.message); }
  };

  useEffect(() => { fetchTags(); fetchDocs(); }, []);

  const toggleTag = id => setSelectedTags(p => p.includes(id) ? p.filter(t => t !== id) : [...p, id]);

  // ── File Upload ──────────────────────────────────────────────────────────
  const uploadFile = async (file, withSuggest = true) => {
    setStatus('loading'); setMessage(`Analizando "${file.name}"...`);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('tags', JSON.stringify(selectedTags));
    fd.append('requested_by', 'admin');
    fd.append('suggest_tags', withSuggest ? 'true' : 'false');
    try {
      const r = await fetch(`${base}/api/v1/rag/upload-file`, {
        method: 'POST',
        headers: { Authorization: authHeaders.Authorization },
        body: fd,
      });
      const d = await r.json();
      if (!r.ok) { setStatus('error'); setMessage(d.detail || `Error ${r.status}`); return; }
      if (d.status === 'suggestion') {
        setSuggestedTags(d.suggested_tags || []);
        setSelectedTags(d.suggested_tags?.length ? d.suggested_tags : selectedTags);
        setPendingPayload({ type: 'file', data: file });
        setStatus('suggest');
        setMessage(`La IA sugiere estos tags para "${file.name}". Ajusta si necesitas y confirma.`);
      } else if (d.status === 'success') {
        setStatus('ok'); setMessage(`✓ ${d.chunks_inserted} fragmentos vectorizados con [${selectedTags.join(', ')}]`);
        setSuggestedTags(null); setPendingPayload(null); fetchDocs();
      } else {
        setStatus('error'); setMessage(d.message || d.detail || 'Error desconocido');
      }
    } catch (e) { setStatus('error'); setMessage(`Sin conexión al backend: ${e.message}`); }
  };

  const confirmUpload = () => {
    if (!pendingPayload) return;
    if (pendingPayload.type === 'file') uploadFile(pendingPayload.data, false);
    else confirmUrl();
  };

  const handleFileChange = e => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file, true);
    e.target.value = ''; // reset so same file can be re-selected
  };

  // ── URL ──────────────────────────────────────────────────────────────────
  const uploadUrl = async (suggest = true) => {
    if (!urlInput) return;
    setStatus('loading'); setMessage('Scrapeando URL...');
    try {
      const r = await fetch(`${base}/api/v1/rag/upload-url`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput, tags: selectedTags, suggest_tags: suggest }),
      });
      const d = await r.json();
      if (!r.ok) { setStatus('error'); setMessage(d.detail || `Error ${r.status}`); return; }
      if (d.status === 'suggestion') {
        setSuggestedTags(d.suggested_tags || []);
        setSelectedTags(d.suggested_tags?.length ? d.suggested_tags : selectedTags);
        setPendingPayload({ type: 'url' });
        setStatus('suggest');
        setMessage(`Tags sugeridos para "${urlInput}". Confirma para vectorizar.`);
      } else if (d.status === 'success') {
        setStatus('ok'); setMessage(`✓ URL vectorizada: ${d.chunks_inserted} fragmentos`); fetchDocs();
      } else { setStatus('error'); setMessage(d.message || 'Error'); }
    } catch (e) { setStatus('error'); setMessage(e.message); }
  };

  const confirmUrl = async () => {
    setStatus('loading');
    try {
      const r = await fetch(`${base}/api/v1/rag/upload-url`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput, tags: selectedTags, suggest_tags: false }),
      });
      const d = await r.json();
      if (d.status === 'success') {
        setStatus('ok'); setMessage(`✓ URL vectorizada: ${d.chunks_inserted} fragmentos`);
        setSuggestedTags(null); setPendingPayload(null); fetchDocs();
      } else { setStatus('error'); setMessage(d.message || 'Error'); }
    } catch (e) { setStatus('error'); setMessage(e.message); }
  };

  // ── Drive Sync ───────────────────────────────────────────────────────────
  const syncDrive = async () => {
    if (!driveFolder.trim()) return;
    setStatus('loading'); setMessage('Conectando con Google Drive...');
    try {
      const r = await fetch(`${base}/api/v1/rag/sync-drive-folder`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_id: driveFolder.trim(), tags: selectedTags }),
      });
      const d = await r.json();
      if (!r.ok) {
        setStatus('error');
        setMessage(d.detail || 'Error en sync de Drive. Verifica que el Service Account esté configurado.');
        return;
      }
      setDriveResult(d);
      setStatus('ok'); setMessage(`Drive sync: ${d.synced} nuevos, ${d.skipped} omitidos de ${d.total_files} archivos.`);
      fetchDocs();
    } catch (e) { setStatus('error'); setMessage(`Sin conexión: ${e.message}`); }
  };

  // ── Create Tag ───────────────────────────────────────────────────────────
  const createTag = async () => {
    if (!newTag.id || !newTag.label) return;
    try {
      const r = await fetch(`${base}/api/v1/rag/tags`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(newTag),
      });
      const d = await r.json();
      if (r.ok) { setShowNewTag(false); setNewTag({ id:'', label:'', color:'emerald' }); fetchTags(); }
      else { alert(d.detail || 'Error creando tag'); }
    } catch (e) { alert(e.message); }
  };

  const accepted = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md';

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Header + Tabs */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Gobernanza RAG</h2>
          <p className="text-slate-400 text-sm mt-1">Base vectorial — pgvector en Google Cloud SQL</p>
        </div>
        <div className="flex gap-2">
          {[
            { id:'upload', label:'↑ Subir' },
            { id:'drive',  label:'⊡ Drive' },
            { id:'docs',   label:'≡ Documentos' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${tab===t.id ? 'bg-emerald-500 text-slate-900 shadow-[0_0_12px_rgba(16,185,129,0.4)]' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tag Picker Bar */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
        <div className="flex justify-between items-center mb-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Tags RBAC — {selectedTags.length} seleccionado{selectedTags.length !== 1 ? 's' : ''}
          </p>
          <button onClick={() => setShowNewTag(true)}
            className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
            <Plus size={12}/> Nuevo tag
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {tags.map(t => <TagChip key={t.id} tag={t} selected={selectedTags.includes(t.id)} onClick={toggleTag}/>)}
        </div>
      </div>

      {/* ── UPLOAD TAB ─────────────────────────────────────────────────── */}
      {tab === 'upload' && (
        <div className="space-y-4">
          {/* Drag & Drop — using <label> so click works natively without ref.click() */}
          <label
            htmlFor="rag-file-input"
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault(); setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) uploadFile(f, true);
            }}
            className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl p-14 cursor-pointer transition-all
              ${dragOver ? 'border-emerald-400 bg-emerald-500/10 scale-[1.01]' : 'border-slate-700 hover:border-slate-500 bg-slate-900/30 hover:bg-slate-900/50'}`}>
            <input id="rag-file-input" type="file" accept={accepted} className="sr-only" onChange={handleFileChange}/>
            <Upload size={36} className={`transition-colors ${dragOver ? 'text-emerald-400' : 'text-slate-500'}`}/>
            <div className="text-center">
              <p className="text-slate-200 font-medium">Arrastra aquí o <span className="text-emerald-400 underline">haz clic para seleccionar</span></p>
              <p className="text-slate-600 text-xs mt-1">PDF · Word · Excel · PowerPoint · TXT · Markdown — máx. 50 MB</p>
            </div>
          </label>

          {/* URL scraper */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Globe size={15} className="text-slate-400"/>
              <p className="text-sm font-medium text-slate-300">O vectoriza desde una URL</p>
            </div>
            <div className="flex gap-3">
              <input value={urlInput} onChange={e => setUrlInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && uploadUrl(true)}
                placeholder="https://gammaingenieros.com/..."
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"/>
              <button onClick={() => uploadUrl(true)} disabled={!urlInput || status==='loading'}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium text-sm rounded-lg transition-all disabled:opacity-40 flex items-center gap-2">
                <Globe size={13}/> Scrapear
              </button>
            </div>
          </div>

          {/* AI Tag Suggestion Confirm Panel */}
          {status === 'suggest' && (
            <div className="bg-violet-900/20 border border-violet-500/30 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-violet-400"/>
                <p className="text-sm font-semibold text-violet-300">Sugerencia de tags por IA</p>
              </div>
              <p className="text-xs text-slate-400">{message}</p>
              <div className="flex flex-wrap gap-2">
                {tags.map(t => <TagChip key={t.id} tag={t} selected={selectedTags.includes(t.id)} onClick={toggleTag}/>)}
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={confirmUpload}
                  className="flex items-center gap-2 px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold text-sm rounded-lg transition-all shadow-[0_0_12px_rgba(16,185,129,0.3)]">
                  <CheckCircle size={14}/> Confirmar y vectorizar
                </button>
                <button onClick={() => { setSuggestedTags(null); setPendingPayload(null); setStatus(null); }}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <StatusBanner status={status} message={message}/>
        </div>
      )}

      {/* ── DRIVE TAB ──────────────────────────────────────────────────── */}
      {tab === 'drive' && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-2">
            <HardDrive size={18} className="text-emerald-400"/>
            <h3 className="text-white font-semibold">Sincronización Google Drive</h3>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-xs text-amber-300 leading-relaxed">
            <strong>Requisito previo:</strong> Comparte la carpeta de Drive con el Service Account de GammIA.<br/>
            El backend descargará y vectorizará los archivos nuevos omitiendo los ya procesados.
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Folder ID de Google Drive</label>
            <input value={driveFolder} onChange={e => setDriveFolder(e.target.value)}
              placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-emerald-500 transition-colors"/>
            <p className="text-xs text-slate-600 mt-1">
              drive.google.com/drive/folders/<strong>ID_AQUÍ</strong>
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-500 mb-2">Tags para todos los archivos de esta carpeta:</p>
            <div className="flex flex-wrap gap-2">
              {tags.map(t => <TagChip key={t.id} tag={t} selected={selectedTags.includes(t.id)} onClick={toggleTag}/>)}
            </div>
          </div>

          <button onClick={syncDrive} disabled={!driveFolder.trim() || status==='loading'}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-900 font-semibold text-sm rounded-lg transition-all">
            {status==='loading' ? <Loader size={14} className="animate-spin"/> : <HardDrive size={14}/>}
            {status==='loading' ? 'Sincronizando...' : 'Sincronizar ahora'}
          </button>

          <StatusBanner status={status} message={message}/>

          {driveResult?.results?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Detalle</p>
              <div className="max-h-64 overflow-y-auto space-y-1 rounded-xl">
                {driveResult.results.map((r, i) => (
                  <div key={i} className={`flex justify-between items-center px-3 py-2 rounded-lg text-xs
                    ${r.status==='success' ? 'bg-emerald-500/10 text-emerald-300' : r.status==='error' ? 'bg-rose-500/10 text-rose-300' : 'bg-slate-800 text-slate-500'}`}>
                    <span className="font-mono truncate">{r.file}</span>
                    <span className="ml-3 font-semibold shrink-0">
                      {r.status==='success' ? `✓ ${r.chunks_inserted} chunks` : r.reason || r.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── DOCS TAB ───────────────────────────────────────────────────── */}
      {tab === 'docs' && (
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-800/50 border-b border-slate-700">
                {['Documento','Tags','Fuente','Estado','Acciones'].map(h => (
                  <th key={h} className="p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loadingDocs ? (
                <tr><td colSpan="5" className="p-8 text-center text-slate-500">
                  <Loader size={18} className="animate-spin inline mr-2"/>Cargando...
                </td></tr>
              ) : documents.length === 0 ? (
                <tr><td colSpan="5" className="p-12 text-center text-slate-500 text-sm">
                  Sin documentos. Usa la pestaña "Subir" para comenzar.
                </td></tr>
              ) : documents.map(doc => (
                <tr key={doc.id} className="hover:bg-slate-800/20 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <FileText size={18} className="text-slate-500 shrink-0" strokeWidth={1.5}/>
                      <div>
                        <p className="text-sm font-medium text-slate-200 truncate max-w-[180px]">{doc.title}</p>
                        <p className="text-xs text-slate-600 font-mono">{doc.hash} · v{doc.version}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-1">
                      {doc.tags?.map(tid => {
                        const found = tags.find(t => t.id === tid);
                        return <TagChip key={tid} tag={found || {id:tid, label:tid, color:'slate'}} selected={false}/>;
                      })}
                    </div>
                  </td>
                  <td className="p-4 text-xs text-slate-500 font-mono">{doc.source}</td>
                  <td className="p-4">
                    {maintStatus[doc.id] === 'loading' ? (
                      <Loader size={14} className="animate-spin text-slate-400"/>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"/>
                        <span className="text-xs text-emerald-400 font-medium">Activo</span>
                      </div>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1">
                      {/* Ver chunks */}
                      <button onClick={() => loadChunks(doc.id)} title="Ver fragmentos"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-sky-400 hover:bg-sky-500/10 transition-all">
                        <Eye size={14}/>
                      </button>
                      {/* Editar tags */}
                      <button onClick={() => setEditDoc({id: doc.id, title: doc.title, tags: [...(doc.tags||[])]})} title="Editar tags"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition-all">
                        <Pencil size={14}/>
                      </button>
                      {/* Eliminar */}
                      <button onClick={() => setConfirmDelete({id: doc.id, title: doc.title})} title="Eliminar"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all">
                        <Trash2 size={14}/>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-4 border-t border-slate-800 flex justify-between items-center text-xs text-slate-500">
            <span>{documents.length} documentos únicos vectorizados</span>
            <button onClick={fetchDocs} className="flex items-center gap-1 hover:text-emerald-400 transition-colors">
              <RotateCcw size={12}/> Actualizar
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL NUEVO TAG ───────────────────────────────────────────────── */}
      <GlobalModal onClose={() => setShowNewTag(false)}>
        {showNewTag && (
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-white font-semibold">Crear nuevo tag</h3>
              <button onClick={() => setShowNewTag(false)} className="text-slate-400 hover:text-white"><X size={18}/></button>
            </div>
            <div className="space-y-3">
              <input value={newTag.id}
                onChange={e => setNewTag({...newTag, id: e.target.value.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'')})}
                placeholder="ID interno (ej: legal, rrhh)"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"/>
              <input value={newTag.label}
                onChange={e => setNewTag({...newTag, label: e.target.value})}
                placeholder="Etiqueta visual (ej: Legal)"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"/>
              <div>
                <p className="text-xs text-slate-400 mb-2">Color</p>
                <div className="flex flex-wrap gap-2">
                  {COLOR_OPTIONS.map(c => (
                    <button key={c} type="button" onClick={() => setNewTag({...newTag, color: c})}
                      className={`w-7 h-7 rounded-full border-2 transition-all bg-${c}-400
                        ${newTag.color===c ? 'border-white scale-125 shadow-lg' : 'border-transparent opacity-60 hover:opacity-100'}`}/>
                  ))}
                </div>
                <div className="mt-3">
                  <TagChip tag={{id: newTag.id||'preview', label: newTag.label||'Vista previa', color: newTag.color}} selected={true}/>
                </div>
              </div>
              <button onClick={createTag} disabled={!newTag.id || !newTag.label}
                className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-900 font-semibold py-2.5 rounded-lg text-sm transition-all">
                <Plus size={14}/> Crear tag
              </button>
            </div>
          </div>
        )}
      </GlobalModal>

      {/* ── MODAL EDITAR TAGS ─────────────────────────────────────────────── */}
      <GlobalModal onClose={() => setEditDoc(null)}>
        {editDoc && (
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-white font-semibold">Editar tags</h3>
                <p className="text-xs text-slate-500 truncate max-w-[280px]">{editDoc.title}</p>
              </div>
              <button onClick={() => setEditDoc(null)} className="text-slate-400 hover:text-white"><X size={18}/></button>
            </div>
            <p className="text-xs text-slate-500 mb-3">Selecciona los tags de acceso para este documento:</p>
            <div className="flex flex-wrap gap-2 mb-5">
              {tags.map(t => (
                <TagChip key={t.id} tag={t} selected={editDoc.tags.includes(t.id)}
                  onClick={id => setEditDoc(p => ({...p, tags: p.tags.includes(id) ? p.tags.filter(x=>x!==id) : [...p.tags,id]}))}/>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => updateTags(editDoc.id, editDoc.tags)} disabled={editDoc.tags.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-900 font-semibold text-sm rounded-lg transition-all">
                <CheckCircle size={13}/> Guardar tags
              </button>
              <button onClick={() => setEditDoc(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancelar</button>
            </div>
          </div>
        )}
      </GlobalModal>

      {/* ── MODAL CONFIRMAR BORRADO ───────────────────────────────────────── */}
      <GlobalModal onClose={() => setConfirmDelete(null)}>
        {confirmDelete && (
          <div className="bg-slate-900 border border-rose-500/30 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-semibold">Eliminar documento</h3>
              <button onClick={() => setConfirmDelete(null)} className="text-slate-400 hover:text-white"><X size={18}/></button>
            </div>
            <p className="text-sm text-slate-300 mb-1 truncate">{confirmDelete.title}</p>
            <p className="text-xs text-slate-500 mb-5">Esta acción afecta todos los fragmentos vectorizados de este documento.</p>
            <div className="space-y-3">
              <button onClick={() => softDelete(confirmDelete.id)}
                className="w-full flex items-center gap-2 px-4 py-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-xl text-sm font-medium transition-all">
                <ArchiveRestore size={15}/> Desactivar (soft delete) — reversible
              </button>
              <button onClick={() => hardDelete(confirmDelete.id)}
                className="w-full flex items-center gap-2 px-4 py-3 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 rounded-xl text-sm font-medium transition-all">
                <Trash2 size={15}/> Eliminar permanentemente — irreversible
              </button>
            </div>
          </div>
        )}
      </GlobalModal>

      {/* ── MODAL VER CHUNKS ─────────────────────────────────────────────── */}
      <GlobalModal onClose={() => setChunksDoc(null)}>
        {chunksDoc && (
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-2xl shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4 shrink-0">
              <div>
                <h3 className="text-white font-semibold">Fragmentos vectorizados</h3>
                <p className="text-xs text-slate-500">{chunksDoc.total_chunks} chunks · ID: {chunksDoc.doc_id}</p>
              </div>
              <button onClick={() => setChunksDoc(null)} className="text-slate-400 hover:text-white"><X size={18}/></button>
            </div>
            <div className="overflow-y-auto space-y-3 flex-1 pr-1">
              {chunksDoc.chunks?.map((c, i) => (
                <div key={c.chunk_id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-mono text-slate-500">Chunk #{i+1} · ID:{c.chunk_id} · v{c.version} · {c.content_length} chars</span>
                    <div className="flex gap-1">
                      {c.tags?.map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">#{t}</span>)}
                    </div>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-mono whitespace-pre-wrap">{c.content_preview}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </GlobalModal>
    </div>
  );
}
