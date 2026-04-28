import { useState, useEffect, useRef } from 'react';
import { Bot, Plus, Pencil, Trash2, Upload, Tag, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, BarChart2 } from 'lucide-react';
import { API_CONFIG } from '../config';

const EMPTY_AGENT = {
  id: '',
  name: '',
  area: '',
  description: '',
  system_prompt: '',
  greeting: '',
  rag_tags: [],
  is_internal_only: true,
  model_id: '',
  llm_temperature: null,
  llm_top_p: null,
  llm_top_k: null,
  rag_top_k: null,
  max_interactions: null,
  is_active: true,
};

const SYSTEM_AGENTS = ['gammia', 'iris'];

export default function AgentsView({ token }) {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // null | { mode: 'create'|'edit', agent }
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [stats, setStats] = useState({});
  const fileInputRef = useRef(null);
  const [avatarTarget, setAvatarTarget] = useState(null);

  const headers = API_CONFIG.getHeaders();

  async function fetchAgents() {
    setLoading(true);
    try {
      const res = await fetch(`${API_CONFIG.BASE_URL}/api/v1/agents`, { headers });
      const data = await res.json();
      setAgents(data.agents || []);
    } catch (e) {
      setError('Error cargando agentes');
    } finally {
      setLoading(false);
    }
  }

  async function fetchStats(agentId) {
    try {
      const res = await fetch(`${API_CONFIG.BASE_URL}/api/v1/agents/${agentId}/stats`, { headers });
      const data = await res.json();
      setStats(prev => ({ ...prev, [agentId]: data }));
    } catch {}
  }

  useEffect(() => { fetchAgents(); }, []);

  function openCreate() {
    setModal({ mode: 'create', agent: { ...EMPTY_AGENT } });
  }

  function openEdit(agent) {
    setModal({ mode: 'edit', agent: { ...agent, rag_tags: agent.rag_tags || [] } });
  }

  async function saveAgent() {
    setSaving(true);
    const { mode, agent } = modal;
    try {
      const url = mode === 'create'
        ? `${API_CONFIG.BASE_URL}/api/v1/agents`
        : `${API_CONFIG.BASE_URL}/api/v1/agents/${agent.id}`;
      const method = mode === 'create' ? 'POST' : 'PUT';

      // Clean nullish numeric fields
      const body = { ...agent };
      ['llm_temperature', 'llm_top_p', 'llm_top_k', 'rag_top_k', 'max_interactions'].forEach(f => {
        if (body[f] === '' || body[f] === null || body[f] === undefined) body[f] = null;
        else body[f] = Number(body[f]);
      });

      const res = await fetch(url, {
        method,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Error guardando');
      }
      setModal(null);
      fetchAgents();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteAgent(agentId) {
    if (!confirm(`¿Eliminar el agente "${agentId}"? Esta acción no se puede deshacer.`)) return;
    try {
      const res = await fetch(`${API_CONFIG.BASE_URL}/api/v1/agents/${agentId}`, {
        method: 'DELETE', headers,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail);
      }
      fetchAgents();
    } catch (e) { alert(e.message); }
  }

  async function toggleActive(agent) {
    try {
      await fetch(`${API_CONFIG.BASE_URL}/api/v1/agents/${agent.id}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !agent.is_active }),
      });
      fetchAgents();
    } catch {}
  }

  function openAvatarUpload(agentId) {
    setAvatarTarget(agentId);
    fileInputRef.current?.click();
  }

  async function handleAvatarFile(e) {
    const file = e.target.files?.[0];
    if (!file || !avatarTarget) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch(`${API_CONFIG.BASE_URL}/api/v1/agents/${avatarTarget}/avatar`, {
        method: 'POST',
        headers: { Authorization: headers.Authorization },
        body: fd,
      });
      if (!res.ok) throw new Error('Error subiendo avatar');
      fetchAgents();
    } catch (e) { alert(e.message); }
    e.target.value = '';
  }

  function toggleExpand(id) {
    const next = expandedId === id ? null : id;
    setExpandedId(next);
    if (next && !stats[next]) fetchStats(next);
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#168bf2] border-t-transparent" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bot size={24} className="text-[#168bf2]" /> Agentes & Chatbots
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Framework multi-agente — cada área puede tener su propio asistente con identidad, skills y RAG aislado
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-[#168bf2] hover:bg-[#1279d4] text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Nuevo Agente
        </button>
      </div>

      {error && <div className="text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm">{error}</div>}

      {/* Agent Cards */}
      <div className="space-y-3">
        {agents.map(agent => (
          <div key={agent.id} className="bg-[#2d2d2d] border border-[#3d3d3d]/60 rounded-xl overflow-hidden">
            {/* Card header */}
            <div className="flex items-center gap-4 p-4">
              {/* Avatar */}
              <div className="relative flex-shrink-0 group cursor-pointer" onClick={() => openAvatarUpload(agent.id)}>
                <img
                  src={`${API_CONFIG.BASE_URL}${agent.avatar_url}`}
                  alt={agent.name}
                  className="w-12 h-12 rounded-full object-cover border-2 border-[#3d3d3d] group-hover:border-[#168bf2] transition-colors"
                  onError={e => { e.target.src = '/gammia-avatar.png'; }}
                />
                <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <Upload size={14} className="text-white" />
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-white text-sm">{agent.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[#3d3d3d] text-slate-400 font-mono">{agent.id}</span>
                  {agent.area && <span className="text-xs px-2 py-0.5 rounded-full bg-[#168bf2]/10 text-[#168bf2]">{agent.area}</span>}
                  {SYSTEM_AGENTS.includes(agent.id) && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400">sistema</span>
                  )}
                  {agent.is_internal_only && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">solo interno</span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5 truncate">{agent.description || '—'}</p>
              </div>

              {/* Tags */}
              <div className="hidden md:flex gap-1 flex-wrap max-w-[200px]">
                {(agent.rag_tags || []).slice(0, 3).map(t => (
                  <span key={t} className="text-xs px-2 py-0.5 rounded-md bg-[#5bd893]/10 text-[#5bd893] font-mono">{t}</span>
                ))}
                {(agent.rag_tags || []).length > 3 && (
                  <span className="text-xs text-slate-500">+{agent.rag_tags.length - 3}</span>
                )}
                {(!agent.rag_tags || agent.rag_tags.length === 0) && (
                  <span className="text-xs text-slate-600 italic">sin filtro de tags</span>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => toggleActive(agent)} title={agent.is_active ? 'Deshabilitar' : 'Habilitar'}>
                  {agent.is_active
                    ? <ToggleRight size={20} className="text-[#3dc156]" />
                    : <ToggleLeft size={20} className="text-slate-500" />}
                </button>
                <button onClick={() => openEdit(agent)} className="p-1.5 rounded-lg hover:bg-[#3d3d3d] text-slate-400 hover:text-white transition-colors">
                  <Pencil size={15} />
                </button>
                {!SYSTEM_AGENTS.includes(agent.id) && (
                  <button onClick={() => deleteAgent(agent.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors">
                    <Trash2 size={15} />
                  </button>
                )}
                <button onClick={() => toggleExpand(agent.id)} className="p-1.5 rounded-lg hover:bg-[#3d3d3d] text-slate-400 transition-colors">
                  {expandedId === agent.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
              </div>
            </div>

            {/* Expanded stats */}
            {expandedId === agent.id && (
              <div className="border-t border-[#3d3d3d]/60 p-4 bg-[#1a1a1a]/40">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart2 size={14} className="text-[#168bf2]" />
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Estadísticas de uso</span>
                </div>
                {stats[agent.id] ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Interacciones', value: stats[agent.id].total_interactions },
                      { label: 'Tokens In', value: stats[agent.id].total_tokens_in.toLocaleString() },
                      { label: 'Tokens Out', value: stats[agent.id].total_tokens_out.toLocaleString() },
                      { label: 'Latencia avg', value: `${stats[agent.id].avg_latency_ms} ms` },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-[#2d2d2d] rounded-lg p-3 text-center">
                        <div className="text-lg font-bold text-white">{value}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{label}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex justify-center py-4">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-[#168bf2] border-t-transparent" />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Hidden file input for avatar */}
      <input ref={fileInputRef} type="file" accept=".png" className="hidden" onChange={handleAvatarFile} />

      {/* Create/Edit Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#2d2d2d] border border-[#3d3d3d] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-[#2d2d2d] border-b border-[#3d3d3d]/60 p-5 flex items-center justify-between">
              <h3 className="text-white font-semibold text-lg">
                {modal.mode === 'create' ? 'Nuevo Agente' : `Editar: ${modal.agent.name}`}
              </h3>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-white text-xl">✕</button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="ID (slug único)" required disabled={modal.mode === 'edit'}>
                  <input
                    className="input-dark"
                    value={modal.agent.id}
                    onChange={e => setModal(m => ({ ...m, agent: { ...m.agent, id: e.target.value.toLowerCase().replace(/\s+/g, '-') } }))}
                    placeholder="iris-rrhh"
                    disabled={modal.mode === 'edit'}
                  />
                </Field>
                <Field label="Nombre visible">
                  <input className="input-dark" value={modal.agent.name} onChange={e => setModal(m => ({ ...m, agent: { ...m.agent, name: e.target.value } }))} placeholder="Iris RRHH" />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Área">
                  <input className="input-dark" value={modal.agent.area || ''} onChange={e => setModal(m => ({ ...m, agent: { ...m.agent, area: e.target.value } }))} placeholder="RRHH, Finanzas…" />
                </Field>
                <Field label="RAG Tags (separados por coma)">
                  <input
                    className="input-dark"
                    value={(modal.agent.rag_tags || []).join(', ')}
                    onChange={e => setModal(m => ({
                      ...m,
                      agent: {
                        ...m.agent,
                        rag_tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean),
                      }
                    }))}
                    placeholder="intranet, rrhh, general"
                  />
                </Field>
              </div>

              <Field label="Descripción">
                <input className="input-dark" value={modal.agent.description || ''} onChange={e => setModal(m => ({ ...m, agent: { ...m.agent, description: e.target.value } }))} placeholder="Asistente de RRHH para…" />
              </Field>

              <Field label="System Prompt">
                <textarea
                  className="input-dark h-28 resize-none"
                  value={modal.agent.system_prompt || ''}
                  onChange={e => setModal(m => ({ ...m, agent: { ...m.agent, system_prompt: e.target.value } }))}
                  placeholder="Eres Iris, asistente de RRHH de Gamma Ingenieros…"
                />
              </Field>

              <Field label="Greeting (saludo inicial)">
                <input className="input-dark" value={modal.agent.greeting || ''} onChange={e => setModal(m => ({ ...m, agent: { ...m.agent, greeting: e.target.value } }))} placeholder="¡Hola! Soy Iris…" />
              </Field>

              {/* LLM overrides */}
              <div className="border-t border-[#3d3d3d]/60 pt-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Parámetros LLM (vacío = heredar de Widget Config)</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Field label="Modelo ID">
                    <input className="input-dark" value={modal.agent.model_id || ''} onChange={e => setModal(m => ({ ...m, agent: { ...m.agent, model_id: e.target.value } }))} placeholder="gemini-2.0-flash" />
                  </Field>
                  <Field label="Temperature">
                    <input type="number" step="0.01" min="0" max="2" className="input-dark" value={modal.agent.llm_temperature ?? ''} onChange={e => setModal(m => ({ ...m, agent: { ...m.agent, llm_temperature: e.target.value } }))} placeholder="0.1" />
                  </Field>
                  <Field label="Top P">
                    <input type="number" step="0.01" min="0" max="1" className="input-dark" value={modal.agent.llm_top_p ?? ''} onChange={e => setModal(m => ({ ...m, agent: { ...m.agent, llm_top_p: e.target.value } }))} placeholder="0.95" />
                  </Field>
                  <Field label="Top K">
                    <input type="number" min="1" className="input-dark" value={modal.agent.llm_top_k ?? ''} onChange={e => setModal(m => ({ ...m, agent: { ...m.agent, llm_top_k: e.target.value } }))} placeholder="40" />
                  </Field>
                  <Field label="RAG Top K">
                    <input type="number" min="1" className="input-dark" value={modal.agent.rag_top_k ?? ''} onChange={e => setModal(m => ({ ...m, agent: { ...m.agent, rag_top_k: e.target.value } }))} placeholder="15" />
                  </Field>
                  <Field label="Max Interacciones">
                    <input type="number" min="1" className="input-dark" value={modal.agent.max_interactions ?? ''} onChange={e => setModal(m => ({ ...m, agent: { ...m.agent, max_interactions: e.target.value } }))} placeholder="10" />
                  </Field>
                </div>
              </div>

              {/* Flags */}
              <div className="flex items-center gap-6 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={modal.agent.is_internal_only} onChange={e => setModal(m => ({ ...m, agent: { ...m.agent, is_internal_only: e.target.checked } }))} className="accent-[#168bf2]" />
                  <span className="text-sm text-slate-300">Solo uso interno</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={modal.agent.is_active} onChange={e => setModal(m => ({ ...m, agent: { ...m.agent, is_active: e.target.checked } }))} className="accent-[#3dc156]" />
                  <span className="text-sm text-slate-300">Activo</span>
                </label>
              </div>
            </div>

            <div className="sticky bottom-0 bg-[#2d2d2d] border-t border-[#3d3d3d]/60 p-5 flex justify-end gap-3">
              <button onClick={() => setModal(null)} className="px-4 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#3d3d3d] text-sm transition-colors">
                Cancelar
              </button>
              <button
                onClick={saveAgent}
                disabled={saving || !modal.agent.id || !modal.agent.name}
                className="px-5 py-2 bg-[#168bf2] hover:bg-[#1279d4] disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {saving ? 'Guardando…' : modal.mode === 'create' ? 'Crear Agente' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children, required, disabled }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1">
        {label}{required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}
