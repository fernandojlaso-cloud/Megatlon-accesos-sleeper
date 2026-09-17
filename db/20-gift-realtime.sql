-- ============================================================
--  TIEMPO REAL PARA GIFT
--  Correr DESPUES de 19-gift.sql.
--
--  A las tablas de Gift les faltaba sumarse a la publicacion de
--  tiempo real de Supabase (a diferencia de casos y
--  seguimiento_contratos, que ya la tenian). Por eso los cambios
--  de estado (ej. "Vino a probar") no se reflejaban solos en la
--  pantalla y hacia falta recargar la pagina para verlos.
-- ============================================================

alter publication supabase_realtime add table gift;
alter publication supabase_realtime add table gift_comentarios;
