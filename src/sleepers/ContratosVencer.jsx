import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { T, FUENTE, inp, lab, btnMarca, btnOut, btnVerde, Badge } from "../estilos.jsx";
import {
  useSeguimientoContratos, actualizarRegistro, agregarComentarioRegistro,
  parsearContratos, parsearAccesos, parsearNPS, combinarPlanillas, guardarSeguimientoMes,
  clasificar, construirMensajeContrato, mensajeContratoSinFirma,
} from "./datosContratos.js";
import {
  IconoSubir, IconoChat, IconoMail, IconoAlerta, IconoCheckCirculo, IconoX,
  IconoCarpeta, IconoFlechaAbajo, IconoReloj,
} from "./iconos.jsx";

const hoyStr = () => new Date().toISOString().slice(0, 10);
const fmt = (iso) => { if (!iso) return "—"; const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
const norm = (s) => (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
const diasEntre = (desde, hasta) => {
  if (!desde) return 0;
  const d1 = new Date(desde + "T00:00:00");
  const d2 = new Date((hasta || hoyStr()) + "T00:00:00");
  return Math.round((d2 - d1) / 86400000);
};
function waLink(telefono, msg) { return "https://wa.me/" + telefono + "?text=" + encodeURIComponent(msg); }
function mailLink(email, nombre, msg) {
  const asunto = `Queríamos saludarte desde Megatlon, ${(nombre || "").trim().split(" ")[0]}`;
  return "mailto:" + email + "?subject=" + encodeURIComponent(asunto) + "&body=" + encodeURIComponent(mensajeContratoSinFirma(msg));
}

const COLOR_SEGMENTO = { Detractor: "red", Pasivo: "amber", Promotor: "green" };
const COLOR_NIVEL = { Baja: "red", Media: "amber", Alta: "green" };
function colorScore(score) {
  if (score === null) return T.line;
  if (score <= 2) return T.red;
  if (score <= 5) return T.amber;
  return T.green;
}
function notaEspecial(nivel, segmento) {
  if (nivel === "Alta" && segmento === "Detractor") return "Viene seguido pero no está conforme — riesgo de boca en boca negativo. Prioridad de contacto directo.";
  if (nivel === "Baja" && segmento === "Promotor") return "Te valora pero no está usando el servicio — se recupera con reactivación (clases, recordatorios), no con más marketing.";
  return null;
}

/* ---------- lectura de planillas ---------- */
function leerArchivo(file) {
  return new Promise((resolve, reject) => {
    const ext = file.name.split(".").pop().toLowerCase();
    if (ext === "csv") {
      file.text().then((text) => {
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
        if (!lines.length) return resolve([]);
        const split = (line) => { const r = []; let cur = "", inQ = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; } else if (ch === "," && !inQ) { r.push(cur); cur = ""; } else cur += ch; } r.push(cur); return r.map((s) => s.trim()); };
        const headers = split(lines[0]);
        resolve(lines.slice(1).map((line) => { const vals = split(line); const obj = {}; headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; }); return obj; }));
      }).catch(reject);
    } else {
      file.arrayBuffer().then((buf) => {
        const wb = XLSX.read(buf, { type: "array", cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(sheet, { defval: "" }));
      }).catch(reject);
    }
  });
}

