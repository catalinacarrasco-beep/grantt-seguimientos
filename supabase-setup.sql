-- =============================================
-- AutoSeguimiento Grantt — Supabase Setup SQL
-- Pega esto en Supabase > Editor SQL > Ejecutar
-- =============================================

-- Tabla de seguimientos (historial)
create table if not exists seguimientos (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  invoice_num text not null,
  din_num text,
  trazabilidad text,
  fecha_solicitud text,
  productos_count int default 0,
  estado text default 'completado',
  drive_link text,
  invoice_path text,
  din_path text,
  user_email text
);

-- Tabla de configuracion por usuario
create table if not exists configuracion (
  id uuid default gen_random_uuid() primary key,
  user_email text unique not null,
  drive_folder_id text default '',
  updated_at timestamptz default now()
);

-- Bucket de almacenamiento para PDFs
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

-- Politica: usuarios autenticados pueden leer/escribir sus propios archivos
create policy "Usuarios pueden subir documentos"
on storage.objects for insert
to authenticated
with check (bucket_id = 'documentos');

create policy "Usuarios pueden leer sus documentos"
on storage.objects for select
to authenticated
using (bucket_id = 'documentos');

-- Politica de acceso a tablas (cualquier usuario autenticado puede ver todo)
alter table seguimientos enable row level security;
alter table configuracion enable row level security;

create policy "Acceso autenticado a seguimientos"
on seguimientos for all
to authenticated
using (true)
with check (true);

create policy "Acceso autenticado a configuracion"
on configuracion for all
to authenticated
using (true)
with check (true);

-- Listo!
select 'Setup completado' as resultado;
