import { useState, useEffect } from 'react';
import {
  BrainCircuit, CalendarCheck, Users, ShieldAlert,
  ChevronDown, ChevronUp, Loader, CheckCircle, AlertCircle,
  Lock, Save, Zap,
} from 'lucide-react';
import { API_CONFIG } from '../config';

// Definiciones estáticas de UI por integración
const INTEGRATION_DEFS = [
  {
    id: 'rag',
    Icon: BrainCircuit,
    name: 'Búsqueda Neural RAG',
    description:
      'Permite al agente rastrear el índice pgvector y recuperar contexto interno ante preguntas técnicas, de políticas o documentación corporativa.',
    configFields: [],
  },
  {
    id: 'google_workspace',
    Icon: CalendarCheck,
    name: 'Google Workspace Action',
    description:
      'Inyecta la capacidad de leer calendarios, agendar citas o enviar correos desde la cuenta de Google Workspace configurada.',
    configFields: [
      { key: 'send_from_email', label: 'Email de envío / delegación', placeholder: 'ciso@gammaingenieros.com', type: 'text' },
      { key: 'calendar_id',    label: 'Calendar ID',                 placeholder: 'primary  o  ID específico del calendario', type: 'text' },
    ],
  },
  {
    id: 'salesforce',
    Icon: Users,
    name: 'Salesforce CRM Link',
    description:
      'Consulta de tickets y perfiles de clientes externos desde el CRM corporativo. Actualmente desactivado — se habilitará en Q3 2025.',
    configFields: [
      { key: 'instance_url',  label: 'URL de instancia Salesforce', placeholder: 'https://mycompany.salesforce.com', type: 'text' },
      { key: 'client_id',     label: 'Client ID (Consumer Key)',    placeholder: 'Connected App Consumer Key',      type: 'text' },
      { key: 'client_secret', label: 'Client Secret',               placeholder: '···',                            type: 'password' },
    ],
  },
  {
    id: 'vulnerability_scanner',
    Icon: ShieldAlert,
    name: 'Scanner Vulnerabilidades',
    description:
      '[En Desarrollo] Dispara análisis pasivos de infraestructura y devuelve el reporte JSON al agente para su interpretación.',
    configFields: [
      { key: 'api_endpoint', label: 'API Endpoint', placeholder: 'https://scanner.internal/api/v1/scan', type: 'text' },
      { key: 'api_key',      label: 'API Key / Bearer Token',       placeholder: 'sk-…',                           type: 'password' },
    ],
    wip: true,
  },
];

// ── Card individual ────────────────────────────────────────────────────────────

