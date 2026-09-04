-- Ejecutar este script en Supabase: Dashboard > SQL Editor > New query > Run
-- (Para una instalacion nueva. Si ya habias creado la tabla con una sola
-- columna "fecha", corre en cambio migration_fecha_inicio_fin.sql)

create extension if not exists "pgcrypto";

create table if not exists actividades (
  id uuid primary key default gen_random_uuid(),
  tema text not null default '',
  actividad text not null default '',
  responsable text not null default '',
  fecha_inicio date,
  fecha_fin date,
  estado text not null default 'Pendiente'
    check (estado in ('Pendiente', 'En progreso', 'Completado', 'Atrasado')),
  alerta text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Mantiene updated_at al dia en cada edicion
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists actividades_set_updated_at on actividades;
create trigger actividades_set_updated_at
  before update on actividades
  for each row execute procedure set_updated_at();

-- Row Level Security: esta es una app interna sin login, asi que se habilita
-- RLS pero se deja una politica abierta para la clave publicable (anon).
-- Si en el futuro se agrega autenticacion, cambia estas politicas para
-- exigir auth.uid() y restringir por usuario/equipo.
alter table actividades enable row level security;

drop policy if exists "actividades_select_anon" on actividades;
create policy "actividades_select_anon" on actividades
  for select using (true);

drop policy if exists "actividades_insert_anon" on actividades;
create policy "actividades_insert_anon" on actividades
  for insert with check (true);

drop policy if exists "actividades_update_anon" on actividades;
create policy "actividades_update_anon" on actividades
  for update using (true) with check (true);

drop policy if exists "actividades_delete_anon" on actividades;
create policy "actividades_delete_anon" on actividades
  for delete using (true);
