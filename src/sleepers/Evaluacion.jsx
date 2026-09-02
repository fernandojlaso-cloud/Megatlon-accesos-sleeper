import { useState } from "react";
import { T, FUENTE, btnVerde, btnOut } from "../estilos.jsx";
import { IconoCheckCirculo, IconoX } from "./iconos.jsx";

export const PREGUNTAS = [
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
];

export default function Evaluacion({ onCerrar }) {
  const [indice, setIndice] = useState(0);
  const [elegida, setElegida] = useState(null);
  const [verificada, setVerificada] = useState(false);
  const [respuestas, setRespuestas] = useState([]);
  const [terminado, setTerminado] = useState(false);

  const p = PREGUNTAS[indice];

  function verificar() {
    if (elegida === null) return;
    setVerificada(true);
  }
  function siguiente() {
    setRespuestas((prev) => [...prev, elegida === p.correcta]);
    if (indice + 1 >= PREGUNTAS.length) {
      setTerminado(true);
    } else {
      setIndice((i) => i + 1);
      setElegida(null);
      setVerificada(false);
    }
  }
  function reiniciar() {
    setIndice(0); setElegida(null); setVerificada(false); setRespuestas([]); setTerminado(false);
  }

  if (terminado) {
    const correctas = respuestas.filter(Boolean).length;
    return (
      <div style={box}>
        <p style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>Resultado</p>
        <p style={{ fontSize: 28, fontWeight: 800, color: correctas >= 7 ? T.green : correctas >= 5 ? T.amber : T.red }}>
          {correctas} / {PREGUNTAS.length}
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button style={btnVerde} onClick={reiniciar}>Repetir evaluación</button>
          {onCerrar && <button style={btnOut} onClick={onCerrar}>Cerrar</button>}
        </div>
      </div>
    );
  }

  return (
    <div style={box}>
      <p style={{ fontSize: 11, color: T.inkSoft, marginBottom: 10 }}>Pregunta {indice + 1} de {PREGUNTAS.length}</p>
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
          : <button style={btnVerde} onClick={siguiente}>{indice + 1 >= PREGUNTAS.length ? "Ver resultado" : "Siguiente"}</button>}
        {onCerrar && <button style={btnOut} onClick={onCerrar}>Cerrar</button>}
      </div>
    </div>
  );
}

const box = { background: T.surface, border: "1px solid " + T.line, borderRadius: 16, padding: 20, marginBottom: 22 };
