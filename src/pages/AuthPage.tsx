import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Zap, Mail, Lock } from 'lucide-react'

type Mode = 'login' | 'signup' | 'recovery'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<Mode>('login')
  const [sent, setSent] = useState<'signup' | 'recovery' | ''>('')

  const handle = async () => {
    setLoading(true); setError('')
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setSent('signup')
      } else {
        // recovery
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/`,
        })
        if (error) throw error
        setSent('recovery')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  if (sent === 'signup') return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>📧</div>
        <div className="auth-title">Revisa tu email</div>
        <p className="auth-sub">Te enviamos un enlace de confirmación a <strong>{email}</strong></p>
      </div>
    </div>
  )

  if (sent === 'recovery') return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔑</div>
        <div className="auth-title">Revisa tu email</div>
        <p className="auth-sub">
          Te enviamos un enlace a <strong>{email}</strong> para restablecer tu contraseña.
          Al clickearlo volverás a la app y podrás definir una nueva.
        </p>
        <button className="btn btn-secondary btn-full" style={{ marginTop: 16 }}
          onClick={() => { setSent(''); setMode('login'); setEmail(''); setPassword('') }}>
          Volver al login
        </button>
      </div>
    </div>
  )

  const titles: Record<Mode, string> = { login: 'Iniciar sesión', signup: 'Crear cuenta', recovery: 'Recuperar contraseña' }
  const subs: Record<Mode, string> = {
    login: 'Accede con tu cuenta Grantt',
    signup: 'Crea tu cuenta para comenzar',
    recovery: 'Ingresá tu email y te enviamos un enlace para restablecerla',
  }
  const submitLabel: Record<Mode, string> = { login: 'Entrar', signup: 'Crear cuenta', recovery: 'Enviar enlace' }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="brand-icon"><Zap size={16} /></div>
          <div>
            <div className="brand-name">Calidad Grantt</div>
            <div className="brand-sub">Representaciones Grantt</div>
          </div>
        </div>

        <div className="auth-title">{titles[mode]}</div>
        <div className="auth-sub">{subs[mode]}</div>

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

        {mode !== 'recovery' && (
          <div className="field">
            <label className="field-label">Contraseña</label>
            <div style={{ position: 'relative' }}>
              <Lock size={14} style={{ position: 'absolute', left: 11, top: 10, color: 'rgba(255,255,255,0.3)' }} />
              <input className="field-input" style={{ paddingLeft: 32 }}
                type="password" placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handle()} />
            </div>
            {mode === 'login' && (
              <button onClick={() => { setMode('recovery'); setError('') }}
                style={{ background: 'none', border: 'none', color: 'rgba(165,180,252,0.7)', cursor: 'pointer', padding: 0, marginTop: 6, fontSize: 12, textAlign: 'right', width: '100%' }}>
                ¿Olvidaste tu contraseña?
              </button>
            )}
          </div>
        )}

        <button className="btn btn-primary btn-full" onClick={handle}
          disabled={loading || !email || (mode !== 'recovery' && !password)}>
          {loading ? 'Cargando...' : submitLabel[mode]}
        </button>

        <div className="auth-divider">
          {mode === 'recovery' ? (
            <>¿Ya la recuperaste? <button onClick={() => { setMode('login'); setError('') }} style={{ background: 'none', border: 'none', color: '#a5b4fc', cursor: 'pointer', marginLeft: 6, fontSize: 13 }}>Iniciar sesión</button></>
          ) : mode === 'login' ? (
            <>¿No tienes cuenta? <button onClick={() => { setMode('signup'); setError('') }} style={{ background: 'none', border: 'none', color: '#a5b4fc', cursor: 'pointer', marginLeft: 6, fontSize: 13 }}>Crear cuenta</button></>
          ) : (
            <>¿Ya tienes cuenta? <button onClick={() => { setMode('login'); setError('') }} style={{ background: 'none', border: 'none', color: '#a5b4fc', cursor: 'pointer', marginLeft: 6, fontSize: 13 }}>Iniciar sesión</button></>
          )}
        </div>
      </div>
    </div>
  )
}
