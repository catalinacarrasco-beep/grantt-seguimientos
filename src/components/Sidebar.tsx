import { NavLink, useNavigate } from 'react-router-dom'
import { Zap, Plus, Clock, Settings, LogOut, ClipboardCheck, ArrowRight } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function Sidebar({ email, isOpen, onClose }: { email: string; isOpen: boolean; onClose: () => void }) {
  const navigate = useNavigate()

  const logout = async () => {
    await supabase.auth.signOut()
    window.location.reload()
  }

  const nav = (to: string) => { navigate(to); onClose() }

  return (
    <aside className={`sidebar${isOpen ? ' sidebar-open' : ''}`}>
      <div className="sidebar-brand">
        <div className="brand-icon"><Zap size={16} /></div>
        <div>
          <div className="brand-name">AutoSeguimiento</div>
          <div className="brand-sub">Grantt</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">Control de calidad</div>
        <NavLink to="/calidad" onClick={onClose} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <ClipboardCheck size={15} /> Inspección marcado
        </NavLink>

        <div className="nav-section-label" style={{ marginTop: 8 }}>Solicitud seguimiento</div>
        <NavLink to="/nuevo" onClick={onClose} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <Plus size={15} /> Nuevo seguimiento
        </NavLink>
        <NavLink to="/historial" onClick={onClose} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <Clock size={15} /> Historial
        </NavLink>

        <div style={{ marginTop: 8 }}>
          <NavLink to="/config" onClick={onClose} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <Settings size={15} /> Configuración
          </NavLink>
        </div>
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">{email}</div>
        <button className="nav-item" onClick={logout} style={{ width: '100%', color: 'rgba(239,68,68,0.6)' }}>
          <LogOut size={13} /> Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
