-- ============================================================
--  ROLES DE SERVICIO
--  Correr DESPUES de 05-actividad-sleepers.sql.
--
--  Que hace:
--   - Agrega los roles Gerente de Servicio, Coordinador de
--     Servicio y Referente de Servicio (mismo nivel de permiso
--     que tenia "vendedor": seguimiento en su sede, solo ven la
--     solapa Sleepers).
--   - Postgres no permite borrar valores de un enum, asi que
--     "vendedor", "profesor" y "control_acceso" quedan definidos
--     pero sin uso: la app ya no los muestra ni los deja elegir,
--     y como confirmaste que nadie los tiene asignados, no hace
--     falta migrar ningun dato.
--   - El Gerente ahora puede corregir datos de identidad
--     (nombre, DNI, email, telefono, sede) igual que Direccion,
--     pero sigue sin poder eliminar un socio.
--   - El Gerente, al aprobar accesos, solo puede asignar los
--     roles de su equipo (los 3 de servicio) — no puede crear
--     otro Gerente ni Direccion.
-- ============================================================

-- ---------- 1. Nuevos valores del rol ----------

alter type rol_usuario add value if not exists 'gerente_servicio';
alter type rol_usuario add value if not exists 'coordinador_servicio';
alter type rol_usuario add value if not exists 'referente_servicio';
