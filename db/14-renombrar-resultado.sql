-- ============================================================
--  RENOMBRAR VALORES DE RESULTADO DE GESTION
--  Correr DESPUES de 13-resultado-gestion.sql.
--
--  Renovó -> Renueva, No renovó -> No Renueva,
--  Lo está pensando -> Lo está pensado.
-- ============================================================

alter table seguimiento_contratos drop constraint if exists seguimiento_contratos_resultado_gestion_check;

update seguimiento_contratos set resultado_gestion = 'Renueva' where resultado_gestion = 'Renovó';
update seguimiento_contratos set resultado_gestion = 'No Renueva' where resultado_gestion = 'No renovó';
update seguimiento_contratos set resultado_gestion = 'Lo está pensado' where resultado_gestion = 'Lo está pensando';

alter table seguimiento_contratos add constraint seguimiento_contratos_resultado_gestion_check
  check (resultado_gestion in ('Renueva', 'No Renueva', 'Lo está pensado'));
