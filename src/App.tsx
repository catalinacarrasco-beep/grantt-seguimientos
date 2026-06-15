import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import AuthPage from './pages/AuthPage'
import NuevoPage from './pages/NuevoPage'
import HistorialPage from './pages/HistorialPage'
import ConfigPage from './pages/ConfigPage'
import Sidebar from './components/Sidebar'
import type { User } from '@supabase/supabase-js'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

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
      <Sidebar email={user.email || ''} />
      <div className="content">
        <Routes>
          <Route path="/" element={<Navigate to="/nuevo" replace />} />
          <Route path="/nuevo" element={<NuevoPage />} />
          <Route path="/historial" element={<HistorialPage />} />
          <Route path="/config" element={<ConfigPage />} />
        </Routes>
      </div>
    </div>
  )
}
