-- ============================================================
--  SISTEMA DE ACCESOS CON APROBACION
--  Correr este archivo PRIMERO, en el SQL Editor de Supabase.
--
--  Que hace:
--   - Cada persona se registra sola, pero entra en estado PENDIENTE.
--   - Hasta que alguien la aprueba, no ve absolutamente nada.
--   - Quien aprueba elige el rol y la sede reales. Lo que la persona
--     pidio al registrarse es solo una sugerencia.
--   - Direccion ve y edita todo. El gerente solo su sede, y nunca
--     puede crear otro director.
--
--  ANTES DE CORRER, cambiá estas dos cosas en la funcion
--  crear_usuario_desde_auth() al final del archivo:
--   1. El dominio de correo permitido
--   2. El mail que se activa solo como director
-- ============================================================

-- ---------- 1. Tipos ----------

create type rol_usuario as enum (
  'director',        -- ve y edita todo
  'gerente',         -- ve y edita su sede, aprueba a su equipo
  'vendedor',        -- carga registros
  'profesor',        -- acceso acotado
  'control_acceso'   -- solo lectura de ciertas tablas
);

create type estado_usuario as enum ('pendiente', 'activo', 'inactivo', 'rechazado');

-- ---------- 2. Tabla de usuarios ----------
-- Extiende auth.users de Supabase con rol, sede y estado.
-- rol y sede quedan NULL hasta que alguien aprueba la cuenta.

create table usuarios (
  id               uuid primary key references auth.users(id) on delete cascade,
  nombre           text not null,
  email            text unique not null,
  rol              rol_usuario,
  sede             text,
  estado           estado_usuario not null default 'pendiente',
  rol_solicitado   rol_usuario,   -- lo que pidio al registrarse
  sede_solicitada  text,          -- lo que pidio al registrarse
  aprobado_por     uuid references usuarios(id),
  aprobado_en      timestamptz,
  desactivado_en   timestamptz,
  creado_en        timestamptz not null default now()
);

-- ---------- 3. Funciones de ayuda ----------
-- Devuelven NULL si la cuenta no esta activa. Por eso una cuenta
-- pendiente no pasa ninguna politica: no tiene rol ni sede.

create or replace function rol_actual() returns rol_usuario
language sql stable security definer set search_path = public
as $$ select rol from usuarios where id = auth.uid() and estado = 'activo' $$;

create or replace function sede_actual() returns text
language sql stable security definer set search_path = public
as $$ select sede from usuarios where id = auth.uid() and estado = 'activo' $$;

create or replace function es_director() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from usuarios
  where id = auth.uid() and estado = 'activo' and rol = 'director'
) $$;

-- ---------- 4. Alta automatica al registrarse ----------
-- CAMBIAR AQUI: el dominio permitido y el mail del director.

create or replace function crear_usuario_desde_auth() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  dominio_permitido text := 'megatlon.com.ar';        -- <<< CAMBIAR
  mail_director     text := 'flaso@megatlon.com.ar';  -- <<< CAMBIAR
  dominio text := lower(split_part(new.email, '@', 2));
  es_admin boolean := lower(new.email) = lower(mail_director);
begin
  -- Si no queres restringir por dominio, borra este bloque IF.
  if dominio <> dominio_permitido then
    raise exception 'Solo se permiten cuentas con correo @%', dominio_permitido;
  end if;

  insert into public.usuarios (
    id, nombre, email, rol, sede, estado,
    rol_solicitado, sede_solicitada, aprobado_en
  ) values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)),
    lower(new.email),
    case when es_admin then 'director'::rol_usuario else null end,
    case when es_admin then coalesce(new.raw_user_meta_data ->> 'sede', 'Todas') else null end,
    case when es_admin then 'activo'::estado_usuario else 'pendiente'::estado_usuario end,
    (new.raw_user_meta_data ->> 'rol')::rol_usuario,
    new.raw_user_meta_data ->> 'sede',
    case when es_admin then now() else null end
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger trg_crear_usuario
  after insert on auth.users
  for each row execute function crear_usuario_desde_auth();

-- ---------- 5. Permisos sobre la tabla usuarios ----------

alter table usuarios enable row level security;

-- Cada uno se ve a si mismo. Direccion ve todo.
-- El gerente ve su sede, incluidas las solicitudes que pidieron esa sede.
create policy usuarios_select on usuarios for select using (
  id = auth.uid()
  or es_director()
  or (rol_actual() = 'gerente' and coalesce(sede, sede_solicitada) = sede_actual())
);

-- Direccion edita cualquier perfil.
-- El gerente solo dentro de su sede, y no puede crear otro director.
create policy usuarios_update on usuarios for update using (
  es_director()
  or (rol_actual() = 'gerente' and coalesce(sede, sede_solicitada) = sede_actual())
) with check (
  es_director()
  or (rol_actual() = 'gerente' and sede = sede_actual() and rol is distinct from 'director')
);

-- Vista comoda con las solicitudes esperando aprobacion
create or replace view v_solicitudes
with (security_invoker = true) as
select id, nombre, email, rol_solicitado, sede_solicitada, estado, creado_en
from usuarios
where estado = 'pendiente'
order by creado_en;
