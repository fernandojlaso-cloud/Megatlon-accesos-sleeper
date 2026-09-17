-- ============================================================
--  MODULO GIFT (campaña de mes de regalo a ex-socios)
--  Correr DESPUES de 18-segundo-mensaje-sleeper.sql.
-- ============================================================

create table gift (
  id                        uuid primary key default gen_random_uuid(),
  nombre                    text not null,
  dni                       text,
  email                     text,
  telefono                  text,
  sede                      text not null,
  fecha_activacion_cupon    date,
  fecha_fin_cupon           date,
  fecha_carga               date not null default current_date,
  dia_hora_coordinado       text,
  vino_a_probar             text check (vino_a_probar in ('Si', 'No')),
  se_inscribio              text check (se_inscribio in ('Si', 'No')),
  estado                    text not null default 'Abierto' check (estado in ('Abierto', 'Cerrado')),
  mensaje_1                 text,
  fecha_envio_1             date,
  mensaje_1_confirmacion    text,
  fecha_envio_1_confirmacion date,
  mensaje_1_reenvio         text,
  fecha_envio_1_reenvio     date,
  mensaje_2                 text,
  fecha_envio_2             date,
  subido_por                text,
  cargo_subido_por          text,
  creado_por                uuid references auth.users(id),
  creado_en                 timestamptz not null default now()
);

create index gift_sede_idx on gift (sede);

create table gift_comentarios (
  id          uuid primary key default gen_random_uuid(),
  gift_id     uuid not null references gift(id) on delete cascade,
  texto       text not null,
  autor       text,
  cargo       text,
  creado_por  uuid references auth.users(id),
  creado_en   timestamptz not null default now()
);

create index gift_comentarios_gift_idx on gift_comentarios (gift_id);

alter table gift enable row level security;
alter table gift_comentarios enable row level security;

create policy "gift_select" on gift for select
  using (es_director() or rol_actual() = 'supervisor' or sede = sede_actual());

create policy "gift_insert" on gift for insert
  with check (es_director() or (rol_actual() in ('gerente', 'gerente_servicio', 'coordinador_servicio', 'referente_servicio') and sede = sede_actual()));

create policy "gift_update" on gift for update
  using (es_director() or (rol_actual() in ('gerente', 'gerente_servicio', 'coordinador_servicio', 'referente_servicio') and sede = sede_actual()));

create policy "gift_delete" on gift for delete
  using (es_director());

create policy "gift_comentarios_select" on gift_comentarios for select
  using (exists (select 1 from gift g where g.id = gift_comentarios.gift_id and (es_director() or rol_actual() = 'supervisor' or g.sede = sede_actual())));

create policy "gift_comentarios_insert" on gift_comentarios for insert
  with check (rol_actual() in ('director', 'gerente', 'gerente_servicio', 'coordinador_servicio', 'referente_servicio'));

-- Igual que en Sleepers: corregir nombre/DNI/email/telefono/sede es exclusivo
-- de Director o Gerente, aunque cualquier operativo pueda actualizar el resto
-- de los campos (coordinacion, mensajes, estado, etc).
create or replace function bloquear_edicion_identidad_gift()
returns trigger as $$
begin
  if (new.nombre is distinct from old.nombre or new.dni is distinct from old.dni or
      new.email is distinct from old.email or new.telefono is distinct from old.telefono or
      new.sede is distinct from old.sede) then
    if rol_actual() not in ('director', 'gerente') then
      raise exception 'No tenés permiso para editar los datos de identidad.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger gift_bloquear_identidad
  before update on gift
  for each row execute function bloquear_edicion_identidad_gift();

-- ---------- Extender las plantillas de mensajes y el banco de preguntas ----------

alter table mensajes_plantillas drop constraint if exists mensajes_plantillas_tema_check;
alter table mensajes_plantillas add constraint mensajes_plantillas_tema_check
  check (tema in ('sleepers', 'contratos', 'gift'));

alter table evaluacion_preguntas drop constraint if exists evaluacion_preguntas_tema_check;
alter table evaluacion_preguntas add constraint evaluacion_preguntas_tema_check
  check (tema in ('sleepers', 'contratos', 'gift'));

-- ---------- Plantillas de mensajes de Gift (las 4, editables desde Administrador) ----------

insert into mensajes_plantillas (tema, clave, etiqueta, cuerpo) values

