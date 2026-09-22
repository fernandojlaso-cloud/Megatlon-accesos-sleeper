-- Nuevo sistema de riesgo en Sleepers: ya no se calcula por Motivo, se calcula
-- segun el mensaje enviado (Bajo con el 1er mensaje, Alto con el 2do). Se elimina
-- el nivel "Medio". Este script migra los casos ABIERTOS que quedaron en Medio
-- con el sistema viejo: pasan a Bajo si tienen 1er mensaje enviado, a Alto si
-- ademas tienen 2do mensaje enviado.

update public.casos
set riesgo = 'Alto', fecha_motivo_riesgo = current_date
where estado = 'Abierto' and riesgo = 'Medio' and fecha_envio_mensaje_2 is not null;

update public.casos
set riesgo = 'Bajo', fecha_motivo_riesgo = current_date
where estado = 'Abierto' and riesgo = 'Medio' and fecha_envio_mensaje_2 is null;

-- Los casos CERRADOS con riesgo Medio quedan como estaban (son historial, no se tocan).
-- La restriccion de la columna (riesgo in ('Alto','Medio','Bajo')) se deja como esta
-- a proposito, para no romper si quedara algun caso cerrado historico en 'Medio';
-- la app ya no ofrece 'Medio' como opcion, asi que no se van a crear casos nuevos con ese valor.
