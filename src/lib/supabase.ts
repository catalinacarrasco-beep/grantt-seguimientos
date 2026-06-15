import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export type Seguimiento = {
  id: string
  created_at: string
  invoice_num: string
  din_num: string
  trazabilidad: string
  fecha_solicitud: string
  productos_count: number
  estado: 'pendiente' | 'completado' | 'error'
  drive_link: string | null
  invoice_path: string | null
  din_path: string | null
  user_email: string
}

export type Configuracion = {
  id: string
  user_email: string
  drive_folder_id: string
  updated_at: string
}
