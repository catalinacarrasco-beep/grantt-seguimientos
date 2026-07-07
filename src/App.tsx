import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import AuthPage from './pages/AuthPage'
import NuevoPage from './pages/NuevoPage'
import HistorialPage from './pages/HistorialPage'
import InspeccionesPage from './pages/InspeccionesPage'
import ConfigPage from './pages/ConfigPage'
import CalidadPage from './pages/CalidadPage'
import BDMaestraPage from './pages/BDMaestraPage'
import Sidebar from './components/Sidebar'
import type { User } from '@supabase/supabase-js'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0c0e14' }}>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>Cargando...</div>
    </div>
  )

  if (!user) return <AuthPage />

  return (
    <div className="layout">
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <Sidebar email={user.email || ''} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="content">
        <div className="mobile-header">
          <button className="btn-icon" onClick={() => setSidebarOpen(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>AutoSeguimiento</span>
        </div>
        <Routes>
          <Route path="/" element={<Navigate to="/calidad" replace />} />
          <Route path="/calidad" element={<CalidadPage />} />
          <Route path="/inspecciones" element={<InspeccionesPage />} />
          <Route path="/nuevo" element={<NuevoPage />} />
          <Route path="/historial" element={<HistorialPage />} />
          <Route path="/bd-maestra" element={<BDMaestraPage />} />
          <Route path="/config" element={<ConfigPage />} />
        </Routes>
      </div>
    </div>
  )
}
