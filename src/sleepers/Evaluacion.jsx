import { useEffect, useState } from "react";
import { T, FUENTE, btnVerde, btnOut } from "../estilos.jsx";
import { IconoCheckCirculo, IconoX } from "./iconos.jsx";
import { supabase } from "../supabase.js";
import { obtenerPreguntasActivas } from "./datosPreguntas.js";

const DIAS_ESPERA = 10;
const CANTIDAD_PREGUNTAS = 10;

function elegirPreguntas(pool) {
  const copia = [...pool];
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
      try {
        const pool = await obtenerPreguntasActivas();
        setPreguntas(elegirPreguntas(pool));
      } catch {
        setPreguntas([]);
      }
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

  if (!p) {
    return (
      <div style={box}>
        <p style={{ fontSize: 13, color: T.inkSoft }}>No hay preguntas cargadas todavía en el banco de evaluación.</p>
        {onCerrar && <button style={{ ...btnOut, marginTop: 12 }} onClick={onCerrar}>Cerrar</button>}
      </div>
    );
  }

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
