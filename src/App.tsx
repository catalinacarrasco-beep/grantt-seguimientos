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
import NotaVentaPage from './pages/NotaVentaPage'
import CanaletasPage from './pages/CanaletasPage'
import CanaletasHistorialPage from './pages/CanaletasHistorialPage'
import Sidebar from './components/Sidebar'
import type { User } from '@supabase/supabase-js'

// ponytail: pantalla inline de nueva contraseña — solo se muestra en modo PASSWORD_RECOVERY
function ResetPasswordScreen({ onDone }: { onDone: () => void }) {
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState(false)

  const submit = async () => {
    setErr('')
    if (pw1.length < 6) { setErr('Mínimo 6 caracteres'); return }
    if (pw1 !== pw2) { setErr('Las contraseñas no coinciden'); return }
    setBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: pw1 })
      if (error) throw error
      setOk(true)
      // cerrar sesión de recovery y volver al login limpio
      setTimeout(async () => {
        await supabase.auth.signOut()
        onDone()
      }, 1500)
    } catch (e: any) {
      setErr(e?.message || 'Error')
    } finally { setBusy(false) }
  }

  if (ok) return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
        <div className="auth-title">Contraseña actualizada</div>
        <p className="auth-sub">Ya podés iniciar sesión con la nueva.</p>
      </div>
    </div>
  )

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-title">Nueva contraseña</div>
        <div className="auth-sub">Definí una nueva contraseña para tu cuenta.</div>
        {err && <div className="auth-error">{err}</div>}
        <div className="field">
          <label className="field-label">Nueva contraseña</label>
          <input className="field-input" type="password" placeholder="••••••••"
            value={pw1} onChange={e => setPw1(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Repetí la contraseña</label>
          <input className="field-input" type="password" placeholder="••••••••"
            value={pw2} onChange={e => setPw2(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} />
        </div>
        <button className="btn btn-primary btn-full" onClick={submit} disabled={busy || !pw1 || !pw2}>
          {busy ? 'Guardando...' : 'Guardar contraseña'}
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [updateReady, setUpdateReady] = useState(false)
  const [recoveryMode, setRecoveryMode] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => {
    const onUpdate = () => setUpdateReady(true)
    window.addEventListener('sw-update-available', onUpdate)
    return () => window.removeEventListener('sw-update-available', onUpdate)
  }, [])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0c0e14' }}>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>Cargando...</div>
    </div>
  )

  if (recoveryMode) return <ResetPasswordScreen onDone={() => setRecoveryMode(false)} />
  if (!user) return <AuthPage />

  return (
    <div className="layout">
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <Sidebar email={user.email || ''} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} installPrompt={installPrompt} onInstalled={() => setInstallPrompt(null)} updateReady={updateReady} />
      <div className="content">
        <div className="mobile-header">
          <button className="btn-icon" onClick={() => setSidebarOpen(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Calidad Grantt</span>
        </div>
        <Routes>
          <Route path="/" element={<Navigate to="/calidad" replace />} />
          <Route path="/calidad" element={<CalidadPage />} />
          <Route path="/inspecciones" element={<InspeccionesPage />} />
          <Route path="/nuevo" element={<NuevoPage />} />
          <Route path="/historial" element={<HistorialPage />} />
          <Route path="/nota-venta" element={<NotaVentaPage />} />
          <Route path="/canaletas" element={<CanaletasPage />} />
          <Route path="/canaletas/historial" element={<CanaletasHistorialPage />} />
          <Route path="/bd-maestra" element={<BDMaestraPage />} />
          <Route path="/config" element={<ConfigPage />} />
        </Routes>
      </div>
    </div>
  )
}
