-- ============================================================
--  CRM DE SEGUIMIENTO DE SLEEPERS
--  Correr DESPUES de 01-accesos.sql y 02-actividad.sql.
--
--  Que hace:
--   - Tabla de socios sin asistir (casos), con historial de
--     comentarios en una tabla aparte (mas seguro que un array
--     quando varias personas comentan al mismo tiempo).
--   - Cada sede solo ve y edita sus propios socios. Direccion
--     ve y edita todas las sedes.
--   - vendedor y gerente pueden cargar y editar. profesor y
--     control_acceso solo pueden leer (ajustalo si lo necesitas
--     distinto).
-- ============================================================

-- ---------- 1. Tabla de casos (socios sin asistir) ----------

create table casos (
  id                  uuid primary key default gen_random_uuid(),
  nombre              text not null,
  dni                 text,
  email               text,
  telefono            text,
  sede                text not null,
  ultima_visita       text,
  mensaje             text,
  subido_por          text,
  cargo_subido_por    text,
  creado_por          uuid references auth.users(id),
  fecha_carga         date not null default current_date,
  fecha_envio_mensaje date,
  motivo              text,
  riesgo              text check (riesgo in ('Alto', 'Medio', 'Bajo')),
  fecha_motivo_riesgo date,
  fecha_seguimiento   date,
  estado              text not null default 'Abierto' check (estado in ('Abierto', 'Cerrado')),
  creado_en           timestamptz not null default now()
);

create index casos_sede_idx on casos (sede);
create index casos_estado_idx on casos (estado);

-- ---------- 2. Tabla de comentarios ----------
-- Una fila por comentario, no un array: asi dos personas pueden
-- comentar el mismo socio al mismo tiempo sin pisarse.

create table comentarios (
  id          uuid primary key default gen_random_uuid(),
  caso_id     uuid not null references casos(id) on delete cascade,
  texto       text not null,
  autor       text,
  cargo       text,
  creado_por  uuid references auth.users(id),
  creado_en   timestamptz not null default now()
);

create index comentarios_caso_idx on comentarios (caso_id);

-- ---------- 3. Totales de socios por sede ----------
-- Para calcular "% sobre cartera" en la comparativa entre sedes.

create table socios_totales (
  sede   text primary key,
  total  integer not null default 0
);

-- ---------- 4. RLS: casos ----------

alter table casos enable row level security;

create policy "casos_select" on casos for select
  using (es_director() or sede = sede_actual());

create policy "casos_insert" on casos for insert
  with check (
    rol_actual() in ('director', 'gerente', 'vendedor')
    and (es_director() or sede = sede_actual())
  );

create policy "casos_update" on casos for update
  using (
    rol_actual() in ('director', 'gerente', 'vendedor')
    and (es_director() or sede = sede_actual())
  );

create policy "casos_delete" on casos for delete
  using (
    rol_actual() in ('director', 'gerente')
    and (es_director() or sede = sede_actual())
  );

-- ---------- 5. RLS: comentarios ----------
-- Se filtra a traves del caso al que pertenece el comentario.

alter table comentarios enable row level security;

create policy "comentarios_select" on comentarios for select
  using (exists (
    select 1 from casos c where c.id = comentarios.caso_id
    and (es_director() or c.sede = sede_actual())
  ));

create policy "comentarios_insert" on comentarios for insert
  with check (
    rol_actual() in ('director', 'gerente', 'vendedor')
    and exists (
      select 1 from casos c where c.id = comentarios.caso_id
      and (es_director() or c.sede = sede_actual())
    )
  );

-- ---------- 6. RLS: socios_totales ----------

alter table socios_totales enable row level security;

create policy "socios_totales_select" on socios_totales for select
  using (es_director() or sede = sede_actual());

create policy "socios_totales_upsert" on socios_totales for insert
  with check (
    rol_actual() in ('director', 'gerente')
    and (es_director() or sede = sede_actual())
  );

create policy "socios_totales_update" on socios_totales for update
  using (
    rol_actual() in ('director', 'gerente')
    and (es_director() or sede = sede_actual())
  );

-- ---------- 7. Realtime ----------
-- Habilita que la app reciba cambios en vivo (como el onSnapshot
-- de Firestore que se usaba antes).

alter publication supabase_realtime add table casos;
alter publication supabase_realtime add table comentarios;
