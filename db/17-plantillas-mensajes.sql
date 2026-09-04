-- ============================================================
--  PLANTILLAS DE MENSAJES (editable)
--  Correr DESPUES de 16-banco-preguntas.sql.
--
--  Antes los mensajes que se arman para Sleepers y para
--  Contratos a Vencer estaban fijos en el codigo. Ahora viven
--  aca, para poder editarlos en bloque sin depender de una
--  subida de codigo. Placeholders disponibles dentro del texto:
--  {nombre}, {gerente}, {cargo}, {sede} — se reemplazan solos.
--
--  La firma final (nombre / cargo | Megatlon sede) se sigue
--  agregando aparte, despues del cuerpo, igual que hasta ahora.
--  Para que el email siga saliendo sin firma final, el cuerpo de
--  Sleepers tiene que terminar con la frase "Te agradezco mucho
--  el tiempo para responder este mensaje." y el de Contratos a
--  Vencer con "¡Gracias!" — son los textos que usa el sistema
--  para saber donde cortar antes de la firma.
-- ============================================================

create table mensajes_plantillas (
  id               uuid primary key default gen_random_uuid(),
  tema             text not null check (tema in ('sleepers', 'contratos')),
  clave            text not null,
  etiqueta         text not null,
  cuerpo           text not null,
  activa           boolean not null default true,
  actualizado_por  uuid references auth.users(id),
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  unique (tema, clave)
);

alter table mensajes_plantillas enable row level security;

-- Cualquier usuario logueado puede leer las plantillas activas (para armar los mensajes).
create policy "mensajes_plantillas_select" on mensajes_plantillas for select
  using (auth.uid() is not null);

-- Solo Direccion administra las plantillas (aplican a todas las sedes por igual).
create policy "mensajes_plantillas_insert" on mensajes_plantillas for insert
  with check (es_director());
create policy "mensajes_plantillas_update" on mensajes_plantillas for update
  using (es_director());
create policy "mensajes_plantillas_delete" on mensajes_plantillas for delete
  using (es_director());

-- ---------- Carga inicial ----------

insert into mensajes_plantillas (tema, clave, etiqueta, cuerpo) values

('sleepers', 'general', 'Mensaje general de sleepers', 'Hola {nombre},

Espero que estés muy bien.

Soy {gerente}, {cargo} de Megatlon {sede}.

Te escribo porque hace un tiempo que no te vemos entrenando y quería contactarme personalmente para saber cómo estás.

Más allá del gimnasio, entendemos que cada persona atraviesa momentos, cambios de rutina, temas laborales, familiares o de salud que pueden hacer difícil mantener la actividad física. Por eso me gustaría conocer tu situación y ver si hay algo en lo que podamos ayudarte.

Si te parece, contame cuál es el principal motivo por el que dejaste de asistir:

• Falta de tiempo.
• Lesión o tema de salud.
• Situaciones personales o familiares.
• Cambio de domicilio o lugar de trabajo.
• Algún aspecto de tu experiencia en el gimnasio que no haya cumplido tus expectativas.
• Otro motivo.

No se trata de una venta ni de una campaña comercial. Simplemente queremos acompañarte mejor.

Te agradezco mucho el tiempo para responder este mensaje.'),

('contratos', 'Baja|Detractor', 'Riesgo de baja — Baja asistencia + Detractor (score 1)', 'Hola {nombre},

Hace unos días noté que no estás viniendo seguido y leí tu comentario sobre tu experiencia. Me importa mucho escucharte y saber qué podemos resolver.

¿Tenés 5 minutos hoy para que lo charlemos por teléfono o preferís que lo conversemos por acá? Quiero asegurarme de darte una solución.

¡Gracias!'),

('contratos', 'Baja|Pasivo', 'Riesgo de baja — Baja asistencia + Pasivo (score 2)', 'Hola {nombre},

¡Cómo estás! Noté que bajaste la frecuencia de entrenamiento estas semanas. Quería saber si hay algo en lo que te pueda ayudar o si algo te está complicando venir.

Si querés, coordinamos un re-onboarding para armar una rutina nueva y retomar con todo. ¡Avisame!

¡Gracias!'),

('contratos', 'Media|Detractor', 'En seguimiento — Media asistencia + Detractor (score 3)', 'Hola {nombre},

¿Cómo va? Estuve viendo tus comentarios y noté que hay cosas de tu experiencia en la sede que no te cerraron del todo. Me gustaría entender bien qué podemos mejorar.

¿Tendrás unos minutos esta semana para charlarlo brevemente?

¡Gracias!'),

('contratos', 'Alta|Detractor', 'Caso especial — Alta asistencia + Detractor (score 5)', 'Hola {nombre},

¡Te veo entrenando un montón y te agradezco un montón la constancia! Por otro lado, vi que tu devolución no fue del todo positiva y quiero entender por qué. Viniendo tanto, tu experiencia tiene que ser impecable.

¿Charlamos un minutito la próxima vez que pases por recepción?

¡Gracias!'),

('contratos', 'Media|Pasivo', 'En seguimiento — Media asistencia + Pasivo (score 5)', 'Hola {nombre},

¡Hola! Quería escribirte para saber cómo venís con tus entrenamientos y si hay algo en lo que te podamos dar una mano para que disfrutes más de la sede.

¿Cómo viene tu semana?

¡Gracias!'),

('contratos', 'Baja|Promotor', 'Caso especial — Baja asistencia + Promotor (score 4)', 'Hola {nombre},

¡Sabemos que nos tenés súper buena onda y eso nos encanta! Pero noté que hace un tiempo no te cruzamos por el club.

¿Te armamos una rutina corta o te sumamos a alguna clase para volver con ganas esta semana? Contame qué día te queda cómodo.

¡Gracias!'),

('contratos', 'Media|Promotor', 'Fidelizado — Media asistencia + Promotor (score 7)', 'Hola {nombre},

¡Qué bueno tenerte siempre firme como socio! Quería saber cómo venís entrenando y si conocés nuestra grilla actual de clases o si precisás renovar tu plan de entrenamiento.

¡Estamos para lo que necesites!

¡Gracias!'),

('contratos', 'Alta|Pasivo', 'Fidelizado — Alta asistencia + Pasivo (score 8)', 'Hola {nombre},

Te vemos siempre entrenando por acá y nos encanta tu constancia — ¡gracias por elegirnos! Te escribo simplemente para saber cómo la estás pasando y si hay algo que podamos sumar para mejorar tu día a día en el club.

¡Gracias!'),

('contratos', 'Alta|Promotor', 'Fidelizado — Alta asistencia + Promotor (score 10)', 'Hola {nombre},

¡Se nota tu compromiso viniendo tan seguido, gracias por la buena energía de siempre! Queríamos saludarte y recordarte que estamos para lo que necesites.

Ah, y si tenés algún amigo o familiar que quiera sumarse a entrenar, avisame: tenemos un beneficio especial para vos y 1 mes bonificado para él.

¡Gracias!');
