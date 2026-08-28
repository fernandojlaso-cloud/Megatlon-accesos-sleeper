-- ============================================================
--  ROL SUPERVISOR — PARTE 2 (politicas)
--  Correr DESPUES de 08-supervisor.sql, en una consulta APARTE
--  (Postgres no deja usar un valor de rol nuevo en la misma
--  transaccion en la que se lo crea).
--
--  El Supervisor puede LEER casos, comentarios y socios_totales
--  de todas las sedes. No se le da ningun permiso de insert,
--  update ni delete: por omision, no puede cargar ni tocar nada.
-- ============================================================

create or replace function es_supervisor() returns boolean
language sql stable security definer set search_path = public as $$
  select rol_actual() = 'supervisor';
$$;

drop policy if exists "casos_select" on casos;
create policy "casos_select" on casos for select
  using (es_director() or es_supervisor() or sede = sede_actual());

drop policy if exists "comentarios_select" on comentarios;
create policy "comentarios_select" on comentarios for select
  using (exists (
    select 1 from casos c where c.id = comentarios.caso_id
    and (es_director() or es_supervisor() or c.sede = sede_actual())
  ));

drop policy if exists "socios_totales_select" on socios_totales;
create policy "socios_totales_select" on socios_totales for select
  using (es_director() or es_supervisor() or sede = sede_actual());
