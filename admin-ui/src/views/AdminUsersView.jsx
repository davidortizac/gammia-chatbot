import { useState, useEffect } from 'react';
import { UserPlus, Trash2, Shield, ShieldCheck, RefreshCw, Eye, EyeOff, KeyRound } from 'lucide-react';
import { GlobalModal } from '../App';
import { API_CONFIG } from '../config';

const API = API_CONFIG.BASE_URL;

function authHeaders(token) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

const ROLE_BADGE = {
  superadmin: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
  admin:      'bg-[#168bf2]/20 text-[#5bd893] border border-[#168bf2]/30',
};

// ── Create User Modal ──────────────────────────────────────────────────────────
function CreateUserModal({ token, onClose, onCreated }) {
  const [form, setForm]   = useState({ email: '', full_name: '', password: '', role: 'admin' });
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/v1/auth/users`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Error al crear usuario');
      onCreated();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const field = (label, key, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
      {key === 'role' ? (
        <select
          value={form.role}
          onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
          className="w-full bg-[#3d3d3d] border border-[#4a4a4a] rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-[#168bf2]"
        >
          <option value="admin">Admin</option>
          <option value="superadmin">Superadmin</option>
        </select>
      ) : key === 'password' ? (
        <div className="relative">
          <input
            type={showPwd ? 'text' : 'password'}
            value={form[key]}
            onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
            required
            placeholder={placeholder}
            className="w-full bg-[#3d3d3d] border border-[#4a4a4a] rounded-lg px-3 py-2.5 pr-10 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#168bf2]"
          />
          <button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
            {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      ) : (
        <input
          type={type}
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          required={key === 'email'}
          placeholder={placeholder}
          className="w-full bg-[#3d3d3d] border border-[#4a4a4a] rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#168bf2]"
        />
      )}
    </div>
  );

  return (
    <div className="bg-[#2d2d2d] border border-[#4a4a4a] rounded-2xl p-6 w-full max-w-md shadow-2xl">
      <h3 className="text-white font-semibold text-lg mb-5 flex items-center gap-2">
        <UserPlus size={18} className="text-[#5bd893]" /> Nuevo Admin
      </h3>
      <form onSubmit={submit} className="space-y-4">
        {field('Correo electrónico', 'email', 'email', 'usuario@gammaingenieros.com')}
        {field('Nombre completo', 'full_name', 'text', 'Nombre Apellido')}
        {field('Contraseña', 'password', 'password', '••••••••')}
        {field('Rol', 'role')}
        {error && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-[#4a4a4a] text-slate-400 hover:text-slate-200 text-sm transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg bg-[#168bf2] hover:bg-[#1a96f5] text-white text-sm font-semibold transition-colors disabled:opacity-60">
            {saving ? 'Guardando...' : 'Crear Admin'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Change Password Modal ──────────────────────────────────────────────────────
function ChangePasswordModal({ token, onClose }) {
  const [form, setForm]   = useState({ current_password: '', new_password: '', confirm: '' });
  const [show, setShow]   = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk]       = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (form.new_password !== form.confirm) { setError('Las contraseñas no coinciden'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch(`${API}/api/v1/auth/me/password`, {
        method: 'PUT',
        headers: authHeaders(token),
        body: JSON.stringify({ current_password: form.current_password, new_password: form.new_password }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Error');
      setOk(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-[#2d2d2d] border border-[#4a4a4a] rounded-2xl p-6 w-full max-w-md shadow-2xl">
      <h3 className="text-white font-semibold text-lg mb-5 flex items-center gap-2">
        <KeyRound size={18} className="text-[#5bd893]" /> Cambiar Contraseña
      </h3>
      {ok ? (
        <div className="text-center py-4">
          <p className="text-[#3dc156] font-semibold mb-4">Contraseña actualizada</p>
          <button onClick={onClose} className="px-6 py-2 bg-slate-700 rounded-lg text-slate-200 text-sm hover:bg-slate-600">Cerrar</button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {['current_password', 'new_password', 'confirm'].map((key, i) => (
            <div key={key}>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                {['Contraseña actual', 'Nueva contraseña', 'Confirmar contraseña'][i]}
              </label>
              <input
                type={show ? 'text' : 'password'}
                value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                required
                className="w-full bg-[#3d3d3d] border border-[#4a4a4a] rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-[#168bf2]"
              />
            </div>
          ))}
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
            <input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} className="accent-[#168bf2]" />
            Mostrar contraseñas
          </label>
          {error && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-[#4a4a4a] text-slate-400 hover:text-slate-200 text-sm">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg bg-[#168bf2] hover:bg-[#1a96f5] text-white text-sm font-semibold disabled:opacity-60">
              {saving ? 'Guardando...' : 'Actualizar'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Main View ──────────────────────────────────────────────────────────────────
export default function AdminUsersView({ token, currentUser }) {
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(null); // 'create' | 'password'

  const isSuperadmin = currentUser?.role === 'superadmin';

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/v1/auth/users`, { headers: authHeaders(token) });
      const data = await res.json();
      setUsers(data.users || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchUsers(); }, []);

  async function deactivate(id) {
    if (!confirm('¿Desactivar este usuario?')) return;
    await fetch(`${API}/api/v1/auth/users/${id}`, { method: 'DELETE', headers: authHeaders(token) });
    fetchUsers();
  }

  async function toggleRole(user) {
    const newRole = user.role === 'superadmin' ? 'admin' : 'superadmin';
    await fetch(`${API}/api/v1/auth/users/${user.id}`, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify({ role: newRole }),
    });
    fetchUsers();
  }

  return (
    <div className="max-w-4xl mx-auto">
      {modal && (
        <GlobalModal onClose={() => setModal(null)}>
          {modal === 'create' && <CreateUserModal token={token} onClose={() => setModal(null)} onCreated={fetchUsers} />}
          {modal === 'password' && <ChangePasswordModal token={token} onClose={() => setModal(null)} />}
        </GlobalModal>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-white">Gestión de Admins</h2>
          <p className="text-sm text-slate-400 mt-0.5">{users.length} usuario{users.length !== 1 ? 's' : ''} registrado{users.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setModal('password')} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#4a4a4a] text-slate-400 hover:text-slate-200 hover:border-slate-600 text-sm transition-colors">
            <KeyRound size={15} /> Mi Contraseña
          </button>
          <button onClick={fetchUsers} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#4a4a4a] text-slate-400 hover:text-slate-200 text-sm transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          {isSuperadmin && (
            <button onClick={() => setModal('create')} className="flex items-center gap-2 px-4 py-2 bg-[#168bf2] hover:bg-[#1a96f5] text-white rounded-lg text-sm font-medium transition-colors">
              <UserPlus size={15} /> Nuevo Admin
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#2d2d2d] border border-[#3d3d3d] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#3d3d3d] text-xs text-slate-500 uppercase tracking-wider">
              <th className="text-left px-5 py-3 font-medium">Usuario</th>
              <th className="text-left px-5 py-3 font-medium">Rol</th>
              <th className="text-left px-5 py-3 font-medium">Estado</th>
              <th className="text-left px-5 py-3 font-medium">Creado por</th>
              <th className="text-left px-5 py-3 font-medium">Fecha</th>
              {isSuperadmin && <th className="px-5 py-3" />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center text-slate-500 py-12">Cargando...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="text-center text-slate-500 py-12">Sin usuarios</td></tr>
            ) : users.map(u => (
              <tr key={u.id} className={`border-b border-[#3d3d3d]/60 hover:bg-[#3d3d3d]/30 transition-colors ${!u.is_active ? 'opacity-50' : ''}`}>
                <td className="px-5 py-3.5">
                  <p className="text-slate-200 font-medium">{u.email}</p>
                  {u.full_name && <p className="text-slate-500 text-xs mt-0.5">{u.full_name}</p>}
                </td>
                <td className="px-5 py-3.5">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${ROLE_BADGE[u.role] || ROLE_BADGE.admin}`}>
                    {u.role === 'superadmin' ? 'Superadmin' : 'Admin'}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <span className={`text-xs px-2 py-1 rounded-full ${u.is_active ? 'bg-[#3dc156]/10 text-[#3dc156]' : 'bg-[#4a4a4a] text-slate-500'}`}>
                    {u.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-slate-400 text-xs">{u.created_by || '—'}</td>
                <td className="px-5 py-3.5 text-slate-500 text-xs">
                  {u.created_at ? new Date(u.created_at).toLocaleDateString('es-CO') : '—'}
                </td>
                {isSuperadmin && (
                  <td className="px-5 py-3.5">
                    {u.email !== currentUser?.email && (
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => toggleRole(u)}
                          title={u.role === 'superadmin' ? 'Bajar a Admin' : 'Subir a Superadmin'}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-purple-400 hover:bg-slate-700 transition-colors"
                        >
                          {u.role === 'superadmin' ? <Shield size={15} /> : <ShieldCheck size={15} />}
                        </button>
                        {u.is_active && (
                          <button onClick={() => deactivate(u.id)} className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-700 transition-colors">
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!isSuperadmin && (
        <p className="text-xs text-slate-500 mt-4 text-center">Solo los superadmins pueden crear o modificar usuarios.</p>
      )}
    </div>
  );
}
