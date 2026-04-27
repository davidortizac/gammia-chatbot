import { useState, useEffect, useCallback } from 'react';
import { Palette, Type, MessageSquare, Users, Save, RefreshCw, ChevronDown, ChevronUp, Eye, X } from 'lucide-react';
import { API_CONFIG } from '../config';
import { GlobalModal } from '../App';

// ── Helpers ──────────────────────────────────────────────────────────────────

const FONT_OPTIONS = [
  { label: 'Inter (default)',       value: "'Inter', sans-serif" },
  { label: 'Roboto',                value: "'Roboto', sans-serif" },
  { label: 'Open Sans',             value: "'Open Sans', sans-serif" },
  { label: 'Lato',                  value: "'Lato', sans-serif" },
  { label: 'Poppins',               value: "'Poppins', sans-serif" },
  { label: 'Nunito',                value: "'Nunito', sans-serif" },
  { label: 'DM Sans',               value: "'DM Sans', sans-serif" },
  { label: 'Montserrat',            value: "'Montserrat', sans-serif" },
  { label: 'Source Sans 3',         value: "'Source Sans 3', sans-serif" },
  { label: 'System UI',             value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
];

const DEFAULT_CONFIG = {
  primary_color:     '#168bf2',
  secondary_color:   '#0d5eab',
  background_color:  '#1a1a1a',
  surface_color:     '#2d2d2d',
  surface2_color:    '#3d3d3d',
  user_bubble_color: '#168bf2',
  bot_bubble_color:  '#3d3d3d',
  text_color:        '#E2E8F0',
  border_color:      '#3d3d3d',
  font_family:       "'Poppins', sans-serif",
  font_size:         '13px',
  title:             'GammIA',
  subtitle:          'Asistente Virtual · Gamma Ingenieros',
  greeting_public:   '¡Hola! Soy GammIA, asistente virtual de Gamma Ingenieros. Puedo ayudarte con información sobre nuestros servicios de ciberseguridad. ¿Tienes alguna pregunta?',
  greeting_internal: '¡Hola! Soy GammIA, tu asistente de intranet. Tengo acceso a la base de conocimiento interna de Gamma Ingenieros. ¿En qué te puedo ayudar?',
  avatar_url:        '/static/gammia-avatar.png',
  bot_icon_type:     'avatar',
  theme:             'dark',
  max_interactions:  10,
  chat_width:        370,
  chat_height:       560,
  llm_temperature:   0.1,
  llm_top_p:         0.95,
  llm_top_k:         40,
  rag_top_k:         15,
};

function Section({ title, icon: Icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-[#2d2d2d] border border-[#3d3d3d] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#3d3d3d]/40 transition-colors"
      >
        <div className="flex items-center gap-2 text-slate-200 font-semibold">
          <Icon size={16} className="text-[#5bd893]" />
          {title}
        </div>
        {open ? <ChevronUp size={15} className="text-slate-500" /> : <ChevronDown size={15} className="text-slate-500" />}
      </button>
      {open && <div className="px-5 pb-5 space-y-4 border-t border-[#3d3d3d]">{children}</div>}
    </div>
  );
}

function ColorField({ label, name, value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-sm text-slate-400 min-w-0 flex-1">{label}</label>
      <div className="flex items-center gap-2 flex-shrink-0">
        <input
          type="color"
          value={value || '#000000'}
          onChange={e => onChange(name, e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border border-slate-600 bg-transparent"
        />
        <input
          type="text"
          value={value || ''}
          onChange={e => onChange(name, e.target.value)}
          className="w-24 bg-[#3d3d3d] border border-[#4a4a4a] rounded-lg px-2 py-1.5 text-xs font-mono text-slate-300 focus:outline-none focus:border-[#168bf2]"
        />
      </div>
    </div>
  );
}

function TextField({ label, name, value, onChange, mono = false }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-slate-400">{label}</label>
      <input
        type="text"
        value={value || ''}
        onChange={e => onChange(name, e.target.value)}
        className={`w-full bg-[#3d3d3d] border border-[#4a4a4a] rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-[#168bf2] ${mono ? 'font-mono' : ''}`}
      />
    </div>
  );
}

function TextareaField({ label, name, value, onChange }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-slate-400">{label}</label>
      <textarea
        value={value || ''}
        onChange={e => onChange(name, e.target.value)}
        rows={3}
        className="w-full bg-[#3d3d3d] border border-[#4a4a4a] rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-[#168bf2] resize-y"
      />
    </div>
  );
}

function NumberField({ label, name, value, onChange, min, max, unit = '' }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-slate-400">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value || ''}
          min={min}
          max={max}
          onChange={e => onChange(name, parseInt(e.target.value, 10) || value)}
          className="w-20 bg-[#3d3d3d] border border-[#4a4a4a] rounded-lg px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-[#168bf2] text-right"
        />
        {unit && <span className="text-xs text-slate-500">{unit}</span>}
      </div>
    </div>
  );
}

// ── Widget Preview ─────────────────────────────────────────────────────────────
function WidgetPreview({ cfg }) {
  const primary   = cfg.primary_color    || '#10B981';
  const secondary = cfg.secondary_color  || '#064E3B';
  const bg        = cfg.background_color || '#0B1120';
  const surface   = cfg.surface_color    || '#111827';
  const surface2  = cfg.surface2_color   || '#1E293B';
  const userBg    = cfg.user_bubble_color || '#10B981';
  const botBg     = cfg.bot_bubble_color  || '#1E293B';
  const textColor = cfg.text_color       || '#E2E8F0';
  const border    = cfg.border_color     || '#1E293B';
  const ff        = cfg.font_family      || "'Inter', sans-serif";
  const fs        = cfg.font_size        || '13px';

  const hex = userBg.replace('#', '');
  const r = parseInt(hex.substr(0,2),16) || 0;
  const g = parseInt(hex.substr(2,2),16) || 0;
  const b = parseInt(hex.substr(4,2),16) || 0;
  const lum = (0.299*r + 0.587*g + 0.114*b) / 255;
  const userText = lum > 0.5 ? '#111827' : '#ffffff';

  const panelW = Math.min(cfg.chat_width || 370, 300);
  const panelH = Math.min(cfg.chat_height || 560, 420);

  return (
    <div
      style={{
        width: panelW + 'px', height: panelH + 'px',
        background: surface, border: `1px solid ${border}`,
        borderRadius: '16px', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', fontFamily: ff, fontSize: fs, color: textColor,
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
      }}
    >
      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${secondary}, ${primary} 75%, ${surface})`, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: `1px solid ${border}`, flexShrink: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
          <img src={API_CONFIG.BASE_URL + (cfg.avatar_url || '/static/gammia-avatar.png')} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display='none'; }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cfg.title || 'GammIA'}</div>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,.7)', marginTop: 1 }}>{cfg.subtitle || 'Asistente Virtual'}</div>
        </div>
        <div style={{ fontSize: '10px', color: '#fff', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
          En línea
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: 'hidden', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, background: bg }}>
        {/* Bot message */}
        <div style={{ alignSelf: 'flex-start', maxWidth: '82%' }}>
          <div style={{ padding: '8px 11px', borderRadius: 12, borderBottomLeftRadius: 3, background: botBg, color: textColor, border: `1px solid ${border}`, fontSize: fs, lineHeight: 1.5 }}>
            {cfg.greeting_public || '¡Hola! ¿En qué te puedo ayudar?'}
          </div>
          <div style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>ahora</div>
        </div>
        {/* User message */}
        <div style={{ alignSelf: 'flex-end', maxWidth: '75%' }}>
          <div style={{ padding: '8px 11px', borderRadius: 12, borderBottomRightRadius: 3, background: userBg, color: userText, fontSize: fs, lineHeight: 1.5 }}>
            Hola, tengo una pregunta
          </div>
          <div style={{ fontSize: 10, color: '#64748B', marginTop: 2, textAlign: 'right' }}>ahora</div>
        </div>
        {/* Bot reply */}
        <div style={{ alignSelf: 'flex-start', maxWidth: '82%' }}>
          <div style={{ padding: '8px 11px', borderRadius: 12, borderBottomLeftRadius: 3, background: botBg, color: textColor, border: `1px solid ${border}`, fontSize: fs, lineHeight: 1.5 }}>
            ¡Con gusto! ¿Cuál es tu consulta?
          </div>
          <div style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>ahora</div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 10px 10px', borderTop: `1px solid ${border}`, background: surface, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ flex: 1, background: surface2, border: `1px solid ${border}`, borderRadius: 10, padding: '7px 10px', fontSize: fs, color: '#64748B' }}>
            Escribe tu pregunta...
          </div>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'white' }}><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </div>
        </div>
        <div style={{ textAlign: 'center', fontSize: 9, color: '#475569', marginTop: 4 }}>
          Powered by Gamma Ingenieros · GammIA AI
        </div>
      </div>
    </div>
  );
}

// ── Session detail modal ───────────────────────────────────────────────────────
function SessionModal({ session, onClose }) {
  if (!session) return null;
  return (
    <div className="bg-[#2d2d2d] border border-[#4a4a4a] rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
      <div className="flex items-center justify-between p-5 border-b border-[#3d3d3d]">
        <div>
          <h3 className="text-white font-semibold">Sesión: <span className="font-mono text-[#5bd893]">{session.id}</span></h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Contexto: {session.context} · {session.interaction_count} interacciones
          </p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#3d3d3d] transition-colors">
          <X size={18} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {session.messages && session.messages.length > 0 ? session.messages.map((m, i) => (
          <div key={m.id || i} className="space-y-2">
            <div className="flex items-start justify-end gap-2">
              <div className="bg-[#168bf2]/20 border border-[#168bf2]/30 rounded-xl rounded-br-sm px-3 py-2 text-sm text-slate-200 max-w-[80%]">
                {m.user_query}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="bg-[#3d3d3d] border border-[#4a4a4a] rounded-xl rounded-bl-sm px-3 py-2 text-sm text-slate-300 max-w-[80%] whitespace-pre-wrap">
                {m.assistant_response}
              </div>
            </div>
            <div className="text-right text-[10px] text-slate-600">
              {m.timestamp ? new Date(m.timestamp).toLocaleString('es') : ''} · {m.latency_ms}ms
            </div>
          </div>
        )) : (
          <p className="text-slate-500 text-sm text-center py-8">No hay mensajes registrados</p>
        )}
      </div>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────
export default function WidgetView() {
  const [activeTab, setActiveTab]   = useState('design');
  const [cfg, setCfg]               = useState(DEFAULT_CONFIG);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [status, setStatus]         = useState(null);   // { type: 'ok'|'error', msg }
  const [sessions, setSessions]     = useState([]);
  const [sessLoading, setSessLoading] = useState(false);
  const [selectedSess, setSelectedSess] = useState(null);

  // ── Load config ──────────────────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API_CONFIG.BASE_URL}/api/v1/widget/admin/config`, { headers: API_CONFIG.getHeaders() });
      const data = await res.json();
      setCfg(prev => ({ ...prev, ...data }));
    } catch {
      setStatus({ type: 'error', msg: 'No se pudo cargar la configuración.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  // ── Load sessions ────────────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    setSessLoading(true);
    try {
      const res  = await fetch(`${API_CONFIG.BASE_URL}/api/v1/widget/admin/sessions`, { headers: API_CONFIG.getHeaders() });
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch {
      setSessions([]);
    } finally {
      setSessLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'sessions') loadSessions();
  }, [activeTab, loadSessions]);

  // ── Save ─────────────────────────────────────────────────────────────────
  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(`${API_CONFIG.BASE_URL}/api/v1/widget/admin/config`, {
        method: 'PUT',
        headers: API_CONFIG.getHeaders(),
        body: JSON.stringify(cfg),
      });
      if (!res.ok) throw new Error();
      setStatus({ type: 'ok', msg: '¡Configuración guardada! Los cambios se reflejan de inmediato.' });
    } catch {
      setStatus({ type: 'error', msg: 'Error al guardar. Intenta de nuevo.' });
    } finally {
      setSaving(false);
    }
  };

  const update = (name, value) => setCfg(prev => ({ ...prev, [name]: value }));

  const tabs = [
    { id: 'design',  label: 'Diseño',     icon: Palette },
    { id: 'content', label: 'Contenido',  icon: MessageSquare },
    { id: 'sessions',label: 'Sesiones',   icon: Users },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Widget GammIA</h2>
          <p className="text-slate-400 text-sm mt-1">Personaliza la apariencia y el comportamiento del chat embeddable</p>
        </div>
        <button
          onClick={save}
          disabled={saving || loading}
          className="flex items-center gap-2 bg-[#168bf2] hover:bg-[#1a96f5] disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors"
        >
          {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>

      {/* Status */}
      {status && (
        <div className={`px-4 py-3 rounded-xl text-sm flex items-center justify-between ${status.type === 'ok' ? 'bg-[#3dc156]/10 border border-[#3dc156]/30 text-[#3dc156]' : 'bg-red-500/10 border border-red-500/30 text-red-300'}`}>
          <span>{status.msg}</span>
          <button onClick={() => setStatus(null)} className="opacity-60 hover:opacity-100"><X size={14}/></button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-[#2d2d2d] p-1 rounded-xl border border-[#3d3d3d]">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === t.id
                ? 'bg-slate-700 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="text-center py-12 text-slate-400">
          <RefreshCw size={20} className="animate-spin mx-auto mb-3" />
          Cargando configuración…
        </div>
      )}

      {/* ── TAB: Diseño ────────────────────────────────────────────────────── */}
      {!loading && activeTab === 'design' && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-6">
          <div className="space-y-4">
            {/* Colores */}
            <Section title="Colores" icon={Palette}>
              <div className="pt-3 space-y-3">
                <ColorField label="Color principal (botones, acentos)" name="primary_color"    value={cfg.primary_color}    onChange={update} />
                <ColorField label="Color secundario (gradiente header)"  name="secondary_color"  value={cfg.secondary_color}  onChange={update} />
                <ColorField label="Fondo del área de mensajes"           name="background_color" value={cfg.background_color} onChange={update} />
                <ColorField label="Fondo del panel"                      name="surface_color"    value={cfg.surface_color}    onChange={update} />
                <ColorField label="Fondo inputs / zona interna"          name="surface2_color"   value={cfg.surface2_color}   onChange={update} />
                <hr className="border-slate-700" />
                <ColorField label="Burbuja usuario (fondo)"              name="user_bubble_color" value={cfg.user_bubble_color} onChange={update} />
                <ColorField label="Burbuja bot (fondo)"                  name="bot_bubble_color"  value={cfg.bot_bubble_color}  onChange={update} />
                <ColorField label="Texto principal"                      name="text_color"        value={cfg.text_color}        onChange={update} />
                <ColorField label="Bordes"                               name="border_color"      value={cfg.border_color}      onChange={update} />
              </div>
            </Section>

            {/* Tipografía */}
            <Section title="Tipografía" icon={Type}>
              <div className="pt-3 space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Familia tipográfica</label>
                  <select
                    value={cfg.font_family}
                    onChange={e => update('font_family', e.target.value)}
                    className="w-full bg-[#3d3d3d] border border-[#4a4a4a] rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-[#168bf2]"
                  >
                    {FONT_OPTIONS.map(f => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-slate-400">Tamaño de letra</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="range" min="11" max="18" step="1"
                        value={parseInt(cfg.font_size) || 13}
                        onChange={e => update('font_size', e.target.value + 'px')}
                        className="flex-1 accent-[#168bf2]"
                      />
                      <span className="text-sm text-slate-200 font-mono w-10 text-right">{cfg.font_size}</span>
                    </div>
                  </div>
                </div>
              </div>
            </Section>

            {/* Icono y avatar */}
            <Section title="Icono del bot" icon={Eye}>
              <div className="pt-3 space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Tipo de icono</label>
                  <div className="flex gap-3">
                    {[
                      { value: 'avatar', label: 'Imagen (avatar)' },
                      { value: 'letter', label: 'Letra inicial' },
                      { value: 'custom', label: 'URL personalizada' },
                    ].map(opt => (
                      <label key={opt.value} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${cfg.bot_icon_type === opt.value ? 'border-[#168bf2] bg-[#168bf2]/10 text-[#5bd893]' : 'border-[#4a4a4a] text-slate-400 hover:border-slate-600'}`}>
                        <input
                          type="radio"
                          name="bot_icon_type"
                          value={opt.value}
                          checked={cfg.bot_icon_type === opt.value}
                          onChange={e => update('bot_icon_type', e.target.value)}
                          className="accent-[#168bf2]"
                        />
                        <span className="text-sm">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">URL del avatar (imagen del bot y botón flotante)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={cfg.avatar_url || ''}
                      onChange={e => update('avatar_url', e.target.value)}
                      className="flex-1 bg-[#3d3d3d] border border-[#4a4a4a] rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-[#168bf2] font-mono"
                    />
                    <label className="flex items-center gap-2 bg-[#4a4a4a] hover:bg-[#555] text-slate-200 font-medium text-sm px-4 py-2 rounded-lg cursor-pointer transition-colors whitespace-nowrap">
                      <input type="file" accept=".png" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const fd = new FormData();
                        fd.append('file', file);
                        try {
                          const res = await fetch(`${API_CONFIG.BASE_URL}/api/v1/widget/admin/avatar`, {
                            method: 'POST',
                            headers: { Authorization: API_CONFIG.getHeaders().Authorization },
                            body: fd
                          });
                          const data = await res.json();
                          if (res.ok) {
                            update('avatar_url', data.avatar_url);
                            // También recargar config si es necesario, pero update ya lo cambia localmente.
                          }
                          else alert(data.detail || 'Error al subir avatar');
                        } catch(err) {
                          alert('Error de conexión');
                        }
                        e.target.value = '';
                      }} />
                      Subir .png
                    </label>
                  </div>
                </div>
              </div>
            </Section>

            {/* Dimensiones */}
            <Section title="Dimensiones y límites" icon={Type} defaultOpen={false}>
              <div className="pt-3 space-y-3">
                <NumberField label="Ancho del panel"          name="chat_width"       value={cfg.chat_width}       onChange={update} min={280} max={600} unit="px" />
                <NumberField label="Alto máximo del panel"    name="chat_height"      value={cfg.chat_height}      onChange={update} min={300} max={900} unit="px" />
                <NumberField label="Máximo de interacciones por sesión" name="max_interactions" value={cfg.max_interactions} onChange={update} min={1} max={50} unit="msgs" />
              </div>
            </Section>

            {/* Configuración LLM y RAG */}
            <Section title="Comportamiento del Modelo (LLM)" icon={Type} defaultOpen={false}>
              <div className="pt-3 space-y-3">
                <div className="bg-[#3d3d3d]/40 border border-[#4a4a4a]/50 rounded-xl p-3 text-xs text-slate-400 mb-2">
                  Ajusta cómo piensa y responde la IA. Cambios aplican de inmediato.
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between"><label className="text-xs text-slate-400">Temperatura (Creatividad)</label><span className="text-xs font-mono">{cfg.llm_temperature}</span></div>
                  <input type="range" min="0" max="2" step="0.1" value={cfg.llm_temperature ?? 0.1} onChange={e => update('llm_temperature', parseFloat(e.target.value))} className="w-full accent-[#168bf2]" />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between"><label className="text-xs text-slate-400">Top-P (Probabilidad acumulada)</label><span className="text-xs font-mono">{cfg.llm_top_p}</span></div>
                  <input type="range" min="0" max="1" step="0.05" value={cfg.llm_top_p ?? 0.95} onChange={e => update('llm_top_p', parseFloat(e.target.value))} className="w-full accent-[#168bf2]" />
                </div>
                <NumberField label="Top-K (Tokens candidatos)" name="llm_top_k" value={cfg.llm_top_k} onChange={update} min={1} max={100} />
                <NumberField label="RAG Top-K (Fragmentos DB a inyectar)" name="rag_top_k" value={cfg.rag_top_k} onChange={update} min={1} max={40} />
              </div>
            </Section>
          </div>

          {/* Preview */}
          <div className="hidden xl:flex flex-col gap-3 items-center">
            <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Vista previa</p>
            <WidgetPreview cfg={cfg} />
            <p className="text-xs text-slate-600 text-center max-w-[300px]">
              La vista previa es aproximada. Los cambios se ven en tiempo real en el widget embeddable al guardar.
            </p>
          </div>
        </div>
      )}

      {/* ── TAB: Contenido ─────────────────────────────────────────────────── */}
      {!loading && activeTab === 'content' && (
        <div className="space-y-4 max-w-2xl">
          <Section title="Identidad del bot" icon={MessageSquare}>
            <div className="pt-3 space-y-3">
              <TextField label="Nombre del bot (header del chat)" name="title"    value={cfg.title}    onChange={update} />
              <TextField label="Subtítulo / descripción"          name="subtitle" value={cfg.subtitle} onChange={update} />
            </div>
          </Section>
          <Section title="Mensajes de bienvenida" icon={MessageSquare}>
            <div className="pt-3 space-y-3">
              <TextareaField
                label="Saludo — contexto público (sitio web corporativo)"
                name="greeting_public"
                value={cfg.greeting_public}
                onChange={update}
              />
              <TextareaField
                label="Saludo — contexto interno (intranet)"
                name="greeting_internal"
                value={cfg.greeting_internal}
                onChange={update}
              />
            </div>
          </Section>
          <div className="bg-[#3d3d3d]/40 border border-[#4a4a4a]/50 rounded-xl p-4 text-sm text-slate-400 space-y-1">
            <p className="font-semibold text-slate-300">Formato de respuestas</p>
            <p>Las respuestas del bot se renderizan con <strong className="text-slate-200">Markdown</strong>: negritas (<code className="text-[#5bd893]">**texto**</code>), listas (<code className="text-[#5bd893]">- item</code>), encabezados (<code className="text-[#5bd893]">## Título</code>), código y más.</p>
            <p>El modelo Gemini ya está configurado para usar formato Markdown en sus respuestas.</p>
          </div>
        </div>
      )}

      {/* ── TAB: Sesiones ──────────────────────────────────────────────────── */}
      {activeTab === 'sessions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">
              Conversaciones registradas · máximo {cfg.max_interactions} mensajes por sesión
            </p>
            <button
              onClick={loadSessions}
              disabled={sessLoading}
              className="flex items-center gap-2 text-sm text-slate-300 hover:text-white border border-slate-700 hover:border-slate-600 px-3 py-1.5 rounded-lg transition-colors"
            >
              <RefreshCw size={14} className={sessLoading ? 'animate-spin' : ''} />
              Actualizar
            </button>
          </div>

          {sessLoading && (
            <div className="text-center py-12 text-slate-400">
              <RefreshCw size={20} className="animate-spin mx-auto mb-3" />
              Cargando sesiones…
            </div>
          )}

          {!sessLoading && sessions.length === 0 && (
            <div className="text-center py-16 text-slate-500">
              <Users size={32} className="mx-auto mb-3 opacity-40" />
              <p>No hay sesiones registradas aún.</p>
            </div>
          )}

          {!sessLoading && sessions.length > 0 && (
            <div className="bg-[#2d2d2d] border border-[#3d3d3d] rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#3d3d3d] text-left">
                    <th className="px-4 py-3 text-slate-400 font-medium">Session ID</th>
                    <th className="px-4 py-3 text-slate-400 font-medium">Contexto</th>
                    <th className="px-4 py-3 text-slate-400 font-medium text-center">Msgs</th>
                    <th className="px-4 py-3 text-slate-400 font-medium">Creada</th>
                    <th className="px-4 py-3 text-slate-400 font-medium">Última interacción</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s, i) => (
                    <tr key={s.id} className={`border-b border-[#3d3d3d]/50 hover:bg-[#3d3d3d]/30 transition-colors ${i % 2 === 0 ? '' : 'bg-[#3d3d3d]/10'}`}>
                      <td className="px-4 py-3 font-mono text-xs text-[#5bd893]">{s.id}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.context === 'internal' || s.context === 'intranet' ? 'bg-violet-500/20 text-violet-300' : 'bg-blue-500/20 text-blue-300'}`}>
                          {s.context}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-sm font-semibold ${s.interaction_count >= cfg.max_interactions ? 'text-red-400' : 'text-slate-200'}`}>
                          {s.interaction_count}
                        </span>
                        <span className="text-slate-600 text-xs">/{cfg.max_interactions}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{s.created_at ? new Date(s.created_at).toLocaleString('es') : '—'}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{s.last_interaction_at ? new Date(s.last_interaction_at).toLocaleString('es') : '—'}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedSess(s)}
                          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-[#5bd893] border border-[#4a4a4a] hover:border-[#168bf2] px-2.5 py-1 rounded-lg transition-colors"
                        >
                          <Eye size={12} /> Ver
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Session detail modal */}
      <GlobalModal onClose={() => setSelectedSess(null)}>
        {selectedSess && <SessionModal session={selectedSess} onClose={() => setSelectedSess(null)} />}
      </GlobalModal>
    </div>
  );
}
