import { useEffect, useState } from "react";
import { T, FUENTE, btnVerde, btnOut } from "../estilos.jsx";
import { IconoCheckCirculo, IconoX } from "./iconos.jsx";
import { supabase } from "../supabase.js";

const DIAS_ESPERA = 10;
const CANTIDAD_PREGUNTAS = 10;

export const BANCO_PREGUNTAS = [
  {
    prompt: "En Sleepers, ¿qué significa que un socio aparezca en rojo en el semáforo de alarma?",
    opciones: [
      "Que el socio canceló su membresía",
      "Que pasaron 6 días o más sin ningún contacto ni respuesta",
      "Que el socio tiene riesgo alto según el motivo que dio",
      "Que falta cargar su DNI",
    ],
    correcta: 1,
    explicacion: "Rojo es específicamente por tiempo sin contacto (6+ días). En cuanto hay cualquier interacción (mensaje, motivo, comentario, seguimiento programado) pasa a amarillo automáticamente.",
  },
  {
    prompt: "Si cargás el motivo \"Mudanza\" para un socio de Sleepers, ¿qué pasa con el campo Riesgo?",
    opciones: [
      "Queda vacío hasta que alguien lo complete a mano",
      "Se calcula solo como Alto y queda bloqueado para editar",
      "Hay que elegirlo manualmente, el sistema solo sugiere",
      "Se pone en Bajo automáticamente",
    ],
    correcta: 1,
    explicacion: "Falta de tiempo, Problemas personales y Mudanza mapean a Riesgo Alto automáticamente, y el campo se bloquea mientras haya un motivo cargado.",
  },
  {
    prompt: "¿Quién puede eliminar un socio (tanto en Sleepers como en Contratos a Vencer)?",
    opciones: [
      "Cualquier rol, desde el listado normal",
      "Gerente y Director, desde Administrador",
      "Exclusivamente Director, desde Administrador",
      "Los roles de servicio (Gerente de Servicio, Coordinador, Referente)",
    ],
    correcta: 2,
    explicacion: "Eliminar está bloqueado a nivel de base de datos para todos menos Director. Ni siquiera el Gerente puede hacerlo, aunque sí puede corregir datos de identidad.",
  },
  {
    prompt: "¿Cuál de estas tres planillas define el universo de socios de Contratos a Vencer ese mes?",
    opciones: ["NPS y comentarios", "Accesos", "Contratos a vencer", "Las tres tienen el mismo peso"],
    correcta: 2,
    explicacion: "Contratos a vencer define la base de DNI del mes. Accesos y NPS solo aportan datos a esos mismos DNI — lo que no matchea se descarta.",
  },
  {
    prompt: "Un socio tiene alta asistencia (últimos 2 meses) pero es Detractor en el NPS. ¿Cómo se clasifica?",
    opciones: [
      "Fidelizado, porque viene mucho",
      "Riesgo de baja, con nota especial de posible boca en boca negativo",
      "En seguimiento, score 8",
      "Datos incompletos",
    ],
    correcta: 1,
    explicacion: "Es uno de los dos casos \"quiebre\" de la matriz: viene mucho pero no está conforme, score 5, con prioridad de contacto directo porque puede generar mala opinión entre otros socios.",
  },
  {
    prompt: "¿Qué diferencia hay entre la ventana de tiempo del NPS y la de la Asistencia en Contratos a Vencer?",
    opciones: [
      "Ambas son de los últimos 2 meses",
      "La asistencia es de los últimos 2 meses; el NPS es histórico (última respuesta, sin importar hace cuánto)",
      "El NPS es de los últimos 2 meses; la asistencia es histórica",
      "Ambas son históricas",
    ],
    correcta: 1,
    explicacion: "Es una distinción importante: la asistencia refleja un período acotado (2 meses), mientras que el NPS puede ser una respuesta de hace mucho tiempo.",
  },
  {
    prompt: "¿Los mensajes sugeridos en Contratos a Vencer mencionan la fecha de vencimiento del plan?",
    opciones: [
      "Sí, siempre aclaran en cuántos días vence",
      "No, están enfocados en asistencia y experiencia del socio, no en el vencimiento",
      "Solo en los casos críticos",
      "Solo por WhatsApp, no por email",
    ],
    correcta: 1,
    explicacion: "Es una decisión intencional: el mensaje no habla de renovación ni vencimiento, se centra en cómo viene entrenando el socio y su experiencia.",
  },
  {
    prompt: "¿Cuál es la diferencia entre el mensaje que se manda por WhatsApp y el que se manda por Email?",
    opciones: [
      "Son completamente distintos, sin relación entre sí",
      "El email es más largo que el de WhatsApp",
      "El de WhatsApp lleva firma completa; el de email sale sin la firma final porque el cliente de correo ya agrega la suya",
      "El de WhatsApp no incluye el nombre del socio",
    ],
    correcta: 2,
    explicacion: "Mismo cuerpo de mensaje en ambos casos, pero el email se corta antes del cierre de firma para no duplicar la firma que ya pone el correo.",
  },
  {
    prompt: "Un socio de Contratos a Vencer no respondió nunca la encuesta de NPS, pero tiene 32 asistencias en los últimos 2 meses. ¿Cómo queda clasificado?",
    opciones: [
      "Datos incompletos, porque falta el NPS",
      "Fidelizado, clasificado solo por asistencia (29 o más)",
      "Riesgo de baja automático por falta de encuesta",
      "No se puede cargar sin NPS",
    ],
    correcta: 1,
    explicacion: "Cuando no hay NPS, se usa la regla de respaldo por asistencia: 1-9 Riesgo de baja, 10-28 En seguimiento, 29+ Fidelizado. Con 32 asistencias entra en Fidelizado.",
  },
  {
    prompt: "¿Quién puede ver la solapa Administrador y qué alcance tiene cada uno?",
    opciones: [
      "Solo Director, y ve todas las sedes",
      "Director y Gerente; cada uno corrige solo los datos de su propia sede, salvo Director que ve todas",
      "Todos los roles, cada uno con su propia sede",
      "Solo los roles de servicio (Gerente de Servicio, Coordinador, Referente)",
    ],
    correcta: 1,
    explicacion: "Administrador lo ven Director y Gerente. Gerente corrige identidad de su sede pero no puede eliminar ni ver otras sedes; Director ve y corrige todo, y es el único que elimina.",
  },
  {
    prompt: "¿Qué formatos de planilla acepta la carga de socios en Sleepers?",
    opciones: ["Solo Excel", "Excel y CSV", "Excel, CSV y JSON", "Solo JSON"],
    correcta: 2,
    explicacion: "Sleepers reconoce las columnas esperadas sin importar si el archivo es .xlsx, .csv o .json.",
  },
  {
    prompt: "Si un socio de Sleepers pasan 30 días desde que se cargó y no vuelve a aparecer en una carga más reciente, ¿qué hace el sistema?",
    opciones: [
      "Nada, hay que cerrarlo a mano",
      "Lo elimina automáticamente",
      "Lo pasa solo a Cerrado (Recuperado) y deja un comentario automático explicando por qué",
      "Le baja el riesgo a Bajo",
    ],
    correcta: 2,
    explicacion: "Es una regla automática: si no volvió a aparecer como sleeper en 30 días, se asume que volvió a entrenar y se cierra solo, dejando el rastro en los comentarios.",
  },
  {
    prompt: "¿Qué es el campo \"Resultado de la gestión\" en Contratos a Vencer, y en qué se diferencia del Estado?",
    opciones: [
      "Es lo mismo que el Estado, con otro nombre",
      "Es el resultado concreto de la gestión (Renueva / No Renueva / Lo está pensado), separado del Estado que marca el flujo de trabajo",
      "Solo lo puede cargar Dirección",
      "Reemplaza a la clasificación 1 a 10",
    ],
    correcta: 1,
    explicacion: "Estado (Abierto/Seguimiento/Cerrado) es el flujo de trabajo. Resultado de la gestión es el desenlace real después de contactar al socio, y se completa aparte.",
  },
  {
    prompt: "Si a un socio le faltan datos de asistencia y NPS, y su contrato vence en menos de 120 días, ¿cómo queda clasificado?",
    opciones: [
      "Datos incompletos, sin más acción",
      "Riesgo de baja, por falta de datos (no por mal puntaje)",
      "Fidelizado, por defecto",
      "Se descarta de la planilla",
    ],
    correcta: 1,
    explicacion: "Estar tan cerca del vencimiento sin esos datos es en sí una señal de riesgo, así que se marca Riesgo de baja con una nota aclarando que es por falta de información.",
  },
  {
    prompt: "¿Quién puede ver la solapa Panorama?",
    opciones: ["Todos los roles", "Solo Gerente", "Director y Supervisor", "Solo los roles de servicio"],
    correcta: 2,
    explicacion: "Panorama es el resumen ejecutivo sin filtros: lo ve Dirección y el rol Supervisor (de solo lectura).",
  },
  {
    prompt: "Según el protocolo, si un socio pide compensar meses por mudanza, ¿qué se le pide siempre?",
    opciones: ["Nada, se compensa directo", "El certificado de cambio de domicilio", "Que renueve por 12 meses", "Una nota firmada por el gerente"],
    correcta: 1,
    explicacion: "Tanto para mudanza como para enfermedad, siempre se pide el certificado correspondiente antes de compensar los meses.",
  },
  {
    prompt: "Si el motivo es \"Problemas con el servicio\" por falta de máquinas o saturación, ¿qué se intenta hacer?",
    opciones: [
      "Ofrecer un descuento",
      "Presentarle un profesor para que le genere una variante en su plan de entrenamiento",
      "Derivarlo directo a Dirección",
      "Nada, se espera a que se acostumbre",
    ],
    correcta: 1,
    explicacion: "Se busca resolverlo con una intervención humana: el profesor arma una variante de rutina para esquivar el problema puntual.",
  },
  {
    prompt: "Si el motivo de salud que da un socio es un tema de articulaciones, ¿qué se le suele ofrecer?",
    opciones: ["Pileta", "Clases grupales de alta intensidad", "Suspender la actividad", "Nada en particular"],
    correcta: 0,
    explicacion: "Para temas de articulaciones se ofrece pileta como alternativa de bajo impacto, dentro del protocolo de adaptar el plan a la necesidad del socio.",
  },
  {
    prompt: "¿Cada cuánto se puede volver a rendir esta evaluación?",
    opciones: ["Una vez por día", "Cada 10 días", "Una sola vez por siempre", "No hay límite"],
    correcta: 1,
    explicacion: "Cada intento queda registrado con tu usuario, y hay que esperar 10 días desde el último intento para poder volver a rendirla.",
  },
  {
    prompt: "¿Qué pasa con las tarjetas de Contratos a Vencer cuando enviás un WhatsApp o Email?",
    opciones: [
      "Se reordenan según la fecha de envío",
      "Se mantienen en su mismo lugar; solo se mueven si cambiás el Estado",
      "Desaparecen de la lista",
      "Pasan automáticamente a Cerrado",
    ],
    correcta: 1,
    explicacion: "El orden de las tarjetas es estable — no cambian de lugar al enviar un mensaje, solo se mueven (por ejemplo, salen del filtro \"Abiertos\") si cambiás el Estado.",
  },
];

