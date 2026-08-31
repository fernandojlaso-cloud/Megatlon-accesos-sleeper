-- ============================================================
--  SEGUIMIENTO DE CONTRATOS A VENCER
--  Correr DESPUES de 09-supervisor-politicas.sql.
--
--  Que hace:
--   - Tabla nueva (separada de "casos") para socios ACTIVOS
--     cuyo contrato vence pronto, cruzando 3 planillas mensuales:
--     Contratos a vencer (la base), Accesos (asistencia) y NPS.
--   - Cada carga mensual queda como una fila propia (columna
--     mes_carga), para poder comparar evolucion mes a mes sin
--     pisar el historial.
--   - Mismos permisos por sede/rol que "casos": cada sede ve y
--     trabaja lo suyo, Direccion y Supervisor ven todo (Supervisor
--     solo lectura), solo Direccion elimina.
-- ============================================================

create table seguimiento_contratos (
  id                   uuid primary key default gen_random_uuid(),
  dni                  text not null,
  nombre               text not null,
  sede                 text not null,
  telefono             text,
  email                text,
  tipo_socio_n1        text,
  tipo_socio_n2        text,
  lista_precio         text,
  fecha_fin_contrato   date not null,
  nps_score            integer,
  nps_comentario       text,
  nps_fecha_respuesta  date,
  asistencias_2m       integer,
  mes_carga            text not null,           -- 'YYYY-MM' del mes de esta carga
  fecha_carga          date not null default current_date,
  estado               text not null default 'Abierto' check (estado in ('Abierto', 'Cerrado')),
  subido_por           text,
  cargo_subido_por     text,
  creado_por           uuid references auth.users(id),
  creado_en            timestamptz not null default now(),
  unique (dni, mes_carga)
);

create index seg_contratos_sede_idx on seguimiento_contratos (sede);
create index seg_contratos_mes_idx  on seguimiento_contratos (mes_carga);

-- ---------- Comentarios (mismo patron que en "casos") ----------

create table seguimiento_contratos_comentarios (
  id           uuid primary key default gen_random_uuid(),
  registro_id  uuid not null references seguimiento_contratos(id) on delete cascade,
  texto        text not null,
  autor        text,
  cargo        text,
  creado_por   uuid references auth.users(id),
  creado_en    timestamptz not null default now()
);

create index seg_comentarios_registro_idx on seguimiento_contratos_comentarios (registro_id);

-- ---------- RLS: seguimiento_contratos ----------

alter table seguimiento_contratos enable row level security;

create policy "seg_contratos_select" on seguimiento_contratos for select
  using (es_director() or es_supervisor() or sede = sede_actual());

create policy "seg_contratos_insert" on seguimiento_contratos for insert
  with check (
    rol_actual() in ('director', 'gerente', 'gerente_servicio', 'coordinador_servicio', 'referente_servicio')
    and (es_director() or sede = sede_actual())
  );

create policy "seg_contratos_update" on seguimiento_contratos for update
  using (
    rol_actual() in ('director', 'gerente', 'gerente_servicio', 'coordinador_servicio', 'referente_servicio')
    and (es_director() or sede = sede_actual())
  );

create policy "seg_contratos_delete" on seguimiento_contratos for delete
  using (es_director());

-- Solo Direccion o Gerente corrigen datos de identidad (igual que en "casos").
create or replace function bloquear_edicion_identidad_seg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if rol_actual() not in ('director', 'gerente') and (
    old.nombre is distinct from new.nombre or
    old.dni    is distinct from new.dni or
    old.sede   is distinct from new.sede
  ) then
    raise exception 'Solo Direccion o Gerente pueden corregir nombre, DNI o sede.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bloquear_edicion_identidad_seg on seguimiento_contratos;
create trigger trg_bloquear_edicion_identidad_seg
  before update on seguimiento_contratos
  for each row execute function bloquear_edicion_identidad_seg();

-- ---------- RLS: seguimiento_contratos_comentarios ----------

alter table seguimiento_contratos_comentarios enable row level security;

create policy "seg_comentarios_select" on seguimiento_contratos_comentarios for select
  using (exists (
    select 1 from seguimiento_contratos r where r.id = seguimiento_contratos_comentarios.registro_id
    and (es_director() or es_supervisor() or r.sede = sede_actual())
  ));

create policy "seg_comentarios_insert" on seguimiento_contratos_comentarios for insert
  with check (
    rol_actual() in ('director', 'gerente', 'gerente_servicio', 'coordinador_servicio', 'referente_servicio')
    and exists (
      select 1 from seguimiento_contratos r where r.id = seguimiento_contratos_comentarios.registro_id
      and (es_director() or r.sede = sede_actual())
    )
  );

-- ---------- Tiempo real ----------

alter publication supabase_realtime add table seguimiento_contratos;
alter publication supabase_realtime add table seguimiento_contratos_comentarios;
