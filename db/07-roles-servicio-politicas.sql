-- ============================================================
--  ROLES DE SERVICIO — PARTE 2 (politicas)
--  Correr DESPUES de 06-roles-servicio.sql, en una consulta
--  APARTE (Postgres no deja usar un valor de rol nuevo en la
--  misma transaccion en la que se lo crea).
-- ============================================================

-- ---------- 1. Quien puede cargar y hacer seguimiento de casos ----------
-- Antes: director, gerente, vendedor. Ahora: director, gerente,
-- y los 3 roles de servicio.

drop policy if exists "casos_insert" on casos;
create policy "casos_insert" on casos for insert
  with check (
    rol_actual() in ('director', 'gerente', 'gerente_servicio', 'coordinador_servicio', 'referente_servicio')
    and (es_director() or sede = sede_actual())
  );

drop policy if exists "casos_update" on casos;
create policy "casos_update" on casos for update
  using (
    rol_actual() in ('director', 'gerente', 'gerente_servicio', 'coordinador_servicio', 'referente_servicio')
    and (es_director() or sede = sede_actual())
  );

-- comentarios_insert tenia la misma lista de roles.
drop policy if exists "comentarios_insert" on comentarios;
create policy "comentarios_insert" on comentarios for insert
  with check (
    rol_actual() in ('director', 'gerente', 'gerente_servicio', 'coordinador_servicio', 'referente_servicio')
    and exists (
      select 1 from casos c where c.id = comentarios.caso_id
      and (es_director() or c.sede = sede_actual())
    )
  );

-- ---------- 2. El Gerente ahora tambien puede corregir datos de identidad ----------
-- (Antes solo Direccion. El borrado sigue siendo exclusivo de Direccion,
-- eso no cambia — la politica casos_delete no se toca.)

create or replace function bloquear_edicion_identidad() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if rol_actual() not in ('director', 'gerente') and (
    old.nombre   is distinct from new.nombre or
    old.dni      is distinct from new.dni or
    old.email    is distinct from new.email or
    old.telefono is distinct from new.telefono or
    old.sede     is distinct from new.sede
  ) then
    raise exception 'Solo Direccion o Gerente pueden corregir nombre, DNI, email, telefono o sede.';
  end if;
  return new;
end;
$$;

-- ---------- 3. El Gerente solo aprueba los roles de su equipo ----------
-- (Antes podia asignar cualquier rol menos director. Ahora solo
-- puede asignar los 3 roles de servicio — no puede crear otro
-- Gerente ni Direccion.)

drop policy if exists usuarios_update on usuarios;
create policy usuarios_update on usuarios for update using (
  es_director()
  or (rol_actual() = 'gerente' and coalesce(sede, sede_solicitada) = sede_actual())
) with check (
  es_director()
  or (rol_actual() = 'gerente' and sede = sede_actual()
      and rol in ('gerente_servicio', 'coordinador_servicio', 'referente_servicio'))
);
