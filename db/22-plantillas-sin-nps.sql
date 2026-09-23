-- Hasta ahora, los socios de Contratos a Vencer SIN respuesta de NPS (la
-- mayoria de los casos) nunca usaban ninguna plantilla editable: el codigo
-- solo buscaba una plantilla para las 9 combinaciones Nivel|Segmento de NPS,
-- y sin segmento siempre caia al mensaje generico fijo del codigo. Se agregan
-- 3 plantillas nuevas, una por nivel de asistencia, para el caso sin NPS.
-- El codigo ya las busca como "contratos|<Nivel>|SinNPS".

insert into public.mensajes_plantillas (tema, clave, etiqueta, cuerpo, activa)
values
('contratos', 'Baja|SinNPS', 'Sin NPS — Baja asistencia', 'Hola {nombre},

Hace un tiempo que no te veo por el club y quería saber cómo estás y si hay algo en lo que te pueda ayudar.

¿Tenés unos minutos para charlarlo, o preferís que te llame?

¡Gracias!', true),

('contratos', 'Media|SinNPS', 'Sin NPS — Media asistencia', 'Hola {nombre},

Quería contactarte para ver cómo venís entrenando últimamente y si hay algo en lo que te pueda dar una mano.

¿Cómo viene tu semana?

¡Gracias!', true),

('contratos', 'Alta|SinNPS', 'Sin NPS — Alta asistencia', 'Hola {nombre},

Te veo entrenando seguido y quería agradecerte la constancia. Contame si hay algo en lo que te pueda ayudar o si estás pensando en renovar tu plan.

¡Gracias!', true)
on conflict do nothing;
