import { useEffect, useState } from 'react'
import { Save, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function ConfigPage() {
  const [folderId, setFolderId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [user, setUser] = useState<{ email?: string }>({})

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user || {})
      const { data } = await supabase.from('configuracion').select('*').eq('user_email', user?.email).single()
      if (data) setFolderId(data.drive_folder_id || '')
      setLoading(false)
    }
    load()
  }, [])

  const save = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('configuracion').upsert({
      user_email: user?.email,
      drive_folder_id: folderId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_email' })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const logout = async () => {
    await supabase.auth.signOut()
    window.location.reload()
  }

  if (loading) return <div className="page"><div className="text-muted">Cargando...</div></div>

  return (
    <div className="page">
      <div className="page-title">Configuración</div>
      <div className="page-sub">Ajustes de la cuenta y conexión con Google Drive</div>

      <div className="card">
        <div className="card-title">Cuenta</div>
        <div style={{ marginTop: 12 }}>
          <div className="text-xs text-muted" style={{ marginBottom: 4 }}>Usuario</div>
          <div style={{ fontSize: 14, color: '#e2e8f0' }}>{user.email}</div>
        </div>
        <button className="btn btn-danger btn-sm" style={{ marginTop: 16 }} onClick={logout}>
          Cerrar sesión
        </button>
      </div>

      <div className="card">
        <div className="card-title">Google Drive</div>
        <p className="text-sm text-muted" style={{ marginTop: 4, marginBottom: 20 }}>
          Carpeta donde se crearán las subcarpetas por lote (una por cada Invoice).
        </p>

        <div className="field">
          <label className="field-label">ID carpeta "seguimientos en proceso"</label>
          <input className="field-input" value={folderId}
            onChange={e => setFolderId(e.target.value)}
            placeholder="Pega el ID de la carpeta de Google Drive" />
          <div className="field-hint">
            Desde la URL: drive.google.com/drive/folders/<span className="field-hint-accent">ESTE_ES_EL_ID</span>
          </div>
        </div>

        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saved ? <><CheckCircle2 size={14} /> Guardado</> : <><Save size={14} /> {saving ? 'Guardando...' : 'Guardar configuración'}</>}
        </button>
      </div>

      <div className="card">
        <div className="card-title">Datos fijos del formulario</div>
        <p className="text-sm text-muted" style={{ marginTop: 4 }}>
          Estos valores se insertan automáticamente en cada solicitud generada.
        </p>
        <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
          {[
            ['Razón social', 'Representaciones Grantt Ltda'],
            ['RUT', '99.582.120-6'],
            ['Representante legal', 'Cristobal Vigil'],
            ['RUT representante', '10.288.069-2'],
            ['Dirección', 'Santa Margarita #0742, San Bernardo'],
            ['Tipo ensayo', 'Seguimiento'],
          ].map(([label, val]) => (
            <div key={label} className="flex items-center gap-3">
              <span className="text-xs text-muted" style={{ minWidth: 140 }}>{label}</span>
              <span className="text-sm" style={{ color: '#e2e8f0' }}>{val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
