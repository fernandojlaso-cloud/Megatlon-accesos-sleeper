-- ============================================================
--  ACTIVIDAD PARA EL CRM DE SLEEPERS
--  Correr DESPUES de 04-mejoras.sql.
--
--  El registro de actividad (db/02-actividad.sql) solo estaba
--  conectado a la tabla de usuarios. Esto lo conecta tambien a
--  los socios (casos) y a los comentarios, con la misma logica:
--  disparadores de base de datos, no depende de que la app
--  avise.
-- ============================================================

create or replace function loguear_caso() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  u record;
  v_id uuid;
  v_nombre text;
  v_sede text;
  v_estado text;
  v_motivo text;
  v_riesgo text;
  v_accion text;
begin
  select nombre, rol, sede into u from usuarios where id = auth.uid();

  if TG_OP = 'DELETE' then
    v_id := old.id; v_nombre := old.nombre; v_sede := old.sede;
    v_estado := old.estado; v_motivo := old.motivo; v_riesgo := old.riesgo;
    v_accion := 'socio_eliminado';
  elsif TG_OP = 'INSERT' then
    v_id := new.id; v_nombre := new.nombre; v_sede := new.sede;
    v_estado := new.estado; v_motivo := new.motivo; v_riesgo := new.riesgo;
    v_accion := 'socio_cargado';
  else
    v_id := new.id; v_nombre := new.nombre; v_sede := new.sede;
    v_estado := new.estado; v_motivo := new.motivo; v_riesgo := new.riesgo;
    v_accion := case
      when old.estado is distinct from new.estado then 'estado_cambiado'
      when old.motivo is distinct from new.motivo then 'motivo_cargado'
      when old.riesgo is distinct from new.riesgo then 'riesgo_actualizado'
      when old.sede is distinct from new.sede then 'sede_reasignada'
      when old.fecha_envio_mensaje is distinct from new.fecha_envio_mensaje then 'mensaje_enviado'
      when old.fecha_seguimiento is distinct from new.fecha_seguimiento then 'seguimiento_programado'
      when old.intencion_volver is distinct from new.intencion_volver then 'intencion_volver_cargada'
      when old.nombre   is distinct from new.nombre
        or old.dni      is distinct from new.dni
        or old.email    is distinct from new.email
        or old.telefono is distinct from new.telefono then 'datos_corregidos'
      else 'socio_modificado'
    end;
  end if;

  insert into actividad_log (usuario_id, usuario_nombre, rol, sede, accion, entidad, detalle)
  values (
    auth.uid(), u.nombre, u.rol, u.sede,
    v_accion, 'caso',
    jsonb_build_object(
      'caso_id', v_id, 'nombre', v_nombre, 'sede', v_sede,
      'estado', v_estado, 'motivo', v_motivo, 'riesgo', v_riesgo
    )
  );
  return coalesce(new, old);
end $$;

drop trigger if exists trg_loguear_caso on casos;
create trigger trg_loguear_caso
  after insert or update or delete on casos
  for each row execute function loguear_caso();

-- ---------- Comentarios ----------

create or replace function loguear_comentario() returns trigger
language plpgsql security definer set search_path = public as $$
declare u record; v_sede text;
begin
  select nombre, rol, sede into u from usuarios where id = auth.uid();
  select sede into v_sede from casos where id = new.caso_id;
  insert into actividad_log (usuario_id, usuario_nombre, rol, sede, accion, entidad, detalle)
  values (
    auth.uid(), u.nombre, u.rol, v_sede,
    'comentario_agregado', 'comentario',
    jsonb_build_object('caso_id', new.caso_id, 'texto', left(new.texto, 140))
  );
  return new;
end $$;

drop trigger if exists trg_loguear_comentario on comentarios;
create trigger trg_loguear_comentario
  after insert on comentarios
  for each row execute function loguear_comentario();
