-- ============================================================
--  MENSAJE EDITABLE POR SOCIO (Contratos a vencer)
--  Correr DESPUES de 10-seguimiento-contratos.sql.
--
--  Guarda el mensaje que se le manda a cada socio (arranca con
--  un texto sugerido segun su clasificacion, y se puede editar
--  a mano desde la tarjeta antes de enviarlo).
-- ============================================================

alter table seguimiento_contratos add column mensaje text;
alter table seguimiento_contratos add column fecha_envio_mensaje date;
