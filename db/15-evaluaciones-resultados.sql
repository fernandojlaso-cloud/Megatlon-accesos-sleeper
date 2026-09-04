-- ============================================================
--  RESULTADOS DE LA EVALUACION
--  Correr DESPUES de 14-renombrar-resultado.sql.
--
--  Cada intento de la evaluacion queda asentado con quien la
--  rindio, cuando y con que puntaje. Se usa tambien para calcular
--  el tiempo de espera de 10 dias entre intentos.
-- ============================================================

create table evaluaciones_resultados (
  id                uuid primary key default gen_random_uuid(),
  usuario_id        uuid not null references auth.users(id),
  usuario_nombre    text,
  rol               text,
  sede              text,
  puntaje           integer not null,
  total_preguntas   integer not null,
  creado_en         timestamptz not null default now()
);

create index evaluaciones_usuario_idx on evaluaciones_resultados (usuario_id, creado_en desc);

alter table evaluaciones_resultados enable row level security;

-- Cada uno registra su propio resultado.
create policy "evaluaciones_insert" on evaluaciones_resultados for insert
  with check (usuario_id = auth.uid());

-- Cada uno ve su propio historial. Direccion ve todo. El Gerente
-- ve el de su sede (para hacer seguimiento del equipo).
create policy "evaluaciones_select" on evaluaciones_resultados for select
  using (
    usuario_id = auth.uid()
    or es_director()
    or (rol_actual() = 'gerente' and sede = sede_actual())
  );