function elegirPreguntas() {
  const copia = [...BANCO_PREGUNTAS];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia.slice(0, Math.min(CANTIDAD_PREGUNTAS, copia.length));
}

export default function Evaluacion({ perfil, onCerrar }) {
  const [cargando, setCargando] = useState(true);
  const [bloqueado, setBloqueado] = useState(null);
  const [preguntas, setPreguntas] = useState([]);
  const [indice, setIndice] = useState(0);
  const [elegida, setElegida] = useState(null);
  const [verificada, setVerificada] = useState(false);
  const [respuestas, setRespuestas] = useState([]);
  const [terminado, setTerminado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      if (!perfil?.id) { setCargando(false); return; }
      const { data, error } = await supabase
        .from("evaluaciones_resultados")
        .select("creado_en")
        .eq("usuario_id", perfil.id)
        .order("creado_en", { ascending: false })
        .limit(1);
      if (!error && data && data.length) {
        const ultima = new Date(data[0].creado_en);
        const dias = (Date.now() - ultima.getTime()) / 86400000;
        if (dias < DIAS_ESPERA) {
          setBloqueado({ diasFaltan: Math.ceil(DIAS_ESPERA - dias), fechaUltima: ultima });
        }
      }
      setPreguntas(elegirPreguntas());
      setCargando(false);
    })();
  }, [perfil?.id]);

  const p = preguntas[indice];

  function verificar() {
    if (elegida === null) return;
    setVerificada(true);
  }
  async function siguiente() {
    const nuevasRespuestas = [...respuestas, elegida === p.correcta];
    setRespuestas(nuevasRespuestas);
    if (indice + 1 >= preguntas.length) {
      setTerminado(true);
      setGuardando(true);
      const correctas = nuevasRespuestas.filter(Boolean).length;
      try {
        await supabase.from("evaluaciones_resultados").insert({
          usuario_id: perfil.id, usuario_nombre: perfil.nombre, rol: perfil.rol, sede: perfil.sede,
          puntaje: correctas, total_preguntas: preguntas.length,
        });
      } catch { /* si falla el guardado, igual mostramos el resultado */ }
      setGuardando(false);
    } else {
      setIndice((i) => i + 1);
      setElegida(null);
      setVerificada(false);
    }
  }

  if (cargando) return null;

  if (bloqueado) {
    return (
      <div style={box}>
        <p style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>Ya rendiste esta evaluación hace poco</p>
        <p style={{ fontSize: 13, color: T.inkSoft, marginBottom: 14 }}>
          Última vez: {bloqueado.fechaUltima.toLocaleDateString("es-AR")}. Podés volver a intentarlo en {bloqueado.diasFaltan} día{bloqueado.diasFaltan === 1 ? "" : "s"} más.
        </p>
        {onCerrar && <button style={btnOut} onClick={onCerrar}>Cerrar</button>}
      </div>
    );
  }

  if (terminado) {
    const correctas = respuestas.filter(Boolean).length;
    return (
      <div style={box}>
        <p style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>Resultado</p>
        <p style={{ fontSize: 28, fontWeight: 800, color: correctas >= 7 ? T.green : correctas >= 5 ? T.amber : T.red }}>
          {correctas} / {preguntas.length}
        </p>
        <p style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 8 }}>
          {guardando ? "Guardando resultado..." : `Quedó registrado a tu nombre. Podés volver a intentarlo en ${DIAS_ESPERA} días.`}
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          {onCerrar && <button style={btnOut} onClick={onCerrar}>Cerrar</button>}
        </div>
      </div>
    );
  }

  if (!p) return null;

  return (
    <div style={box}>
      <p style={{ fontSize: 11, color: T.inkSoft, marginBottom: 10 }}>Pregunta {indice + 1} de {preguntas.length}</p>
      <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>{p.prompt}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        {p.opciones.map((op, i) => {
          const esCorrecta = i === p.correcta;
          const esElegida = i === elegida;
          let borde = T.line, fondo = "transparent", color = T.ink;
          if (verificada) {
            if (esCorrecta) { borde = T.green; fondo = T.greenSoft; color = T.green; }
            else if (esElegida) { borde = T.red; fondo = T.redSoft; color = T.red; }
          } else if (esElegida) { borde = T.marca; }
          return (
            <button key={i} disabled={verificada} onClick={() => setElegida(i)}
              style={{
                textAlign: "left", padding: "10px 14px", borderRadius: 11, border: "1px solid " + borde,
                background: fondo, color, cursor: verificada ? "default" : "pointer", fontSize: 13, fontFamily: FUENTE,
                display: "flex", alignItems: "center", gap: 8,
              }}>
              {verificada && esCorrecta && <IconoCheckCirculo tam={15} />}
              {verificada && esElegida && !esCorrecta && <IconoX tam={15} />}
              {op}
            </button>
          );
        })}
      </div>
      {verificada && (
        <p style={{ fontSize: 12, color: T.inkSoft, background: T.surface2, borderRadius: 11, padding: "10px 12px", marginBottom: 14 }}>{p.explicacion}</p>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        {!verificada
          ? <button style={btnVerde} onClick={verificar} disabled={elegida === null}>Verificar</button>
          : <button style={btnVerde} onClick={siguiente}>{indice + 1 >= preguntas.length ? "Ver resultado" : "Siguiente"}</button>}
        {onCerrar && <button style={btnOut} onClick={onCerrar}>Cerrar</button>}
      </div>
    </div>
  );
}

const box = { background: T.surface, border: "1px solid " + T.line, borderRadius: 16, padding: 20, marginBottom: 22 };
