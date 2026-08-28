-- ============================================================
--  ROL SUPERVISOR
--  Correr DESPUES de 07-roles-servicio-politicas.sql.
--
--  Que hace:
--   - Agrega el rol Supervisor: acceso de SOLO LECTURA a los
--     datos de todas las sedes (como Direccion para ver, pero
--     sin poder cargar, editar ni eliminar nada). Pensado para
--     alguien que solo necesita ver el panorama general, no
--     operar el dia a dia.
--   - Ver 09-supervisor-politicas.sql para las politicas.
-- ============================================================

alter type rol_usuario add value if not exists 'supervisor';
