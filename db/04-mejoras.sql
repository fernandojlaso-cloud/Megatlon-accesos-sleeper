-- ============================================================
--  MEJORAS AL CRM DE SLEEPERS
--  Correr DESPUES de 03-sleepers.sql.
--
--  Que hace:
--   - Agrega fecha de fin de contrato e intencion de volver.
--   - El riesgo pasa a calcularse solo segun el motivo (se hace
--     desde el frontend, esta migracion solo prepara el campo).
--   - Solo Direccion puede corregir datos de identidad (nombre,
--     dni, email, telefono, sede) o eliminar un caso. El resto
--     de los roles puede seguir actualizando motivo, riesgo,
--     seguimiento, estado y comentarios con normalidad.
--     Esto se aplica con un trigger, no solo ocultando botones
--     en la app: es real a nivel de base de datos.
-- ============================================================

-- ---------- 1. Columnas nuevas ----------

alter table casos add column fecha_fin_contrato date;
alter table casos add column intencion_volver text check (intencion_volver in ('Si', 'No'));

-- ---------- 2. Solo Direccion corrige datos de identidad ----------

create or replace function bloquear_edicion_identidad() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not es_director() and (
    old.nombre   is distinct from new.nombre or
    old.dni      is distinct from new.dni or
    old.email    is distinct from new.email or
    old.telefono is distinct from new.telefono or
    old.sede     is distinct from new.sede
  ) then
    raise exception 'Solo Direccion puede corregir nombre, DNI, email, telefono o sede.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bloquear_edicion_identidad on casos;
create trigger trg_bloquear_edicion_identidad
  before update on casos
  for each row execute function bloquear_edicion_identidad();

-- ---------- 3. Solo Direccion elimina casos ----------

drop policy if exists "casos_delete" on casos;
create policy "casos_delete" on casos for delete
  using (es_director());
