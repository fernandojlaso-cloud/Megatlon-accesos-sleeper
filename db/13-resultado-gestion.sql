-- ============================================================
--  RESULTADO DE LA GESTION (Contratos a vencer)
--  Correr DESPUES de 12-estado-seguimiento.sql.
--
--  Campo aparte del Estado (que es el flujo de trabajo:
--  Abierto/Seguimiento/Cerrado). Este es el RESULTADO concreto
--  de la gestion de servicio, para completar despues de
--  contactar al socio.
-- ============================================================

alter table seguimiento_contratos add column resultado_gestion text
  check (resultado_gestion in ('Renovó', 'No renovó', 'Lo está pensando'));