function IntegrationCard({ def, state, onChange }) {
  const [expanded,   setExpanded]   = useState(false);
  const [testing,    setTesting]    = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok, message } | null

  const { Icon, configFields, wip } = def;
  const isLocked   = state?.locked         ?? false;
  const isDisabled = state?.locked_enabled === false && isLocked; // Salesforce: locked + disabled
  const isActive   = isLocked ? (state?.locked_enabled ?? false) : (state?.enabled ?? false);
  const config     = state?.config ?? {};
  const testable   = state?.testable ?? false;
  const version    = state?.version  ?? 'v1.0.0';
  const hasConfig  = configFields.length > 0;

  const handleToggle = () => {
    if (isLocked) return;
    onChange({ enabled: !state?.enabled });
    setTestResult(null);
  };

  const handleField = (key, value) => {
    onChange({ config: { ...config, [key]: value } });
    setTestResult(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch(`${API_CONFIG.BASE_URL}/api/v1/integrations/${def.id}/test`, {
        method: 'POST',
        headers: API_CONFIG.getHeaders(),
      });
      const d = await r.json();
      setTestResult(d);
    } catch (e) {
      setTestResult({ ok: false, message: `Error de red: ${e.message}` });
    } finally {
      setTesting(false);
    }
  };

  const cardActive = isActive && !isDisabled;

  return (
    <div className={`border rounded-2xl transition-all duration-300 overflow-hidden flex flex-col
      ${cardActive
        ? 'bg-[#168bf2]/5 border-[#168bf2]/30 shadow-[inset_0_0_20px_rgba(22,139,242,0.05)]'
        : 'bg-[#2d2d2d]/50 border-[#3d3d3d]/80 opacity-75'}`}>

      {/* Header */}
      <div className="p-6 flex-1">
        <div className="flex justify-between items-start mb-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-inner border
            ${cardActive ? 'bg-[#168bf2]/10 border-[#168bf2]/20 text-[#5bd893]' : 'bg-[#3d3d3d] border-[#4a4a4a] text-slate-500'}`}>
            <Icon size={22} />
          </div>

          {/* Toggle o badge de bloqueo */}
          {isLocked ? (
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border
              ${isDisabled
                ? 'bg-[#3d3d3d] border-[#4a4a4a] text-slate-500'
                : 'bg-[#168bf2]/10 border-[#168bf2]/20 text-[#5bd893]'}`}>
              <Lock size={10} />
              {isDisabled ? 'Desactivado' : 'Siempre activo'}
            </div>
          ) : (
            <button
              onClick={handleToggle}
              title={isActive ? 'Desactivar' : 'Activar'}
              className={`w-12 h-6 rounded-full relative transition-colors duration-300 focus:outline-none
                ${isActive ? 'bg-[#168bf2]' : 'bg-[#4a4a4a]'}`}>
              <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform duration-300 shadow-md
                ${isActive ? 'translate-x-7' : 'translate-x-1'}`} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 mb-1">
          <h3 className={`text-base font-semibold tracking-tight ${cardActive ? 'text-white' : 'text-slate-400'}`}>
            {def.name}
          </h3>
          {wip && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
              WIP
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500 leading-relaxed">{def.description}</p>

        {/* Footer de la card */}
        <div className="mt-5 pt-4 border-t border-[#3d3d3d]/50 flex items-center justify-between">
          <span className="text-xs font-mono text-slate-600">{version}</span>
          <div className="flex items-center gap-2">
            {hasConfig && (
              <button
                onClick={() => setExpanded(v => !v)}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors">
                Configurar
                {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
            )}
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded
              ${isDisabled
                ? 'bg-[#3d3d3d] text-slate-600'
                : cardActive
                  ? 'bg-[#168bf2]/10 text-[#5bd893]'
                  : 'bg-[#3d3d3d] text-slate-500'}`}>
              {isDisabled ? 'DESACTIVADO' : cardActive ? 'ACTIVO' : 'INACTIVO'}
            </span>
          </div>
        </div>
      </div>

      {/* Panel de configuración desplegable */}
      {expanded && hasConfig && (
        <div className="px-6 pb-6 border-t border-[#3d3d3d]/40 bg-[#1a1a1a]/40 space-y-3 pt-4">
          {configFields.map(field => (
            <div key={field.key}>
              <label className="block text-xs font-medium text-slate-400 mb-1">{field.label}</label>
              <input
                type={field.type === 'password' ? 'password' : 'text'}
                value={config[field.key] ?? ''}
                onChange={e => handleField(field.key, e.target.value)}
                placeholder={field.placeholder}
                disabled={isDisabled}
                className="w-full bg-[#2d2d2d] border border-[#4a4a4a] rounded-lg px-3 py-2 text-sm
                  text-slate-200 placeholder-slate-600 font-mono
                  focus:outline-none focus:border-[#168bf2] transition-colors
                  disabled:opacity-40 disabled:cursor-not-allowed"
              />
            </div>
          ))}

          {/* Botón Probar conexión */}
          {testable && !isDisabled && (
            <div className="pt-1 space-y-2">
              <button
                onClick={handleTest}
                disabled={testing}
                className="flex items-center gap-2 px-4 py-2 bg-[#3d3d3d] hover:bg-[#4a4a4a]
                  disabled:opacity-40 text-slate-200 font-medium text-sm rounded-lg transition-all">
                {testing ? <Loader size={13} className="animate-spin" /> : <Zap size={13} className="text-[#5bd893]" />}
                {testing ? 'Probando conexión...' : 'Probar conexión'}
              </button>

              {testResult && (
                <div className={`flex items-start gap-2 p-3 rounded-lg text-xs border
                  ${testResult.ok
                    ? 'bg-[#3dc156]/10 border-[#3dc156]/20 text-[#3dc156]'
                    : 'bg-rose-500/10 border-rose-500/20 text-rose-300'}`}>
                  {testResult.ok
                    ? <CheckCircle size={13} className="shrink-0 mt-0.5" />
                    : <AlertCircle size={13} className="shrink-0 mt-0.5" />}
                  <span>{testResult.message}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Vista principal ────────────────────────────────────────────────────────────

export default function ToolsView() {
  const [states,     setStates]     = useState({});   // { [id]: { enabled, locked, config, … } }
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [saveResult, setSaveResult] = useState(null); // { ok, message } | null

  const base    = API_CONFIG.BASE_URL;
  const headers = API_CONFIG.getHeaders();

  // Carga inicial desde el backend
  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`${base}/api/v1/integrations`, { headers });
        if (r.ok) {
          const d = await r.json();
          const map = {};
          for (const item of d.integrations ?? []) map[item.id] = item;
          setStates(map);
        }
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  // Actualiza un campo específico de una integración
  const updateState = (id, patch) => {
    setStates(prev => ({
      ...prev,
      [id]: { ...prev[id], ...patch, config: { ...prev[id]?.config, ...patch.config } },
    }));
    setSaveResult(null);
  };

  // Guarda todo en el backend
  const saveAll = async () => {
    setSaving(true);
    setSaveResult(null);
    try {
      const payload = Object.entries(states).map(([id, s]) => ({
        id,
        enabled: s.enabled ?? false,
        config:  s.config  ?? {},
      }));
      const r = await fetch(`${base}/api/v1/integrations`, {
        method:  'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ integrations: payload }),
      });
      const d = await r.json();
      setSaveResult(
        d.ok
          ? { ok: true,  message: 'Configuración guardada correctamente' }
          : { ok: false, message: d.detail || 'Error al guardar' }
      );
    } catch (e) {
      setSaveResult({ ok: false, message: `Sin conexión con el backend: ${e.message}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto animate-fade-in">
      {/* Cabecera */}
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Integraciones de IA</h2>
          <p className="text-slate-400 text-sm mt-1">
            Habilita, configura y prueba las capacidades externas del agente GammIA.
          </p>
        </div>
        <button
          onClick={saveAll}
          disabled={saving || loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#168bf2] hover:bg-[#1a96f5]
            disabled:opacity-40 text-white font-semibold text-sm rounded-lg transition-all
            shadow-[0_0_12px_rgba(22,139,242,0.3)]">
          {saving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Guardando...' : 'Guardar configuración'}
        </button>
      </div>

      {/* Banner de resultado de guardado */}
      {saveResult && (
        <div className={`flex items-center gap-2 p-4 border rounded-xl mb-6 text-sm
          ${saveResult.ok
            ? 'bg-[#3dc156]/10 border-[#3dc156]/30 text-[#3dc156]'
            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
          {saveResult.ok
            ? <CheckCircle size={16} className="shrink-0" />
            : <AlertCircle size={16} className="shrink-0" />}
          {saveResult.message}
        </div>
      )}

      {/* Grid de cards */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-500 gap-2">
          <Loader size={18} className="animate-spin" />
          Cargando integraciones...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {INTEGRATION_DEFS.map(def => (
            <IntegrationCard
              key={def.id}
              def={def}
              state={states[def.id] ?? {}}
              onChange={patch => updateState(def.id, patch)}
            />
          ))}
        </div>
      )}

      {/* Nota informativa */}
      <p className="text-xs text-slate-600 text-center mt-8">
        Las integraciones marcadas con <span className="text-slate-500 font-medium">candado</span> están
        gestionadas por el sistema y no se pueden modificar desde el panel.
      </p>
    </div>
  );
}