('gift', 'inicial', '1. Mensaje inicial (luego de activar el cupón)', '¡Hola, {nombre}!

Soy {gerente}, {cargo} de Megatlon {sede}.

Vi que activaste el mes sin cargo y quería contactarte para coordinar tu primera visita.

Te voy a acompañar para que conozcas las instalaciones, la grilla de clases, los servicios disponibles y cómo utilizar la app de Megatlon.

También podemos presentarte a uno de nuestros profesores para que te ayude a organizar tu entrenamiento según tus objetivos.

¿Qué día y horario te quedaría cómodo para venir a entrenar?'),

('gift', 'confirmacion', '2. Confirmación (una vez coordinado día y hora)', '¡Buenísimo, {nombre}!

Nos vemos el {dia_hora} en Megatlon {sede}.

Cuando llegues, anunciate en recepción preguntando por {gerente}.

Recordá traer:
• Documento de identidad
• Ropa y calzado deportivo
• Botella de agua
• Toalla personal
• Celular (para acceder con el código QR y conocer el funcionamiento de la app)

Nos vemos pronto. Quedo atento ante cualquier cambio.'),

('gift', 'reenvio', '3. Reenvío (si no respondió el mensaje inicial)', '¡Hola, {nombre}! ¿Cómo estás?

Te escribo nuevamente porque vi que activaste el mes sin cargo en Megatlon {sede}.

Quería coordinar tu primera visita para acompañarte, mostrarte la sede y ayudarte a comenzar.

¿Qué día y horario te quedaría cómodo para venir a entrenar?

Saludos!'),

('gift', 'comercial', '4. Mensaje comercial (segundo mensaje)', 'Hola {nombre}, ¿cómo estás? Nuevamente te escribe {gerente}, {cargo} de Megatlon {sede}.

Te contacto porque activaste 1 mes sin cargo en Megatlon, pero vimos que aún no tuviste la posibilidad de acercarte a utilizarlo. ¡Y quiero que aproveches la oportunidad de conocer y disfrutar del entrenamiento en nuestras instalaciones!

Es por eso que vuelvo a escribirte: me encantaría que finalmente puedas venir a conocernos y disfrutar de entrenar con nosotros.

Contamos con una sala de musculación equipada con máquinas de última generación, múltiples opciones de entrenamiento y variedad de técnicas de gimnasia, spinning y pileta de natación. Estoy seguro de que vas a encontrar una propuesta que te guste y que vas a disfrutar de ser parte de la comunidad Megatlon.

ALGO IMPORTANTE: si decidís asociarte, elijas el plan que elijas, vamos a respetar los 30 días sin cargo que habías activado para conocer Megatlon.

Y AÚN HAY ALGO MÁS: tenemos un beneficio exclusivo para quienes activaron esta invitación, con un descuento especial en nuestros planes y opciones de financiación en cuotas sin interés, dependiendo del banco con el que operes.

Si te interesa venir a entrenar o conocer las opciones disponibles, respondeme simplemente "OK" y te contacto para contarte todos los beneficios.

Aguardo tu respuesta.
Saludos');

-- ---------- Preguntas de evaluacion de Gift ----------

insert into evaluacion_preguntas (tema, prompt, opciones, correcta, explicacion) values

('gift', '¿Qué campo del archivo de carga de Gift define la fecha de activación del mes sin cargo?', '["Fecha de carga", "Inicio", "Fin", "Fecha de coordinación"]'::jsonb, 1,
 'El archivo trae "Inicio" (activación del cupón) y "Fin" (vencimiento del mes sin cargo) — se cargan ambas fechas.'),

('gift', '¿Cuántos mensajes distintos tiene el flujo de Gift y cuál es cuál?', '["Uno solo, genérico", "Dos: bienvenida y despedida", "Cuatro: inicial, confirmación de día/hora, reenvío sin respuesta, y comercial", "Tres: apertura, seguimiento y cierre"]'::jsonb, 2,
 'Son cuatro plantillas distintas, seleccionables por tarjeta: el mensaje inicial, la confirmación una vez coordinado día y hora, el reenvío si no hubo respuesta, y el mensaje comercial (segundo mensaje).'),

('gift', 'En Gift, ¿cuándo pasa un caso a Cerrado?', '["Al enviar el primer mensaje", "Automáticamente al marcar Se inscribió: Sí o No", "Solo Dirección lo puede cerrar a mano", "Nunca se cierra"]'::jsonb, 1,
 'A diferencia de Sleepers, en Gift el cierre es automático: apenas se define Se inscribió (Sí o No), el caso pasa solo a Cerrado.'),

('gift', '¿Qué significa el campo "Vino a probar" en Gift?', '["Que ya se asoció", "Que efectivamente se acercó a la sede a usar el mes sin cargo", "Que respondió el primer mensaje", "Que coordinó día y hora"]'::jsonb, 1,
 'Es un campo aparte que registra si la persona efectivamente vino a probar el servicio, independiente de si después se inscribió o no.'),

('gift', '¿Quién puede corregir nombre, DNI, email, teléfono o sede de un caso de Gift?', '["Cualquier rol operativo", "Solo Dirección", "Dirección o Gerente, igual que en Sleepers y Contratos a Vencer", "Nadie, una vez cargado no se puede editar"]'::jsonb, 2,
 'Mismo criterio que en el resto del sistema: identidad la corrige Dirección o Gerente; eliminar sigue siendo exclusivo de Dirección.');
