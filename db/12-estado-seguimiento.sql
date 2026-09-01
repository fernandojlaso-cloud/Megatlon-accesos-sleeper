-- ============================================================
--  ESTADO "SEGUIMIENTO" PARA CONTRATOS A VENCER
--  Correr DESPUES de 11-mensaje-contratos.sql.
--
--  Agrega un tercer estado intermedio entre Abierto y Cerrado:
--  "Seguimiento" (ya estamos en contacto con el socio, todavia
--  no se resolvio si renueva o se da de baja).
-- ============================================================

alter table seguimiento_contratos drop constraint if exists seguimiento_contratos_estado_check;
alter table seguimiento_contratos add constraint seguimiento_contratos_estado_check
  check (estado in ('Abierto', 'Seguimiento', 'Cerrado'));
