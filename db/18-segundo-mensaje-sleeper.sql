-- ============================================================
--  SEGUNDO MENSAJE DE SLEEPERS (seguimiento sin respuesta)
--  Correr DESPUES de 17-plantillas-mensajes.sql.
--
--  Agrega un segundo mensaje de seguimiento, para cuando el
--  socio no respondio el primero. Queda como plantilla aparte,
--  editable desde Administrador igual que el resto.
-- ============================================================

alter table casos add column mensaje_2 text;
alter table casos add column fecha_envio_mensaje_2 date;

insert into mensajes_plantillas (tema, clave, etiqueta, cuerpo) values
('sleepers', 'seguimiento', 'Segundo mensaje (sin respuesta al primero)', 'Hola {nombre},

Hace unos días te escribí para saber cómo estabas y por qué hace un tiempo que no te vemos entrenando, pero todavía no tuve novedades tuyas.

¿Llegaste a ver el mensaje anterior? Si se te pasó o quedó pendiente, no hay drama — contame con tranquilidad si fue por falta de tiempo, un tema de salud, algo personal, o si surgió alguna otra situación de la que todavía no charlamos.

Me interesa mucho saber cómo estás y ver si hay algo en lo que te pueda ayudar.

Te agradezco mucho el tiempo para responder este mensaje.');
