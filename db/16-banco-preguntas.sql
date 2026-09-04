-- ============================================================
--  BANCO DE PREGUNTAS DE LA EVALUACION (editable)
--  Correr DESPUES de 15-evaluaciones-resultados.sql.
--
--  Antes las preguntas estaban fijas en el codigo. Ahora viven
--  aca, para que se puedan agregar/editar/borrar sin depender
--  de una subida de codigo nueva. Se cargan las 20 preguntas
--  que ya existian, clasificadas por tema (Sleepers /
--  Contratos a Vencer).
-- ============================================================

create table evaluacion_preguntas (
  id            uuid primary key default gen_random_uuid(),
  tema          text not null check (tema in ('sleepers', 'contratos')),
  prompt        text not null,
  opciones      jsonb not null,
  correcta      integer not null,
  explicacion   text,
  activa        boolean not null default true,
  creado_por    uuid references auth.users(id),
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index evaluacion_preguntas_tema_idx on evaluacion_preguntas (tema, activa);

alter table evaluacion_preguntas enable row level security;

create policy "evaluacion_preguntas_select" on evaluacion_preguntas for select
  using (auth.uid() is not null);

create policy "evaluacion_preguntas_insert" on evaluacion_preguntas for insert
  with check (es_director());
create policy "evaluacion_preguntas_update" on evaluacion_preguntas for update
  using (es_director());
create policy "evaluacion_preguntas_delete" on evaluacion_preguntas for delete
  using (es_director());

insert into evaluacion_preguntas (tema, prompt, opciones, correcta, explicacion) values
  ('sleepers', 'En Sleepers, ¿qué significa que un socio aparezca en rojo en el semáforo de alarma?', '["Que el socio canceló su membresía", "Que pasaron 6 días o más sin ningún contacto ni respuesta", "Que el socio tiene riesgo alto según el motivo que dio", "Que falta cargar su DNI"]'::jsonb, 1, 'Rojo es específicamente por tiempo sin contacto (6+ días). En cuanto hay cualquier interacción (mensaje, motivo, comentario, seguimiento programado) pasa a amarillo automáticamente.'),
  ('sleepers', 'Si cargás el motivo "Mudanza" para un socio de Sleepers, ¿qué pasa con el campo Riesgo?', '["Queda vacío hasta que alguien lo complete a mano", "Se calcula solo como Alto y queda bloqueado para editar", "Hay que elegirlo manualmente, el sistema solo sugiere", "Se pone en Bajo automáticamente"]'::jsonb, 1, 'Falta de tiempo, Problemas personales y Mudanza mapean a Riesgo Alto automáticamente, y el campo se bloquea mientras haya un motivo cargado.'),
  ('sleepers', '¿Quién puede eliminar un socio (tanto en Sleepers como en Contratos a Vencer)?', '["Cualquier rol, desde el listado normal", "Gerente y Director, desde Administrador", "Exclusivamente Director, desde Administrador", "Los roles de servicio (Gerente de Servicio, Coordinador, Referente)"]'::jsonb, 2, 'Eliminar está bloqueado a nivel de base de datos para todos menos Director. Ni siquiera el Gerente puede hacerlo, aunque sí puede corregir datos de identidad.'),
  ('contratos', '¿Cuál de estas tres planillas define el universo de socios de Contratos a Vencer ese mes?', '["NPS y comentarios", "Accesos", "Contratos a vencer", "Las tres tienen el mismo peso"]'::jsonb, 2, 'Contratos a vencer define la base de DNI del mes. Accesos y NPS solo aportan datos a esos mismos DNI — lo que no matchea se descarta.'),
  ('contratos', 'Un socio tiene alta asistencia (últimos 2 meses) pero es Detractor en el NPS. ¿Cómo se clasifica?', '["Fidelizado, porque viene mucho", "Riesgo de baja, con nota especial de posible boca en boca negativo", "En seguimiento, score 8", "Datos incompletos"]'::jsonb, 1, 'Es uno de los dos casos "quiebre" de la matriz: viene mucho pero no está conforme, score 5, con prioridad de contacto directo porque puede generar mala opinión entre otros socios.'),
  ('contratos', '¿Qué diferencia hay entre la ventana de tiempo del NPS y la de la Asistencia en Contratos a Vencer?', '["Ambas son de los últimos 2 meses", "La asistencia es de los últimos 2 meses; el NPS es histórico (última respuesta, sin importar hace cuánto)", "El NPS es de los últimos 2 meses; la asistencia es histórica", "Ambas son históricas"]'::jsonb, 1, 'Es una distinción importante: la asistencia refleja un período acotado (2 meses), mientras que el NPS puede ser una respuesta de hace mucho tiempo.'),
  ('contratos', '¿Los mensajes sugeridos en Contratos a Vencer mencionan la fecha de vencimiento del plan?', '["Sí, siempre aclaran en cuántos días vence", "No, están enfocados en asistencia y experiencia del socio, no en el vencimiento", "Solo en los casos críticos", "Solo por WhatsApp, no por email"]'::jsonb, 1, 'Es una decisión intencional: el mensaje no habla de renovación ni vencimiento, se centra en cómo viene entrenando el socio y su experiencia.'),
  ('contratos', '¿Cuál es la diferencia entre el mensaje que se manda por WhatsApp y el que se manda por Email?', '["Son completamente distintos, sin relación entre sí", "El email es más largo que el de WhatsApp", "El de WhatsApp lleva firma completa; el de email sale sin la firma final porque el cliente de correo ya agrega la suya", "El de WhatsApp no incluye el nombre del socio"]'::jsonb, 2, 'Mismo cuerpo de mensaje en ambos casos, pero el email se corta antes del cierre de firma para no duplicar la firma que ya pone el correo.'),
  ('contratos', 'Un socio de Contratos a Vencer no respondió nunca la encuesta de NPS, pero tiene 32 asistencias en los últimos 2 meses. ¿Cómo queda clasificado?', '["Datos incompletos, porque falta el NPS", "Fidelizado, clasificado solo por asistencia (29 o más)", "Riesgo de baja automático por falta de encuesta", "No se puede cargar sin NPS"]'::jsonb, 1, 'Cuando no hay NPS, se usa la regla de respaldo por asistencia: 1-9 Riesgo de baja, 10-28 En seguimiento, 29+ Fidelizado. Con 32 asistencias entra en Fidelizado.'),
  ('sleepers', '¿Quién puede ver la solapa Administrador y qué alcance tiene cada uno?', '["Solo Director, y ve todas las sedes", "Director y Gerente; cada uno corrige solo los datos de su propia sede, salvo Director que ve todas", "Todos los roles, cada uno con su propia sede", "Solo los roles de servicio (Gerente de Servicio, Coordinador, Referente)"]'::jsonb, 1, 'Administrador lo ven Director y Gerente. Gerente corrige identidad de su sede pero no puede eliminar ni ver otras sedes; Director ve y corrige todo, y es el único que elimina.'),
  ('sleepers', '¿Qué formatos de planilla acepta la carga de socios en Sleepers?', '["Solo Excel", "Excel y CSV", "Excel, CSV y JSON", "Solo JSON"]'::jsonb, 2, 'Sleepers reconoce las columnas esperadas sin importar si el archivo es .xlsx, .csv o .json.'),
  ('sleepers', 'Si un socio de Sleepers pasan 30 días desde que se cargó y no vuelve a aparecer en una carga más reciente, ¿qué hace el sistema?', '["Nada, hay que cerrarlo a mano", "Lo elimina automáticamente", "Lo pasa solo a Cerrado (Recuperado) y deja un comentario automático explicando por qué", "Le baja el riesgo a Bajo"]'::jsonb, 2, 'Es una regla automática: si no volvió a aparecer como sleeper en 30 días, se asume que volvió a entrenar y se cierra solo, dejando el rastro en los comentarios.'),
  ('contratos', '¿Qué es el campo "Resultado de la gestión" en Contratos a Vencer, y en qué se diferencia del Estado?', '["Es lo mismo que el Estado, con otro nombre", "Es el resultado concreto de la gestión (Renueva / No Renueva / Lo está pensado), separado del Estado que marca el flujo de trabajo", "Solo lo puede cargar Dirección", "Reemplaza a la clasificación 1 a 10"]'::jsonb, 1, 'Estado (Abierto/Seguimiento/Cerrado) es el flujo de trabajo. Resultado de la gestión es el desenlace real después de contactar al socio, y se completa aparte.'),
  ('contratos', 'Si a un socio le faltan datos de asistencia y NPS, y su contrato vence en menos de 120 días, ¿cómo queda clasificado?', '["Datos incompletos, sin más acción", "Riesgo de baja, por falta de datos (no por mal puntaje)", "Fidelizado, por defecto", "Se descarta de la planilla"]'::jsonb, 1, 'Estar tan cerca del vencimiento sin esos datos es en sí una señal de riesgo, así que se marca Riesgo de baja con una nota aclarando que es por falta de información.'),
  ('sleepers', '¿Quién puede ver la solapa Panorama?', '["Todos los roles", "Solo Gerente", "Director y Supervisor", "Solo los roles de servicio"]'::jsonb, 2, 'Panorama es el resumen ejecutivo sin filtros: lo ve Dirección y el rol Supervisor (de solo lectura).'),
  ('sleepers', 'Según el protocolo, si un socio pide compensar meses por mudanza, ¿qué se le pide siempre?', '["Nada, se compensa directo", "El certificado de cambio de domicilio", "Que renueve por 12 meses", "Una nota firmada por el gerente"]'::jsonb, 1, 'Tanto para mudanza como para enfermedad, siempre se pide el certificado correspondiente antes de compensar los meses.'),
  ('sleepers', 'Si el motivo es "Problemas con el servicio" por falta de máquinas o saturación, ¿qué se intenta hacer?', '["Ofrecer un descuento", "Presentarle un profesor para que le genere una variante en su plan de entrenamiento", "Derivarlo directo a Dirección", "Nada, se espera a que se acostumbre"]'::jsonb, 1, 'Se busca resolverlo con una intervención humana: el profesor arma una variante de rutina para esquivar el problema puntual.'),
  ('sleepers', 'Si el motivo de salud que da un socio es un tema de articulaciones, ¿qué se le suele ofrecer?', '["Pileta", "Clases grupales de alta intensidad", "Suspender la actividad", "Nada en particular"]'::jsonb, 0, 'Para temas de articulaciones se ofrece pileta como alternativa de bajo impacto, dentro del protocolo de adaptar el plan a la necesidad del socio.'),
  ('sleepers', '¿Cada cuánto se puede volver a rendir esta evaluación?', '["Una vez por día", "Cada 10 días", "Una sola vez por siempre", "No hay límite"]'::jsonb, 1, 'Cada intento queda registrado con tu usuario, y hay que esperar 10 días desde el último intento para poder volver a rendirla.'),
  ('contratos', '¿Qué pasa con las tarjetas de Contratos a Vencer cuando enviás un WhatsApp o Email?', '["Se reordenan según la fecha de envío", "Se mantienen en su mismo lugar; solo se mueven si cambiás el Estado", "Desaparecen de la lista", "Pasan automáticamente a Cerrado"]'::jsonb, 1, 'El orden de las tarjetas es estable — no cambian de lugar al enviar un mensaje, solo se mueven (por ejemplo, salen del filtro "Abiertos") si cambiás el Estado.');
