import { NavLink, useNavigate } from 'react-router-dom'
import { Zap, Plus, Clock, Settings, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function Sidebar({ email }: { email: string }) {
  const navigate = useNavigate()

  const logout = async () => {
    await supabase.auth.signOut()
    window.location.reload()
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-icon"><Zap size={16} /></div>
        <div>
          <div className="brand-name">AutoSeguimiento</div>
          <div className="brand-sub">Grantt</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <NavLink to="/nuevo" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <Plus size={15} /> Nuevo seguimiento
        </NavLink>
        <NavLink to="/historial" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <Clock size={15} /> Historial
        </NavLink>
        <NavLink to="/config" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <Settings size={15} /> Configuración
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user" style={{ marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {email}
        </div>
        <button className="nav-item" onClick={logout} style={{ width: '100%', color: 'rgba(239,68,68,0.6)' }}>
          <LogOut size={13} /> Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
