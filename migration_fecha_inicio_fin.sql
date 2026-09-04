-- Migracion: separa la columna unica "fecha" en "fecha_inicio" y "fecha_fin".
-- Ejecutar en Supabase: Dashboard > SQL Editor > New query > pega esto > Run
-- (Seguro de correr mas de una vez: usa IF NOT EXISTS / IF EXISTS)

alter table actividades add column if not exists fecha_inicio date;
alter table actividades add column if not exists fecha_fin date;

-- Si la tabla todavia tiene la columna vieja "fecha", copia esos valores a
-- fecha_fin (para no perder lo que ya se habia registrado) y luego la borra.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'actividades' and column_name = 'fecha'
  ) then
    update actividades set fecha_fin = fecha where fecha_fin is null;
    alter table actividades drop column fecha;
  end if;
end $$;