export default function ContratosVencer({ perfil, cargoFirma }) {
  const { registros: crudos, comentariosPorRegistro, recargarComentarios } = useSeguimientoContratos();
  const registros = useMemo(() => crudos.map((r) => {
    let clasif = clasificar(r);
    const dias = diasEntre(hoyStr(), r.fecha_fin_contrato);
    const faltaAccesos = r.asistencias_2m === null || r.asistencias_2m === undefined;
    const faltaNPS = r.nps_score === null || r.nps_score === undefined;
    // Entre 91 y 120 dias, si falta asistencia o NPS, no lo dejamos como
    // "incompleto": pasa a critico, porque estar tan cerca del vencimiento
    // sin esos datos es en si mismo una señal de riesgo.
    if (!clasif.completo && dias >= 91 && dias <= 120 && (faltaAccesos || faltaNPS)) {
      clasif = { ...clasif, score: 1, completo: true, forzadoPorFaltaDatos: true };
    }
    return { ...r, _clasif: clasif, _numComentarios: (comentariosPorRegistro[r.id] || []).length };
  }), [crudos, comentariosPorRegistro]);

  const cargoLabel = cargoFirma || {
    director: "Director", gerente: "Gerente",
    gerente_servicio: "Gerente de Servicio", coordinador_servicio: "Coordinador de Servicio", referente_servicio: "Referente de Servicio",
  }[perfil.rol] || "Gerente";
  const puedeCargar = ["director", "gerente", "gerente_servicio", "coordinador_servicio", "referente_servicio"].includes(perfil.rol);

  const [boAbierto, setBoAbierto] = useState(false);
  const [manualAbierto, setManualAbierto] = useState(false);
  const [leyendo, setLeyendo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [resultadoCarga, setResultadoCarga] = useState(null);
  const [pendContratos, setPendContratos] = useState(null); // {nombreArchivo, filas}
  const [pendAccesos, setPendAccesos] = useState(null);
  const [pendNPS, setPendNPS] = useState(null);
  const refContratos = useRef(null);
  const refAccesos = useRef(null);
  const refNPS = useRef(null);

  const [filtroSede, setFiltroSede] = useState("");
  const [filtroClasif, setFiltroClasif] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("Abierto");
  const [busqueda, setBusqueda] = useState("");
  const [filtroAsistDesde, setFiltroAsistDesde] = useState("");
  const [filtroAsistHasta, setFiltroAsistHasta] = useState("");
  const [filtroNpsDesde, setFiltroNpsDesde] = useState("");
  const [filtroNpsHasta, setFiltroNpsHasta] = useState("");
  const [modalComentarios, setModalComentarios] = useState(null);
  const [nuevoComentario, setNuevoComentario] = useState("");
  const [modalMensaje, setModalMensaje] = useState(null);
  const [textoMensaje, setTextoMensaje] = useState("");

  const sedesDisponibles = useMemo(() => [...new Set(registros.map((r) => r.sede).filter(Boolean))].sort(), [registros]);

  // La ventana de seguimiento pedida: entre 91 y 150 dias del vencimiento.
  const enVentana = useMemo(() => registros.filter((r) => {
    const d = diasEntre(hoyStr(), r.fecha_fin_contrato);
    return d >= 91 && d <= 150;
  }), [registros]);

  const filtrados = useMemo(() => enVentana.filter((r) => {
    if (filtroSede && r.sede !== filtroSede) return false;
    if (filtroEstado && r.estado !== filtroEstado) return false;
    if (filtroClasif) {
      const s = r._clasif;
      if (filtroClasif === "incompleto" && s.completo) return false;
      if (filtroClasif === "critico" && !(s.completo && s.score <= 2)) return false;
      if (filtroClasif === "atencion" && !(s.completo && s.score >= 3 && s.score <= 5)) return false;
      if (filtroClasif === "saludable" && !(s.completo && s.score >= 6)) return false;
    }
    if (filtroAsistDesde !== "" && (r.asistencias_2m === null || r.asistencias_2m === undefined || r.asistencias_2m < Number(filtroAsistDesde))) return false;
    if (filtroAsistHasta !== "" && (r.asistencias_2m === null || r.asistencias_2m === undefined || r.asistencias_2m > Number(filtroAsistHasta))) return false;
    if (filtroNpsDesde !== "" && (r.nps_score === null || r.nps_score === undefined || r.nps_score < Number(filtroNpsDesde))) return false;
    if (filtroNpsHasta !== "" && (r.nps_score === null || r.nps_score === undefined || r.nps_score > Number(filtroNpsHasta))) return false;
    const b = norm(busqueda);
    if (b && !(norm(r.nombre).includes(b) || norm(r.dni).includes(b))) return false;
    return true;
  }), [enVentana, filtroSede, filtroEstado, filtroClasif, busqueda, filtroAsistDesde, filtroAsistHasta, filtroNpsDesde, filtroNpsHasta]);

  const stats = useMemo(() => {
    const base = filtrados;
    const critico = base.filter((r) => r._clasif.completo && r._clasif.score <= 2).length;
    const atencion = base.filter((r) => r._clasif.completo && r._clasif.score >= 3 && r._clasif.score <= 5).length;
    const saludable = base.filter((r) => r._clasif.completo && r._clasif.score >= 6).length;
    const incompleto = base.filter((r) => !r._clasif.completo).length;
    const enSeguimiento = base.filter((r) => r.estado === "Seguimiento").length;
    const cerrados = base.filter((r) => r.estado === "Cerrado").length;
    return { total: base.length, critico, atencion, saludable, incompleto, enSeguimiento, cerrados };
  }, [filtrados]);

  async function elegirArchivo(ref, tipo) {
    const file = ref.current.files[0];
    if (!file) return;
    setLeyendo(tipo);
    setResultadoCarga(null);
    try {
      const filas = await leerArchivo(file);
      if (tipo === "contratos") {
        const parsed = parsearContratos(filas);
        if (!parsed.length) { setResultadoCarga({ tipo: "err", txt: "No encontré filas válidas en el archivo de Contratos a vencer. Revisá que sea el correcto." }); }
        else setPendContratos({ nombreArchivo: file.name, filas: parsed, totalOriginal: filas.length, sinDni: parsed.sinDni || 0 });
      } else if (tipo === "accesos") {
        const parsed = parsearAccesos(filas);
        setPendAccesos({ nombreArchivo: file.name, filas: parsed });
      } else if (tipo === "nps") {
        const parsed = parsearNPS(filas);
        setPendNPS({ nombreArchivo: file.name, filas: parsed });
      }
    } catch (err) {
      setResultadoCarga({ tipo: "err", txt: "No se pudo leer el archivo: " + err.message });
    } finally {
      setLeyendo(null);
      ref.current.value = "";
    }
  }

  const combinado = useMemo(() => {
    if (!pendContratos) return null;
    return combinarPlanillas(pendContratos.filas, pendAccesos?.filas || [], pendNPS?.filas || []);
  }, [pendContratos, pendAccesos, pendNPS]);

  function limpiarPendientes() {
    setPendContratos(null); setPendAccesos(null); setPendNPS(null);
  }

  const [progreso, setProgreso] = useState(null);

  async function confirmarCargaMes() {
    if (!combinado) return;
    setGuardando(true);
    setProgreso(null);
    try {
      const n = await guardarSeguimientoMes(
        combinado.filas, { nombre: perfil.nombre, cargo: cargoLabel, creadoPor: perfil.id },
        (lote, total) => setProgreso({ lote, total })
      );
      setResultadoCarga({ tipo: "ok", txt: `Listo: ${n} socios guardados para este mes (${combinado.matchAccesos} con datos de asistencia, ${combinado.matchNPS} con NPS).` });
      limpiarPendientes();
    } catch (err) {
      setResultadoCarga({ tipo: "err", txt: "No se pudo guardar: " + err.message });
    } finally {
      setGuardando(false);
      setProgreso(null);
    }
  }

  async function cambiarEstado(r, estado) {
    try { await actualizarRegistro(r.id, { estado }); } catch (err) { alert(err.message); }
  }
  function abrirComentarios(r) { setModalComentarios(r); setNuevoComentario(""); recargarComentarios(r.id); }
  async function enviarComentario() {
    const texto = nuevoComentario.trim();
    if (!texto || !modalComentarios) return;
    try {
      await agregarComentarioRegistro(modalComentarios.id, { texto, autor: perfil.nombre, cargo: cargoLabel, creadoPor: perfil.id });
      setNuevoComentario("");
      recargarComentarios(modalComentarios.id);
    } catch (err) { alert(err.message); }
  }
  function mensajeDe(r) {
    if (r.mensaje) return r.mensaje;
    const dias = diasEntre(hoyStr(), r.fecha_fin_contrato);
    return construirMensajeContrato(r.nombre, perfil.nombre, r.sede, cargoLabel, dias, r._clasif.nivel, r._clasif.segmento);
  }
  async function marcarEnvio(r) {
    const campos = {};
    if (!r.mensaje) campos.mensaje = mensajeDe(r);
    if (!r.fecha_envio_mensaje) campos.fecha_envio_mensaje = hoyStr();
    if (Object.keys(campos).length) { try { await actualizarRegistro(r.id, campos); } catch (err) { /* silencioso */ } }
  }
  function abrirMensaje(r) { setModalMensaje(r); setTextoMensaje(mensajeDe(r)); }
  async function guardarMensaje() {
    if (!modalMensaje) return;
    try { await actualizarRegistro(modalMensaje.id, { mensaje: textoMensaje }); setModalMensaje(null); }
    catch (err) { alert(err.message); }
  }

  const s = estilos;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 13, textTransform: "uppercase", fontWeight: 800, letterSpacing: "-.01em", color: T.inkSoft }}>Seguimiento de contratos a vencer</div>
          <p style={{ fontSize: 12, color: T.inkSoft, marginTop: 4 }}>Socios activos cuyo contrato vence entre 91 y 150 días desde hoy, cruzando Contratos + Accesos + NPS por DNI.</p>
          <p style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 4 }}>La <b style={{ color: T.ink }}>asistencia</b> es de los últimos 2 meses. El <b style={{ color: T.ink }}>NPS</b> es histórico (la última respuesta que dio el socio, sin importar hace cuánto).</p>
        </div>
        <button onClick={() => setManualAbierto((v) => !v)} style={btnOut}>{manualAbierto ? "Ocultar manual" : "Manual de uso"}</button>
      </div>

      {manualAbierto && (
        <div style={{ background: T.surface, border: "1px solid " + T.line, borderRadius: 16, padding: 20, marginBottom: 22, fontSize: 12.5, color: T.inkSoft, lineHeight: 1.65 }}>
          <p style={{ color: T.ink, fontWeight: 700, marginBottom: 6 }}>Qué es esta pantalla</p>
          <p>Seguimiento proactivo de socios activos cuyo contrato está por vencer (91 a 150 días desde hoy), para detectar quiénes tienen riesgo de no renovar antes de que sea tarde.</p>
          <p style={{ color: T.ink, fontWeight: 700, margin: "14px 0 6px" }}>Las 3 planillas y cómo se cruzan</p>
          <p><b style={{ color: T.ink }}>Contratos a vencer</b> define la base del mes (DNI, nombre, sede, fecha de vencimiento). <b style={{ color: T.ink }}>Accesos</b> aporta la asistencia de los últimos 2 meses. <b style={{ color: T.ink }}>NPS y comentarios</b> aporta la última encuesta respondida. Se cruzan por DNI: lo que no está en la base de Contratos de ese mes se descarta (y te avisa cuántos). Se leen las 3 en el navegador con vista previa, y se guardan todas juntas con "Confirmar carga del mes".</p>
          <p style={{ color: T.ink, fontWeight: 700, margin: "14px 0 6px" }}>La clasificación (1 a 10)</p>
          <p>Cruza el nivel de asistencia (Baja/Media/Alta) con el segmento de NPS (Detractor/Pasivo/Promotor). Los tres grupos de resultado son: <b style={{ color: T.red }}>Riesgo de baja</b> (1-2), <b style={{ color: T.amber }}>En seguimiento</b> (3-5) y <b style={{ color: T.green }}>Fidelizado</b> (6-10). Hay dos casos especiales marcados aparte: mucha asistencia pero mal NPS (posible boca en boca negativo), y poca asistencia pero buen NPS (le gusta pero no lo usa). Si no respondió la encuesta, se clasifica solo por asistencia con otros cortes (1-9 / 10-28 / 29+), y te avisa que fue así. Si a menos de 120 días del vencimiento falta asistencia o NPS, se marca Riesgo de baja directamente por falta de datos.</p>
          <p style={{ color: T.ink, fontWeight: 700, margin: "14px 0 6px" }}>Mensajes</p>
          <p>Cada tarjeta trae un mensaje sugerido según su clasificación (enfocado en asistencia y experiencia, no en el vencimiento del plan). Se puede ver y editar antes de enviar con el botón "Ver / editar mensaje" — el cambio queda guardado para ese socio. El email sale sin la firma final; WhatsApp sí la lleva completa.</p>
          <p style={{ color: T.ink, fontWeight: 700, margin: "14px 0 6px" }}>Estados</p>
          <p><b style={{ color: T.ink }}>Abierto</b>: todavía sin trabajar. <b style={{ color: T.ink }}>Seguimiento</b>: ya estás en contacto con el socio. <b style={{ color: T.ink }}>Cerrado</b>: renovó o se dio de baja.</p>
          <p style={{ color: T.ink, fontWeight: 700, margin: "14px 0 6px" }}>Quién puede corregir o eliminar</p>
          <p>Corregir nombre, DNI, email, teléfono o sede: Dirección o Gerente, desde la solapa Administrador. Eliminar un registro: exclusivo de Dirección.</p>
        </div>
      )}

      {puedeCargar && (
        <div style={{ marginBottom: 22 }}>
          <button onClick={() => setBoAbierto((v) => !v)} style={{
            width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
            background: T.surface, border: "1px solid " + T.line, borderRadius: boAbierto ? "16px 16px 0 0" : 16,
            padding: "12px 16px", color: T.ink, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: FUENTE,
          }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}><IconoCarpeta tam={18} /> Back office — cargar las 3 planillas del mes</span>
            <span style={{ transform: boAbierto ? "rotate(180deg)" : "none", transition: "transform .2s" }}><IconoFlechaAbajo /></span>
          </button>
          {boAbierto && (
            <div style={{ border: "1px solid " + T.line, borderTop: "none", borderRadius: "0 0 16px 16px", padding: 20, background: T.surface }}>
              <p style={{ fontSize: 11.5, color: T.inkSoft, marginBottom: 16 }}>
                Elegí las 3 planillas del mes (no hace falta un orden puntual). Se leen acá en tu navegador y te muestro
                el cruce antes de guardar nada — recién al tocar "Confirmar carga del mes" se graba todo junto.
                <b style={{ color: T.ink }}> Contratos a vencer es obligatoria</b> (define la base); Accesos y NPS son opcionales.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
                <div style={s.uploadCard}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>1 · Contratos a vencer</div>
                  <p style={{ fontSize: 11, color: T.inkSoft, marginBottom: 10 }}>Define la base del mes.</p>
                  <label style={{ ...btnMarca, display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12.5 }}>
                    <IconoSubir /> {leyendo === "contratos" ? "Leyendo..." : "Elegir archivo"}
                    <input ref={refContratos} type="file" accept=".csv,.xlsx,.xls" onChange={() => elegirArchivo(refContratos, "contratos")} style={{ display: "none" }} disabled={!!leyendo || guardando} />
                  </label>
                  {pendContratos && (
                    <div style={{ marginTop: 8, fontSize: 11, color: T.green, display: "flex", alignItems: "center", gap: 5 }}>
                      <IconoCheckCirculo tam={13} /> {pendContratos.nombreArchivo} · {pendContratos.filas.length} filas{pendContratos.sinDni > 0 ? ` · ${pendContratos.sinDni} descartadas sin DNI` : ""}
                    </div>
                  )}
                </div>
                <div style={s.uploadCard}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>2 · Accesos por socio</div>
                  <p style={{ fontSize: 11, color: T.inkSoft, marginBottom: 10 }}>Asistencia de los últimos 2 meses.</p>
                  <label style={{ ...btnOut, display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12.5 }}>
                    <IconoSubir /> {leyendo === "accesos" ? "Leyendo..." : "Elegir archivo"}
                    <input ref={refAccesos} type="file" accept=".csv,.xlsx,.xls" onChange={() => elegirArchivo(refAccesos, "accesos")} style={{ display: "none" }} disabled={!!leyendo || guardando} />
                  </label>
                  {pendAccesos && (
                    <div style={{ marginTop: 8, fontSize: 11, color: T.green, display: "flex", alignItems: "center", gap: 5 }}>
                      <IconoCheckCirculo tam={13} /> {pendAccesos.nombreArchivo} · {pendAccesos.filas.length} filas
                    </div>
                  )}
                </div>
                <div style={s.uploadCard}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>3 · NPS y comentarios</div>
                  <p style={{ fontSize: 11, color: T.inkSoft, marginBottom: 10 }}>Última respuesta de cada socio.</p>
                  <label style={{ ...btnOut, display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12.5 }}>
                    <IconoSubir /> {leyendo === "nps" ? "Leyendo..." : "Elegir archivo"}
                    <input ref={refNPS} type="file" accept=".csv,.xlsx,.xls" onChange={() => elegirArchivo(refNPS, "nps")} style={{ display: "none" }} disabled={!!leyendo || guardando} />
                  </label>
                  {pendNPS && (
                    <div style={{ marginTop: 8, fontSize: 11, color: T.green, display: "flex", alignItems: "center", gap: 5 }}>
                      <IconoCheckCirculo tam={13} /> {pendNPS.nombreArchivo} · {pendNPS.filas.length} filas
                    </div>
                  )}
                </div>
              </div>

              {combinado && (
                <div style={{ marginTop: 18, background: T.surface2, borderRadius: 11, padding: 16 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>Vista previa del cruce</p>
                  <p style={{ fontSize: 12, color: T.inkSoft, marginBottom: 4 }}>
                    Base de <b style={{ color: T.ink }}>{combinado.totalContratos}</b> socios (Contratos a vencer).
                    {pendContratos.filas.filter((f) => f.estado === "Cerrado").length > 0 && (
                      <> De esos, <b style={{ color: T.amber }}>{pendContratos.filas.filter((f) => f.estado === "Cerrado").length}</b> no tenían sede en la planilla — se cargan igual pero ya quedan dados de baja.</>
                    )}
                  </p>
                  <p style={{ fontSize: 12, color: T.inkSoft, marginBottom: 4 }}>
                    {pendAccesos
                      ? <><b style={{ color: T.ink }}>{combinado.matchAccesos}</b> de {combinado.totalAccesos} DNI de Accesos coincidieron con la base y se van a sumar. El resto se descarta.</>
                      : "Sin planilla de Accesos: la asistencia va a quedar vacía para todos."}
                  </p>
                  <p style={{ fontSize: 12, color: T.inkSoft, marginBottom: 14 }}>
                    {pendNPS
                      ? <><b style={{ color: T.ink }}>{combinado.matchNPS}</b> de {combinado.totalNPS} DNI de NPS coincidieron con la base y se van a sumar. El resto se descarta.</>
                      : "Sin planilla de NPS: el NPS va a quedar vacío para todos."}
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={btnVerde} disabled={guardando} onClick={confirmarCargaMes}>
                      {guardando ? (progreso ? `Guardando... (${progreso.lote}/${progreso.total})` : "Guardando...") : "Confirmar carga del mes"}
                    </button>
                    <button style={btnOut} disabled={guardando} onClick={limpiarPendientes}>Cancelar</button>
                  </div>
                </div>
              )}

              {resultadoCarga && (
                <p style={{ marginTop: 14, fontSize: 12.5, color: resultadoCarga.tipo === "err" ? T.red : T.green }}>{resultadoCarga.txt}</p>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 16 }}>
        <div style={{ minWidth: 160 }}>
          <label style={lab}>Sede</label>
          <select style={inp} value={filtroSede} onChange={(e) => setFiltroSede(e.target.value)}>
            <option value="">Todas</option>
            {sedesDisponibles.map((sd) => <option key={sd} value={sd}>{sd}</option>)}
          </select>
        </div>
        <div style={{ minWidth: 170 }}>
          <label style={lab}>Clasificación</label>
          <select style={inp} value={filtroClasif} onChange={(e) => setFiltroClasif(e.target.value)}>
            <option value="">Todas</option>
            <option value="critico">Riesgo de baja (1-2)</option>
            <option value="atencion">En seguimiento (3-5)</option>
            <option value="saludable">Fidelizado (6-10)</option>
            <option value="incompleto">Datos incompletos</option>
          </select>
        </div>
        <div style={{ minWidth: 160 }}>
          <label style={lab}>Estado</label>
          <select style={inp} value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
            <option value="Abierto">Abiertos</option>
            <option value="Seguimiento">En seguimiento</option>
            <option value="Cerrado">Cerrados</option>
            <option value="">Todos</option>
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={lab}>Buscar</label>
          <input style={inp} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre o DNI..." />
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 16 }}>
        <div style={{ minWidth: 110 }}>
          <label style={lab}>Asistencias desde</label>
          <input type="number" min="0" style={inp} value={filtroAsistDesde} onChange={(e) => setFiltroAsistDesde(e.target.value)} placeholder="Mín." />
        </div>
        <div style={{ minWidth: 110 }}>
          <label style={lab}>Asistencias hasta</label>
          <input type="number" min="0" style={inp} value={filtroAsistHasta} onChange={(e) => setFiltroAsistHasta(e.target.value)} placeholder="Máx." />
        </div>
        <div style={{ minWidth: 100 }}>
          <label style={lab}>NPS desde</label>
          <input type="number" min="0" max="10" style={inp} value={filtroNpsDesde} onChange={(e) => setFiltroNpsDesde(e.target.value)} placeholder="Mín." />
        </div>
        <div style={{ minWidth: 100 }}>
          <label style={lab}>NPS hasta</label>
          <input type="number" min="0" max="10" style={inp} value={filtroNpsHasta} onChange={(e) => setFiltroNpsHasta(e.target.value)} placeholder="Máx." />
        </div>
        {(filtroAsistDesde !== "" || filtroAsistHasta !== "" || filtroNpsDesde !== "" || filtroNpsHasta !== "") && (
          <button style={btnOut} onClick={() => { setFiltroAsistDesde(""); setFiltroAsistHasta(""); setFiltroNpsDesde(""); setFiltroNpsHasta(""); }}>
            <IconoX /> Limpiar asistencia/NPS
          </button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 26 }}>
        <StatCard n={stats.total} l="En ventana 91-150 días" color={T.marca} />
        <StatCard n={stats.critico} l="Riesgo de baja" color={T.red} />
        <StatCard n={stats.atencion} l="En seguimiento" color={T.amber} />
        <StatCard n={stats.saludable} l="Fidelizado" color={T.green} />
        <StatCard n={stats.incompleto} l="Datos incompletos" color={T.line} />
        <StatCard n={stats.enSeguimiento} l="En seguimiento" color={T.amber} />
        <StatCard n={stats.cerrados} l="Cerrados" color={T.green} />
      </div>

      {filtrados.length === 0 ? (
        <div style={{ padding: 50, textAlign: "center", color: T.inkSoft, background: T.surface, border: "1px solid " + T.line, borderRadius: 16 }}>
          <div>{enVentana.length ? "No hay socios que coincidan con el filtro actual." : "No hay socios dentro de la ventana de 91 a 150 días."}</div>
          <div style={{ fontSize: 11.5, marginTop: 10, color: crudos.length ? T.green : T.inkSoft }}>
            {crudos.length
              ? `Hay ${crudos.length} socio(s) guardado(s) en total en la base (contando todos los meses cargados y fuera de esta ventana) — el filtro de fecha es lo que los está ocultando acá, no faltan datos.`
              : "No hay ningún registro guardado todavía en esta base. Cargá la planilla de Contratos a vencer arriba."}
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 16 }}>
          {filtrados.map((r) => {
            const dias = diasEntre(hoyStr(), r.fecha_fin_contrato);
            const c = r._clasif;
            const nota = c.forzadoPorFaltaDatos
              ? "Vence en menos de 120 días y falta asistencia o NPS — se marca en Riesgo de baja por falta de datos, no por mal puntaje. Priorizá conseguir esa información."
              : c.soloAsistencia
              ? "No respondió la encuesta de NPS — clasificado solo por asistencia (1-9 Riesgo de baja, 10-28 En seguimiento, 29+ Fidelizado)."
              : (c.completo ? notaEspecial(c.nivel, c.segmento) : null);
            const hasPhone = r.telefono && r.telefono.length > 5;
            const hasEmail = r.email && r.email.includes("@");
            const mensaje = mensajeDe(r);
            return (
              <div key={r.id} style={{ ...s.card, borderLeft: "3px solid " + colorScore(c.completo ? c.score : null), opacity: r.estado === "Cerrado" ? 0.6 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14.5 }}>{r.nombre}</div>
                    <div style={{ fontSize: 11.5, color: T.inkSoft }}>DNI {r.dni}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: colorScore(c.completo ? c.score : null), fontVariantNumeric: "tabular-nums" }}>
                      {c.completo ? c.score : "—"}<span style={{ fontSize: 12, color: T.inkSoft, fontWeight: 500 }}>/10</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                  <Badge tone="gris">{r.sede}</Badge>
                  {r.tipo_socio_n1 && <Badge tone="gris">{r.tipo_socio_n1}</Badge>}
                  {dias <= 120 ? <Badge tone="amber">Vence en {dias} días</Badge> : <Badge tone="gris">Vence en {dias} días</Badge>}
                </div>

                <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 10 }}>
                  <div>Vencimiento: {fmt(r.fecha_fin_contrato)}{r.lista_precio ? " · " + r.lista_precio : ""}</div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                  <div style={s.miniStat}>
                    <div style={{ fontSize: 10.5, color: T.inkSoft, textTransform: "uppercase" }}>Asistencia (2m)</div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>
                      {r.asistencias_2m ?? "—"}
                      {c.nivel && <span style={{ marginLeft: 6 }}><Badge tone={COLOR_NIVEL[c.nivel]}>{c.nivel}</Badge></span>}
                    </div>
                  </div>
                  <div style={s.miniStat}>
                    <div style={{ fontSize: 10.5, color: T.inkSoft, textTransform: "uppercase" }}>NPS</div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>
                      {r.nps_score ?? "—"}
                      {c.segmento && <span style={{ marginLeft: 6 }}><Badge tone={COLOR_SEGMENTO[c.segmento]}>{c.segmento}</Badge></span>}
                    </div>
                  </div>
                </div>

                {r.nps_comentario && (
                  <div style={{ fontSize: 12, fontStyle: "italic", color: T.inkSoft, background: T.surface2, borderRadius: 11, padding: "8px 10px", marginBottom: 10 }}>
                    "{r.nps_comentario}"
                  </div>
                )}

                {nota && (
                  <div style={{ display: "flex", gap: 6, fontSize: 11.5, color: T.amber, background: T.amberSoft, borderRadius: 11, padding: "8px 10px", marginBottom: 10 }}>
                    <IconoAlerta tam={14} style={{ flexShrink: 0, marginTop: 1 }} /> <span>{nota}</span>
                  </div>
                )}

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  {hasPhone
                    ? <a href={waLink(r.telefono, mensaje)} target="_blank" rel="noreferrer" onClick={() => marcarEnvio(r)}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, background: T.green, color: T.sobreClaro, textDecoration: "none", fontSize: 11.5, fontWeight: 700, padding: "7px 11px", borderRadius: 11 }}>
                        <IconoChat /> WhatsApp
                      </a>
                    : <span style={s.disabledBtn}>Sin teléfono</span>}
                  {hasEmail
                    ? <a href={mailLink(r.email, r.nombre, mensaje)} onClick={() => marcarEnvio(r)}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, background: T.surface2, color: T.ink, textDecoration: "none", fontSize: 11.5, fontWeight: 700, padding: "7px 11px", borderRadius: 11, border: "1px solid " + T.line }}>
                        <IconoMail /> Email
                      </a>
                    : <span style={s.disabledBtn}><IconoMail /> Sin email</span>}
                  <button style={s.smallBtn} onClick={() => abrirMensaje(r)}>Ver / editar mensaje</button>
                  <button style={s.smallBtn} onClick={() => abrirComentarios(r)}>
                    <IconoChat /> Comentarios{r._numComentarios > 0 && <span style={{ marginLeft: 4 }}>({r._numComentarios})</span>}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 10 }}>
                  {r.fecha_envio_mensaje ? "Enviado: " + fmt(r.fecha_envio_mensaje) : "Sin enviar"}
                </div>

                <select style={{ ...inp, padding: "6px 8px", fontSize: 11.5, fontWeight: 700,
                  background: r.estado === "Cerrado" ? T.greenSoft : r.estado === "Seguimiento" ? T.amberSoft : T.redSoft,
                  color: r.estado === "Cerrado" ? T.green : r.estado === "Seguimiento" ? T.amber : T.red }}
                  value={r.estado} onChange={(e) => cambiarEstado(r, e.target.value)}>
                  <option value="Abierto">Abierto</option>
                  <option value="Seguimiento">Seguimiento (estamos en contacto)</option>
                  <option value="Cerrado">Cerrado (renovó o se dio de baja)</option>
                </select>
              </div>
            );
          })}
        </div>
      )}

      {modalMensaje && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setModalMensaje(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: T.surface, border: "1px solid " + T.line, borderRadius: 16, maxWidth: 560, width: "100%", maxHeight: "80vh", overflowY: "auto", padding: "22px 24px" }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>{modalMensaje.nombre}</h3>
            <p style={{ fontSize: 12, color: T.inkSoft, marginBottom: 14 }}>
              Mensaje sugerido según su clasificación ({modalMensaje._clasif.nivel || "—"} / {modalMensaje._clasif.segmento || "—"}). Lo podés editar antes de enviarlo — el email sale sin la firma final, porque tu cliente de correo ya agrega la suya.
            </p>
            <textarea style={{ ...inp, resize: "vertical", minHeight: 260, fontFamily: FUENTE, fontSize: 13, lineHeight: 1.6 }}
              value={textoMensaje} onChange={(e) => setTextoMensaje(e.target.value)} />
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button style={btnVerde} onClick={guardarMensaje}>Guardar mensaje</button>
              <button style={btnOut} onClick={() => setModalMensaje(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {modalComentarios && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setModalComentarios(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: T.surface, border: "1px solid " + T.line, borderRadius: 16, maxWidth: 520, width: "100%", maxHeight: "80vh", overflowY: "auto", padding: "22px 24px" }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>{modalComentarios.nombre}</h3>
            <p style={{ fontSize: 12, color: T.inkSoft, marginBottom: 14 }}>Historial de comentarios de seguimiento.</p>
            <div>
              {(comentariosPorRegistro[modalComentarios.id] || []).length === 0 && (
                <p style={{ fontSize: 12.5, color: T.inkSoft, padding: "8px 0 16px" }}>Todavía no hay comentarios.</p>
              )}
              {(comentariosPorRegistro[modalComentarios.id] || []).map((cm) => (
                <div key={cm.id} style={{ background: T.surface2, borderRadius: 11, padding: "10px 12px", marginBottom: 10 }}>
                  <div style={{ fontSize: 10.5, color: T.inkSoft, marginBottom: 5, display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span>{cm.autor || "—"}{cm.cargo ? " · " + cm.cargo : ""}</span>
                    <span>{new Date(cm.creado_en).toLocaleDateString("es-AR")}</span>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{cm.texto}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              <textarea style={{ ...inp, resize: "vertical", minHeight: 64 }} value={nuevoComentario}
                onChange={(e) => setNuevoComentario(e.target.value)} placeholder="Escribí un nuevo comentario..." />
              <button style={btnVerde} onClick={enviarComentario}>Agregar comentario</button>
            </div>
            <button onClick={() => setModalComentarios(null)} style={{ ...btnMarca, marginTop: 16, width: "100%" }}><IconoX /> Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ n, l, color }) {
  return (
    <div style={{ background: T.surface, border: "1px solid " + T.line, borderLeft: "3px solid " + color, borderRadius: 16, padding: "16px 18px" }}>
      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.5px", color, fontVariantNumeric: "tabular-nums" }}>{n}</div>
      <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 4, textTransform: "uppercase", letterSpacing: ".04em" }}>{l}</div>
    </div>
  );
}

const estilos = {
  card: { background: T.surface, border: "1px solid " + T.line, borderRadius: 16, padding: 18 },
  uploadCard: { background: T.surface2, border: "1px solid " + T.line, borderRadius: 11, padding: 14 },
  miniStat: { background: T.surface2, borderRadius: 11, padding: "8px 10px" },
  smallBtn: { display: "inline-flex", alignItems: "center", background: "none", border: "1px solid " + T.line, color: T.ink, fontSize: 11, padding: "6px 10px", borderRadius: 11, cursor: "pointer", fontFamily: FUENTE },
  disabledBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: T.surface2, color: T.inkSoft, fontSize: 11.5, fontWeight: 700, padding: "7px 11px", borderRadius: 11 },
};
