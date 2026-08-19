-- ============================================================
--  REGISTRO DE ACTIVIDAD (log de participantes)
--  Correr DESPUES de 01-accesos.sql
--
--  La idea de fondo: el log no depende de que la aplicacion se
--  acuerde de escribirlo. Son disparadores de la base. Si alguien
--  toca un dato, queda registrado, aunque lo haga desde otro lado.
-- ============================================================

create table actividad_log (
  id             bigserial primary key,
  usuario_id     uuid references usuarios(id),
  usuario_nombre text,          -- se guarda copiado, para que el historial
  rol            rol_usuario,   -- sobreviva aunque el usuario se de de baja
  sede           text,
  accion         text not null,
  entidad        text,          -- que tabla se toco
  entidad_id     bigint,        -- que registro
  detalle        jsonb,
  ocurrido_en    timestamptz not null default now()
);

create index actividad_sede_idx    on actividad_log (sede, ocurrido_en desc);
create index actividad_usuario_idx on actividad_log (usuario_id, ocurrido_en desc);

alter table actividad_log enable row level security;

-- Cualquiera puede escribir su propia linea
create policy actividad_insert on actividad_log for insert
  with check (usuario_id = auth.uid());

-- Cada uno lee lo suyo. Direccion lee todo. El gerente, su sede.
create policy actividad_select on actividad_log for select using (
  usuario_id = auth.uid()
  or es_director()
  or (rol_actual() = 'gerente' and sede = sede_actual())
);

-- ---------- Registro de cambios de acceso ----------
-- Deja constancia de quien aprueba, rechaza, da de baja o
-- modifica el rol o la sede de otra persona.

create or replace function loguear_cambio_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare u record;
begin
  select nombre, rol, sede into u from usuarios where id = auth.uid();
  insert into actividad_log (usuario_id, usuario_nombre, rol, sede, accion, entidad, detalle)
  values (
    auth.uid(), u.nombre, u.rol, u.sede,
    case when old.estado = 'pendiente' and new.estado = 'activo' then 'cuenta_aprobada'
         when new.estado = 'rechazado' then 'cuenta_rechazada'
         when new.estado = 'inactivo'  then 'cuenta_dada_de_baja'
         else 'perfil_modificado' end,
    'usuario',
    jsonb_build_object(
      'usuario', new.email,
      'rol_anterior', old.rol,   'rol_nuevo', new.rol,
      'sede_anterior', old.sede, 'sede_nueva', new.sede,
      'estado_nuevo', new.estado
    )
  );
  return new;
end $$;

create trigger trg_loguear_usuario
  after update on usuarios
  for each row
  when (old.estado is distinct from new.estado
        or old.rol   is distinct from new.rol
        or old.sede  is distinct from new.sede)
  execute function loguear_cambio_usuario();

-- ============================================================
--  COMO LOGUEAR CUALQUIER OTRA TABLA
--
--  Copiá este molde y cambiá el nombre de la tabla y los datos
--  que quieras guardar en 'detalle'.
-- ============================================================

-- create or replace function loguear_MITABLA() returns trigger
-- language plpgsql security definer set search_path = public as $$
-- declare u record;
-- begin
--   select nombre, rol, sede into u from usuarios where id = auth.uid();
--   insert into actividad_log (usuario_id, usuario_nombre, rol, sede, accion, entidad, entidad_id, detalle)
--   values (
--     auth.uid(), u.nombre, u.rol, u.sede,
--     lower(TG_OP),          -- insert, update o delete
--     'MITABLA', new.id,
--     jsonb_build_object('campo', new.campo)
--   );
--   return new;
-- end $$;
--
-- create trigger trg_loguear_MITABLA
--   after insert or update on MITABLA
--   for each row execute function loguear_MITABLA();

-- ============================================================
--  COMO APLICAR EL FILTRO POR SEDE A CUALQUIER TABLA
--
--  Agregá una columna sede text not null a la tabla y despues:
-- ============================================================

-- alter table MITABLA enable row level security;
--
-- create policy MITABLA_select on MITABLA for select
--   using (es_director() or sede = sede_actual());
--
-- create policy MITABLA_insert on MITABLA for insert
--   with check (es_director() or (rol_actual() in ('gerente','vendedor') and sede = sede_actual()));
--
-- create policy MITABLA_update on MITABLA for update
--   using (es_director() or (rol_actual() in ('gerente','vendedor') and sede = sede_actual()));
--
-- -- Solo el gerente borra
-- create policy MITABLA_delete on MITABLA for delete
--   using (es_director() or (rol_actual() = 'gerente' and sede = sede_actual()));
