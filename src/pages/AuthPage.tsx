import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Zap, Mail, Lock } from 'lucide-react'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [sent, setSent] = useState(false)

  const handle = async () => {
    setLoading(true); setError('')
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setSent(true)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  if (sent) return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>📧</div>
        <div className="auth-title">Revisa tu email</div>
        <p className="auth-sub">Te enviamos un enlace de confirmación a <strong>{email}</strong></p>
      </div>
    </div>
  )

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="brand-icon"><Zap size={16} /></div>
          <div>
            <div className="brand-name">AutoSeguimiento</div>
            <div className="brand-sub">Representaciones Grantt</div>
          </div>
        </div>

        <div className="auth-title">{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</div>
        <div className="auth-sub">
          {mode === 'login' ? 'Accede con tu cuenta Grantt' : 'Crea tu cuenta para comenzar'}
        </div>

        {error && <div className="auth-error">{error}</div>}

        <div className="field">
          <label className="field-label">Email</label>
          <div style={{ position: 'relative' }}>
            <Mail size={14} style={{ position: 'absolute', left: 11, top: 10, color: 'rgba(255,255,255,0.3)' }} />
            <input className="field-input" style={{ paddingLeft: 32 }}
              type="email" placeholder="tu@grantt.cl"
              value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handle()} />
          </div>
        </div>

        <div className="field">
          <label className="field-label">Contraseña</label>
          <div style={{ position: 'relative' }}>
            <Lock size={14} style={{ position: 'absolute', left: 11, top: 10, color: 'rgba(255,255,255,0.3)' }} />
            <input className="field-input" style={{ paddingLeft: 32 }}
              type="password" placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handle()} />
          </div>
        </div>

        <button className="btn btn-primary btn-full" onClick={handle} disabled={loading || !email || !password}>
          {loading ? 'Cargando...' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
        </button>

        <div className="auth-divider">
          {mode === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}
          <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}
            style={{ background: 'none', border: 'none', color: '#a5b4fc', cursor: 'pointer', marginLeft: 6, fontSize: 13 }}>
            {mode === 'login' ? 'Crear cuenta' : 'Iniciar sesión'}
          </button>
        </div>
      </div>
    </div>
  )
}
