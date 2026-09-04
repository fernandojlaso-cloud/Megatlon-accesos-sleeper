import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { T, FUENTE, inp, lab, btnMarca, btnOut, btnVerde, Badge } from "../estilos.jsx";
import { useCasos, useSociosTotales, crearCasos, actualizarCaso, agregarComentario } from "./datos.js";
import {
  IconoSubir, IconoBajar, IconoMas,
  IconoChat, IconoMail, IconoAlerta, IconoReloj, IconoCheckCirculo, IconoX, IconoTrofeo,
  IconoCarpeta, IconoFlechaAbajo,
} from "./iconos.jsx";
import Evaluacion from "./Evaluacion.jsx";
import { useMensajesPlantillas, completarPlaceholders } from "./datosPlantillas.js";

const MOTIVOS = ["Falta de tiempo", "Problemas personales", "Mudanza", "Lesión o problema de salud", "Problemas con el servicio", "Vacaciones", "Otro"];

const RIESGO_POR_MOTIVO = {
  "Falta de tiempo": "Alto",
  "Problemas personales": "Alto",
  "Mudanza": "Alto",
  "Lesión o problema de salud": "Medio",
  "Problemas con el servicio": "Medio",
  "Vacaciones": "Bajo",
  "Otro": "Bajo",
};

const hoyStr = () => new Date().toISOString().slice(0, 10);
const fmt = (iso) => { if (!iso) return "—"; const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
const norm = (s) => (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[[\]]/g, "").replace(/_/g, " ").trim();
const diasEntre = (desde, hasta) => {
  if (!desde) return 0;
  const d1 = new Date(desde + "T00:00:00");
  const d2 = new Date((hasta || hoyStr()) + "T00:00:00");
  return Math.round((d2 - d1) / 86400000);
};

function construirMensajeFallback(nombre, gerente, sede, cargoLabel) {
  const first = (nombre || "").trim().split(" ")[0] || nombre || "Hola";
  const g = gerente || "el equipo";
  const s = sede || "tu sede";
  const cRol = (cargoLabel || "Gerente").toLowerCase();
  return `Hola ${first},

Espero que estés muy bien.

Soy ${g}, ${cRol} de Megatlon ${s}.

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

Te agradezco mucho el tiempo para responder este mensaje.

${g}
${cargoLabel || "Gerente"} | Megatlon ${s}`;
}

function construirMensaje(nombre, gerente, sede, cargoLabel, plantillas) {
  const g = gerente || "el equipo";
  const s = sede || "tu sede";
  const claveDb = plantillas && plantillas["sleepers|general"];
  if (!claveDb) return construirMensajeFallback(nombre, gerente, sede, cargoLabel);
  const cuerpo = completarPlaceholders(claveDb, { nombre, gerente: g, cargo: cargoLabel, sede: s });
  return `${cuerpo}

${g}
${cargoLabel || "Gerente"} | Megatlon ${s}`;
}

function waLink(telefono, msg) { return "https://wa.me/" + telefono + "?text=" + encodeURIComponent(msg); }

// El email ya lleva firma propia del cliente de correo (Gmail/Outlook), asi que
// para email sacamos el cierre "Nombre / Cargo | Megatlon Sede" y dejamos el
// cuerpo hasta el agradecimiento. Los datos del gerente ya quedan mencionados
// arriba, en "Soy fulano, gerente de Megatlon tal sede."
const ANCLA_FIN_MENSAJE = "Te agradezco mucho el tiempo para responder este mensaje.";
function mensajeSinFirma(mensajeCompleto) {
  const idx = (mensajeCompleto || "").indexOf(ANCLA_FIN_MENSAJE);
  if (idx === -1) return mensajeCompleto;
  return mensajeCompleto.slice(0, idx + ANCLA_FIN_MENSAJE.length);
}

function mailLink(email, nombre, msg) {
  const asunto = `Te extrañamos en Megatlon, ${(nombre || "").trim().split(" ")[0]}`;
  return "mailto:" + email + "?subject=" + encodeURIComponent(asunto) + "&body=" + encodeURIComponent(mensajeSinFirma(msg));
}
function contactoPersonal(motivo, riesgo) {
  if (motivo === "Problemas con el servicio" || riesgo === "Alto") return "si";
  if (!motivo && !riesgo) return "pend";
  return "no";
}
function alarmaDe(c) {
  if (c.estado === "Cerrado") return { color: T.green, bg: T.greenSoft, label: "Recuperado", check: true };
  const tuvoInteraccion = !!(c.motivo || c.riesgo || c.fecha_envio_mensaje || c.fecha_seguimiento || c._numComentarios > 0);
  if (tuvoInteraccion) return { color: T.amber, bg: T.amberSoft, label: "En seguimiento" };
  const dias = diasEntre(c.fecha_carga);
  if (dias <= 0) return { color: T.green, bg: T.greenSoft, label: "Recién cargado" };
  if (dias <= 5) return { color: T.amber, bg: T.amberSoft, label: `Día ${dias}` };
  return { color: T.red, bg: T.redSoft, label: `Día ${dias}` };
}

// Contrato por vencer o ya vencido: 90 dias o menos hasta la fecha de fin.
// Distinto del rojo de la alarma (que es por falta de respuesta) — este marca
// la fila entera con un marco, no una etiqueta.
function contratoPorVencer(c) {
  if (!c.fecha_fin_contrato) return false;
  return diasEntre(hoyStr(), c.fecha_fin_contrato) <= 90;
}

/* ---------- lectura de planillas ---------- */

function splitCSVLine(line) {
  const result = []; let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === "," && !inQ) { result.push(cur); cur = ""; }
    else cur += ch;
  }
  result.push(cur);
  return result.map((s) => s.trim());
}
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return [];
  const headers = splitCSVLine(lines[0]);
  return lines.slice(1).map((line) => {
    const vals = splitCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
    return obj;
  });
}
function normalizarFecha(valor) {
  if (!valor) return "";
  if (valor instanceof Date && !isNaN(valor)) return valor.toISOString().slice(0, 10);
  const str = valor.toString().trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const m = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = "20" + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return "";
}

function mapRow(row, defaults) {
  const keys = Object.keys(row);
  const find = (...names) => {
    for (const k of keys) { if (names.includes(norm(k))) return row[k]; }
    return "";
  };
  const findTxt = (...names) => (find(...names) || "").toString().trim();
  const nombreCombinado = [findTxt("nombre socio", "nombre"), findTxt("apellido socio", "apellido")].filter(Boolean).join(" ").trim();
  return {
    nombre: findTxt("nombre", "socio", "cliente", "nombre y apellido") || nombreCombinado,
    dni: findTxt("dni", "documento", "nro documento", "numero de documento", "numero documento", "cedula"),
    email: findTxt("email", "correo", "mail", "e-mail", "mail socio"),
    telefono: findTxt("telefono", "celular", "whatsapp", "tel", "numero", "número", "telefono socio"),
    sede: findTxt("sede", "sucursal", "sucursal acceso") || defaults.sede,
    ultimaVisita: findTxt("ultima visita", "fecha ultima visita", "ultimo ingreso", "fecha ultimo acceso"),
    fechaFinContrato: normalizarFecha(find("fin de su contrato", "fin de contrato", "fin contrato", "vencimiento", "vencimiento plan", "fecha vencimiento", "fecha fin contrato")),
  };
}

/* ============================================================
   Componente principal
   ============================================================ */
export default function Sleepers({ perfil, cargoFirma }) {
  const { casos: casosCrudos, comentariosPorCaso, recargarComentarios } = useCasos();
  const { totales, guardar: guardarTotal } = useSociosTotales();
  const { plantillas: plantillasCrudas } = useMensajesPlantillas();
  const plantillas = useMemo(() => {
    const mapa = {};
    plantillasCrudas.filter((p) => p.activa).forEach((p) => { mapa[`${p.tema}|${p.clave}`] = p.cuerpo; });
    return mapa;
  }, [plantillasCrudas]);

  const casos = useMemo(
    () => casosCrudos.map((c) => ({ ...c, _numComentarios: (comentariosPorCaso[c.id] || []).length })),
    [casosCrudos, comentariosPorCaso]
  );

  // Regla automatica: si pasaron 30 dias desde que se cargo un sleeper y no
  // volvio a aparecer en una carga mas reciente (misma clave DNI/email/nombre),
  // asumimos que volvio a entrenar y lo pasamos a Cerrado (Recuperado) solo.
  useEffect(() => {
    const porClave = {};
    casosCrudos.forEach((c) => {
      const key = norm(c.dni) || norm(c.email) || norm(c.nombre);
      if (!porClave[key] || c.fecha_carga > porClave[key].fecha_carga) porClave[key] = c;
    });
    const hoy = hoyStr();
    const aCerrar = Object.values(porClave).filter(
      (c) => c.estado === "Abierto" && c.fecha_carga && diasEntre(c.fecha_carga, hoy) >= 30
    );
    if (!aCerrar.length) return;
    (async () => {
      for (const c of aCerrar) {
        try {
          await actualizarCaso(c.id, { estado: "Cerrado" });
          await agregarComentario(c.id, {
            texto: "Cerrado automáticamente: pasaron 30 días desde la carga sin volver a aparecer como sleeper.",
            autor: "Sistema", cargo: "Automático", creadoPor: perfil.id,
          });
        } catch { /* si falla, se vuelve a intentar en la proxima carga de datos */ }
      }
    })();
  }, [casosCrudos]);

  const esDireccion = perfil.rol === "director";
  const puedeEditarIdentidad = ["director", "gerente"].includes(perfil.rol);
  const puedeCargar = ["director", "gerente", "gerente_servicio", "coordinador_servicio", "referente_servicio"].includes(perfil.rol);
  const cargoLabel = cargoFirma || {
    director: "Director", gerente: "Gerente",
    gerente_servicio: "Gerente de Servicio",
    coordinador_servicio: "Coordinador de Servicio",
    referente_servicio: "Referente de Servicio",
  }[perfil.rol] || "Gerente";

  const [boAbierto, setBoAbierto] = useState(false);
  const [manualAbierto, setManualAbierto] = useState(false);
  const [evalAbierta, setEvalAbierta] = useState(false);
  const [boTocado, setBoTocado] = useState(false);
  const [cargaInicialLista, setCargaInicialLista] = useState(false);
  useEffect(() => {
    if (cargaInicialLista) return;
    if (casosCrudos.length > 0) { setCargaInicialLista(true); return; }
    const t = setTimeout(() => { setCargaInicialLista(true); if (!boTocado) setBoAbierto(true); }, 900);
    return () => clearTimeout(t);
  }, [casosCrudos.length, cargaInicialLista, boTocado]);
  const [filtroSede, setFiltroSede] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("Abierto");
  const [busqueda, setBusqueda] = useState("");
  const [filtroRiesgo, setFiltroRiesgo] = useState("");
  const [filtroIntencion, setFiltroIntencion] = useState("");
  const [filtroFinDesde, setFiltroFinDesde] = useState("");
  const [filtroFinHasta, setFiltroFinHasta] = useState("");
  const [filtroSegDesde, setFiltroSegDesde] = useState("");
  const [filtroSegHasta, setFiltroSegHasta] = useState("");
  const [modalMensaje, setModalMensaje] = useState(null);
  const [modalComentarios, setModalComentarios] = useState(null);
  const [nuevoComentario, setNuevoComentario] = useState("");
  const [pendientes, setPendientes] = useState([]);
  const fileRef = useRef(null);

  const sedesDisponibles = useMemo(
    () => [...new Set(casos.map((c) => c.sede).filter(Boolean))].sort(),
    [casos]
  );

  function pasaFiltrosComunes(c) {
    if (filtroSede && c.sede !== filtroSede) return false;
    const b = norm(busqueda);
    if (b && !(norm(c.nombre).includes(b) || norm(c.email).includes(b) || norm(c.dni).includes(b))) return false;
    if (filtroRiesgo && c.riesgo !== filtroRiesgo) return false;
    if (filtroIntencion === "SinDefinir" ? !!c.intencion_volver : (filtroIntencion && c.intencion_volver !== filtroIntencion)) return false;
    if (filtroFinDesde && (!c.fecha_fin_contrato || c.fecha_fin_contrato < filtroFinDesde)) return false;
    if (filtroFinHasta && (!c.fecha_fin_contrato || c.fecha_fin_contrato > filtroFinHasta)) return false;
    if (filtroSegDesde && (!c.fecha_seguimiento || c.fecha_seguimiento < filtroSegDesde)) return false;
    if (filtroSegHasta && (!c.fecha_seguimiento || c.fecha_seguimiento > filtroSegHasta)) return false;
    return true;
  }

  const filtrados = useMemo(() => casos.filter((c) => {
    if (filtroEstado && c.estado !== filtroEstado) return false;
    return pasaFiltrosComunes(c);
  }), [casos, filtroSede, filtroEstado, busqueda, filtroRiesgo, filtroIntencion, filtroFinDesde, filtroFinHasta, filtroSegDesde, filtroSegHasta]);

  // Las estadisticas siempre reflejan el total (ignoran el filtro de Estado).
  const statsSet = useMemo(() => casos.filter((c) => pasaFiltrosComunes(c)),
    [casos, filtroSede, busqueda, filtroRiesgo, filtroIntencion, filtroFinDesde, filtroFinHasta, filtroSegDesde, filtroSegHasta]);

  const conteoClave = useMemo(() => {
    const map = {};
    casos.forEach((c) => { const k = norm(c.dni) || norm(c.email) || norm(c.nombre); map[k] = (map[k] || 0) + 1; });
    return map;
  }, [casos]);

  const conteoIntencion = useMemo(() => {
    const r = { Si: 0, No: 0, SinDefinir: 0 };
    statsSet.forEach((c) => { r[c.intencion_volver || "SinDefinir"]++; });
    return r;
  }, [statsSet]);

  /* ---------- carga por archivo ---------- */
  async function onFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    let filas = [];
    try {
      if (ext === "csv") {
        const text = await file.text();
        filas = parseCSV(text);
      } else if (ext === "json") {
        const text = await file.text();
        const parsed = JSON.parse(text);
        filas = Array.isArray(parsed) ? parsed : (parsed.data || parsed.socios || parsed.rows || parsed.items || []);
        if (!Array.isArray(filas)) filas = [];
      } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array", cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        filas = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      }
    } catch {
      alert("No pude leer el archivo. Revisá que sea un .csv, .xlsx o .json válido.");
      return;
    }
    const defaults = { sede: esDireccion ? "" : perfil.sede };
    const mapeadas = filas.map((r) => mapRow(r, defaults)).filter((r) => r.nombre);
    if (!mapeadas.length) { alert("No encontré filas válidas (necesitan al menos la columna Nombre)."); return; }
    setPendientes(mapeadas);
    e.target.value = "";
  }

  async function confirmarCarga() {
    const filas = pendientes.map((r) => ({
      nombre: r.nombre,
      dni: r.dni || null,
      email: r.email || null,
      telefono: (r.telefono || "").toString().replace(/[^\d]/g, "") || null,
      sede: r.sede || perfil.sede || "Sin sede",
      ultima_visita: r.ultimaVisita || null,
      fecha_fin_contrato: r.fechaFinContrato || null,
      mensaje: construirMensaje(r.nombre, perfil.nombre, r.sede || perfil.sede, cargoLabel, plantillas),
      subido_por: perfil.nombre,
      cargo_subido_por: cargoLabel,
      creado_por: perfil.id,
      fecha_carga: hoyStr(),
      estado: "Abierto",
    }));
    try {
      await crearCasos(filas);
      setPendientes([]);
    } catch (err) {
      alert("No se pudo cargar la planilla: " + err.message);
    }
  }

  const [manual, setManual] = useState({ nombre: "", dni: "", email: "", telefono: "", sede: "", ultimaVisita: "", finContrato: "" });
  async function agregarManual() {
    if (!manual.nombre.trim()) { alert("El nombre es obligatorio."); return; }
    const sede = manual.sede.trim() || perfil.sede || "Sin sede";
    try {
      await crearCasos([{
        nombre: manual.nombre.trim(),
        dni: manual.dni.trim() || null,
        email: manual.email.trim() || null,
        telefono: manual.telefono.trim().replace(/[^\d]/g, "") || null,
        sede,
        ultima_visita: manual.ultimaVisita.trim() || null,
        fecha_fin_contrato: manual.finContrato || null,
        mensaje: construirMensaje(manual.nombre.trim(), perfil.nombre, sede, cargoLabel, plantillas),
        subido_por: perfil.nombre,
        cargo_subido_por: cargoLabel,
        creado_por: perfil.id,
        fecha_carga: hoyStr(),
        estado: "Abierto",
      }]);
      setManual({ nombre: "", dni: "", email: "", telefono: "", sede: "", ultimaVisita: "", finContrato: "" });
    } catch (err) {
      alert("No se pudo agregar: " + err.message);
    }
  }

  function descargarPlantilla() {
    const csv = "Nombre,DNI,Email,Telefono,Sede,Ultima Visita,Fin de su contrato\nJuan Pérez,30123456,juan.perez@mail.com,5491122334455,Núñez,15/03/2026,20/09/2026\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "plantilla_socios_megatlon.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  function exportarCSV() {
    const headers = ["Nombre", "DNI", "Email", "Telefono", "Sede", "Fecha carga", "Fecha envio mensaje", "Motivo", "Riesgo", "Proximo seguimiento", "Estado"];
    const filas = casos.map((c) => [c.nombre, c.dni, c.email, c.telefono, c.sede, c.fecha_carga, c.fecha_envio_mensaje, c.motivo, c.riesgo, c.fecha_seguimiento, c.estado]
      .map((v) => `"${(v || "").toString().replace(/"/g, '""')}"`).join(","));
    const csv = headers.join(",") + "\n" + filas.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `seguimiento_sleepers_${hoyStr()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  /* ---------- acciones por fila ---------- */
  async function cambiarCampo(id, campos) {
    try { await actualizarCaso(id, campos); } catch (err) { alert("No se pudo guardar: " + err.message); }
  }
  async function marcarEnvio(c) {
    if (!c.fecha_envio_mensaje) await cambiarCampo(c.id, { fecha_envio_mensaje: hoyStr() });
  }
  function abrirComentarios(c) {
    setModalComentarios(c);
    setNuevoComentario("");
    recargarComentarios(c.id);
  }
  async function enviarComentario() {
    const texto = nuevoComentario.trim();
    if (!texto || !modalComentarios) return;
    try {
      await agregarComentario(modalComentarios.id, { texto, autor: perfil.nombre, cargo: cargoLabel, creadoPor: perfil.id });
      setNuevoComentario("");
      recargarComentarios(modalComentarios.id);
    } catch (err) {
      alert("No se pudo guardar el comentario: " + err.message);
    }
  }

  /* ---------- estadisticas ---------- */
  const stats = useMemo(() => {
    const total = statsSet.length;
    const respondieron = statsSet.filter((c) => c.motivo).length;
    const riesgoAlto = statsSet.filter((c) => c.riesgo === "Alto").length;
    const contacto = statsSet.filter((c) => contactoPersonal(c.motivo, c.riesgo) === "si").length;
    const recuperados = statsSet.filter((c) => c.estado === "Cerrado").length;
    const sinRespuesta = statsSet.filter((c) => alarmaDe(c).color === T.red).length;
    const reincidentes = statsSet.filter((c) => conteoClave[norm(c.dni) || norm(c.email) || norm(c.nombre)] > 1).length;
    return { total, respondieron, riesgoAlto, contacto, recuperados, sinRespuesta, reincidentes };
  }, [statsSet, conteoClave]);

  const motivoCounts = useMemo(() => {
    const m = {}; MOTIVOS.forEach((x) => { m[x] = 0; });
    statsSet.forEach((c) => { if (c.motivo) m[c.motivo] = (m[c.motivo] || 0) + 1; });
    return m;
  }, [statsSet]);
  const riesgoCounts = useMemo(() => {
    const r = { Alto: 0, Medio: 0, Bajo: 0 };
    statsSet.forEach((c) => { if (c.riesgo && r[c.riesgo] !== undefined) r[c.riesgo]++; });
    return r;
  }, [statsSet]);

  const comparativa = useMemo(() => {
    const sedes = [...new Set(casos.map((c) => c.sede).filter(Boolean))].sort();
    return sedes.map((sede) => {
      const lista = casos.filter((c) => c.sede === sede);
      const total = lista.length;
      const respondieron = lista.filter((c) => c.motivo).length;
      const riesgoAlto = lista.filter((c) => c.riesgo === "Alto").length;
      const cerrados = lista.filter((c) => c.estado === "Cerrado").length;
      const reincidentes = lista.filter((c) => conteoClave[norm(c.dni) || norm(c.email) || norm(c.nombre)] > 1).length;
      const totalSocios = totales[sede] || null;
      return {
        sede, total, respondieron,
        tasaResp: total ? Math.round((respondieron / total) * 100) : 0,
        riesgoAlto, reincidentes, abiertos: total - cerrados, cerrados,
        tasaRecup: total ? Math.round((cerrados / total) * 100) : 0,
        totalSocios, pctCartera: totalSocios ? Math.round((total / totalSocios) * 1000) / 10 : null,
      };
    }).sort((a, b) => b.tasaRecup - a.tasaRecup);
  }, [casos, totales, conteoClave]);
  const mejorRecup = Math.max(0, ...comparativa.map((s) => s.tasaRecup));

  const s = estilos;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <div style={{ fontSize: 13, textTransform: "uppercase", fontWeight: 800, letterSpacing: "-.01em", color: T.inkSoft }}>Seguimiento de sleepers</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setManualAbierto((v) => !v)} style={s.ghostBtn}>{manualAbierto ? "Ocultar manual" : "Manual de uso"}</button>
          <button onClick={() => setEvalAbierta((v) => !v)} style={s.ghostBtn}>{evalAbierta ? "Ocultar evaluación" : "Evaluación"}</button>
        </div>
      </div>

      {manualAbierto && (
        <div style={{ background: T.surface, border: "1px solid " + T.line, borderRadius: 16, padding: 20, marginBottom: 22, fontSize: 12.5, color: T.inkSoft, lineHeight: 1.65 }}>
          <p style={{ color: T.ink, fontWeight: 700, marginBottom: 6 }}>Qué es esta pantalla</p>
          <p>Acá cargás y hacés seguimiento a los socios que dejaron de asistir ("sleepers"), hasta que vuelven a entrenar o se decide dar el caso por perdido. Cada gerente ve y trabaja los socios de su propia sede; Dirección ve todas.</p>
          <p style={{ color: T.ink, fontWeight: 700, margin: "14px 0 6px" }}>Cargar socios</p>
          <p>Con el botón "Back office" de arriba: por planilla (Excel, CSV o JSON — reconoce las columnas Nombre, DNI, Email, Teléfono, Sede, Última Visita y Fin de contrato sin importar mayúsculas ni el orden) o cargando uno a la vez a mano.</p>
          <p style={{ color: T.ink, fontWeight: 700, margin: "14px 0 6px" }}>El semáforo de alarma</p>
          <p><b style={{ color: T.ink }}>Verde</b>: recién cargado, sin contacto todavía. <b style={{ color: T.ink }}>Amarillo</b>: día 1 a 5, o ya hubo alguna interacción (mensaje enviado, motivo, riesgo, comentario o seguimiento programado). <b style={{ color: T.ink }}>Rojo</b>: 6 días o más sin ningún contacto. <b style={{ color: T.ink }}>Verde con tilde</b>: caso Cerrado (recuperado).</p>
          <p style={{ color: T.ink, fontWeight: 700, margin: "14px 0 6px" }}>Motivo y riesgo automático</p>
          <p>Al cargar el motivo por el que dejó de venir, el riesgo (Alto/Medio/Bajo) se calcula solo y queda bloqueado — no se puede tocar a mano mientras haya un motivo cargado.</p>
          <p style={{ color: T.ink, fontWeight: 700, margin: "14px 0 6px" }}>Vencimiento de contrato</p>
          <p>Si el socio tiene cargada la fecha de fin de contrato y le quedan 90 días o menos (o ya venció), la fila se marca con un marco rojo — distinto del rojo del semáforo, que es por falta de respuesta.</p>
          <p style={{ color: T.ink, fontWeight: 700, margin: "14px 0 6px" }}>Contacto</p>
          <p>Los botones de WhatsApp y Email abren el chat o el mail con un mensaje ya redactado y personalizado. El email sale sin la firma final (tu cliente de correo ya agrega la suya); WhatsApp sí lleva la firma completa. El primer envío queda registrado con fecha.</p>
          <p style={{ color: T.ink, fontWeight: 700, margin: "14px 0 6px" }}>Comentarios y estado</p>
          <p>Podés ir agregando todos los comentarios que hagan falta por socio, con fecha y quién lo escribió. El estado (Abierto/Cerrado) marca si el caso sigue en seguimiento o ya se resolvió — cerrar no borra la información, solo deja de aparecer en el filtro "Abiertos" por defecto.</p>
          <p style={{ color: T.ink, fontWeight: 700, margin: "14px 0 6px" }}>Quién puede corregir o eliminar</p>
          <p>Corregir nombre, DNI, email, teléfono o sede: Dirección o Gerente, desde la solapa Administrador. Eliminar un socio: exclusivo de Dirección.</p>
          <p style={{ color: T.ink, fontWeight: 700, margin: "14px 0 6px" }}>Protocolo de respuesta según el motivo</p>
          <p><b style={{ color: T.ink }}>Compensar meses por enfermedad o mudanza:</b> siempre se pide el certificado correspondiente — de cambio de domicilio en caso de mudanza, o certificado médico en caso de enfermedad.</p>
          <p><b style={{ color: T.ink }}>Problemas con el servicio</b> (saturación, falta de máquinas, etc.): siempre se busca presentarle un profesor al socio para que le genere una variante en su plan de entrenamiento.</p>
          <p><b style={{ color: T.ink }}>Temas de salud:</b> se adapta la actividad y el plan de entrenamiento según la necesidad puntual. Por ejemplo: problemas de articulaciones → ofrecer pileta; necesita rehabilitación → asignar un profesor; rehabilitación cardiopulmonar → generar actividades nuevas acordes.</p>
        </div>
      )}

      {evalAbierta && <Evaluacion perfil={perfil} onCerrar={() => setEvalAbierta(false)} />}

      {puedeCargar && (
        <div style={{ marginBottom: 22 }}>
          <button onClick={() => { setBoTocado(true); setBoAbierto((v) => !v); }} style={{
            width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
            background: T.surface, border: "1px solid " + T.line, borderRadius: boAbierto ? "16px 16px 0 0" : 16,
            padding: "12px 16px", color: T.ink, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: FUENTE,
          }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}><IconoCarpeta tam={18} /> Back office — cargar nueva planilla de socios</span>
            <span style={{ transform: boAbierto ? "rotate(180deg)" : "none", transition: "transform .2s" }}><IconoFlechaAbajo /></span>
          </button>
          {boAbierto && (
            <div style={{ border: "1px solid " + T.line, borderTop: "none", borderRadius: "0 0 16px 16px", padding: 20, background: T.surface }}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                <label style={{ ...btnMarca, display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <IconoSubir /> Elegir archivo (.xlsx, .csv o .json)
                  <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.json" onChange={onFileChange} style={{ display: "none" }} />
                </label>
                <button style={s.ghostBtn} onClick={descargarPlantilla}><IconoBajar /> Descargar planilla modelo</button>
                <button style={s.ghostBtn} onClick={exportarCSV}><IconoBajar /> Exportar datos actuales (CSV)</button>
              </div>
              <p style={{ fontSize: 11.5, color: T.inkSoft, margin: "0 0 16px" }}>
                Columnas esperadas: <b style={{ color: T.ink }}>Nombre</b>, <b style={{ color: T.ink }}>DNI</b> (opcional), <b style={{ color: T.ink }}>Email</b>, <b style={{ color: T.ink }}>Teléfono</b>, <b style={{ color: T.ink }}>Sede</b>, <b style={{ color: T.ink }}>Última Visita</b> (opcional), <b style={{ color: T.ink }}>Fin de su contrato</b> (opcional — si vence en 90 días o menos, la fila se marca en rojo).
                {!esDireccion && " Como no sos Dirección, se cargan automáticamente en tu sede."}
              </p>

              {pendientes.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Vista previa ({pendientes.length} filas)</p>
                  <div style={{ maxHeight: 220, overflow: "auto", border: "1px solid " + T.line, borderRadius: 11 }}>
                    <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                      <thead><tr>{["Nombre", "DNI", "Email", "Teléfono", "Sede", "Fin contrato"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: 8, color: T.inkSoft, borderBottom: "1px solid " + T.line }}>{h}</th>
                      ))}</tr></thead>
                      <tbody>{pendientes.map((r, i) => (
                        <tr key={i}>
                          <td style={s.td}>{r.nombre}</td><td style={s.td}>{r.dni || "—"}</td>
                          <td style={s.td}>{r.email || "—"}</td><td style={s.td}>{r.telefono || "—"}</td>
                          <td style={s.td}>{r.sede || "—"}</td><td style={s.td}>{fmt(r.fechaFinContrato) || "—"}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                    <button style={btnVerde} onClick={confirmarCarga}><IconoCheckCirculo /> Confirmar carga</button>
                    <button style={btnOut} onClick={() => setPendientes([])}>Cancelar</button>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 12, color: T.inkSoft, fontSize: 11.5, textTransform: "uppercase", margin: "20px 0 14px" }}>
                <div style={{ flex: 1, height: 1, background: T.line }} /> o cargá un socio manualmente <div style={{ flex: 1, height: 1, background: T.line }} />
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ flex: 1, minWidth: 140 }}><label style={lab}>Nombre</label><input style={inp} value={manual.nombre} onChange={(e) => setManual({ ...manual, nombre: e.target.value })} placeholder="Nombre y apellido" /></div>
                <div style={{ flex: 1, minWidth: 100 }}><label style={lab}>DNI</label><input style={inp} value={manual.dni} onChange={(e) => setManual({ ...manual, dni: e.target.value })} /></div>
                <div style={{ flex: 1, minWidth: 140 }}><label style={lab}>Email</label><input style={inp} value={manual.email} onChange={(e) => setManual({ ...manual, email: e.target.value })} /></div>
                <div style={{ flex: 1, minWidth: 140 }}><label style={lab}>Teléfono</label><input style={inp} value={manual.telefono} onChange={(e) => setManual({ ...manual, telefono: e.target.value })} /></div>
                {esDireccion && <div style={{ flex: 1, minWidth: 120 }}><label style={lab}>Sede</label><input style={inp} value={manual.sede} onChange={(e) => setManual({ ...manual, sede: e.target.value })} placeholder={perfil.sede || ""} /></div>}
                <div style={{ flex: 1, minWidth: 120 }}><label style={lab}>Última visita</label><input style={inp} value={manual.ultimaVisita} onChange={(e) => setManual({ ...manual, ultimaVisita: e.target.value })} placeholder="Opcional" /></div>
                <div style={{ flex: 1, minWidth: 140 }}><label style={lab}>Fin de contrato</label><input type="date" style={inp} value={manual.finContrato} onChange={(e) => setManual({ ...manual, finContrato: e.target.value })} /></div>
                <button style={{ ...btnVerde, alignSelf: "flex-end" }} onClick={agregarManual}><IconoMas /> Agregar socio</button>
              </div>
            </div>
          )}
        </div>
      )}

      <PanelFiltrosYListado
        casos={casos} filtrados={filtrados} statsSet={statsSet} stats={stats}
        motivoCounts={motivoCounts} riesgoCounts={riesgoCounts} conteoIntencion={conteoIntencion}
        filtroSede={filtroSede} setFiltroSede={setFiltroSede}
        filtroEstado={filtroEstado} setFiltroEstado={setFiltroEstado}
        busqueda={busqueda} setBusqueda={setBusqueda}
        filtroRiesgo={filtroRiesgo} setFiltroRiesgo={setFiltroRiesgo}
        filtroIntencion={filtroIntencion} setFiltroIntencion={setFiltroIntencion}
        filtroFinDesde={filtroFinDesde} setFiltroFinDesde={setFiltroFinDesde}
        filtroFinHasta={filtroFinHasta} setFiltroFinHasta={setFiltroFinHasta}
        filtroSegDesde={filtroSegDesde} setFiltroSegDesde={setFiltroSegDesde}
        filtroSegHasta={filtroSegHasta} setFiltroSegHasta={setFiltroSegHasta}
        sedesDisponibles={sedesDisponibles} conteoClave={conteoClave}
        esDireccion={esDireccion} puedeEditarIdentidad={puedeEditarIdentidad}
        comparativa={comparativa} mejorRecup={mejorRecup} totales={totales} guardarTotal={guardarTotal}
        onVerMensaje={(c) => setModalMensaje(c)}
        onComentarios={abrirComentarios}
        onCambiarCampo={cambiarCampo}
        onMarcarEnvio={marcarEnvio}
      />

      {modalMensaje && (
        <Modal onClose={() => setModalMensaje(null)} titulo={modalMensaje.nombre} subtitulo="Mensaje que se envía por WhatsApp o email">
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: FUENTE, fontSize: 13, lineHeight: 1.6, color: T.ink, margin: 0 }}>{modalMensaje.mensaje}</pre>
        </Modal>
      )}

      {modalComentarios && (
        <Modal onClose={() => setModalComentarios(null)} titulo={modalComentarios.nombre} subtitulo="Historial de comentarios — cargá los que necesites hasta cerrar el caso.">
          <div>
            {(comentariosPorCaso[modalComentarios.id] || []).length === 0 && (
              <p style={{ fontSize: 12.5, color: T.inkSoft, padding: "8px 0 16px" }}>Todavía no hay comentarios cargados para este socio.</p>
            )}
            {(comentariosPorCaso[modalComentarios.id] || []).map((cm) => (
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
        </Modal>
      )}
    </div>
  );
}

/* ============================================================
   Filtros + estadisticas + graficos + comparativa + tabla
   ============================================================ */
function PanelFiltrosYListado({
  casos, filtrados, statsSet, stats, motivoCounts, riesgoCounts, conteoIntencion,
  filtroSede, setFiltroSede, filtroEstado, setFiltroEstado, busqueda, setBusqueda,
  filtroRiesgo, setFiltroRiesgo, filtroIntencion, setFiltroIntencion,
  filtroFinDesde, setFiltroFinDesde, filtroFinHasta, setFiltroFinHasta,
  filtroSegDesde, setFiltroSegDesde, filtroSegHasta, setFiltroSegHasta,
  sedesDisponibles, conteoClave, esDireccion, puedeEditarIdentidad,
  comparativa, mejorRecup, totales, guardarTotal,
  onVerMensaje, onComentarios, onCambiarCampo, onMarcarEnvio,
}) {
  const s = estilos;
  const maxMotivo = Math.max(1, ...Object.values(motivoCounts));
  const maxRiesgo = Math.max(1, ...Object.values(riesgoCounts));
  const maxCargados = Math.max(1, ...comparativa.map((c) => c.total));
  const maxIntencion = Math.max(1, conteoIntencion.Si, conteoIntencion.No, conteoIntencion.SinDefinir);
  const hayFiltrosExtra = filtroRiesgo || filtroIntencion || filtroFinDesde || filtroFinHasta || filtroSegDesde || filtroSegHasta;

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 10 }}>
        <div style={{ minWidth: 160 }}>
          <label style={lab}>Sede</label>
          <select style={inp} value={filtroSede} onChange={(e) => setFiltroSede(e.target.value)}>
            <option value="">Todas</option>
            {sedesDisponibles.map((sd) => <option key={sd} value={sd}>{sd}</option>)}
          </select>
        </div>
        <div style={{ minWidth: 160 }}>
          <label style={lab}>Estado</label>
          <select style={inp} value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
            <option value="Abierto">Abiertos</option>
            <option value="Cerrado">Cerrados</option>
            <option value="">Todos</option>
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={lab}>Buscar</label>
          <input style={inp} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre, DNI o email..." />
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 10 }}>
        <div style={{ minWidth: 140 }}>
          <label style={lab}>Riesgo</label>
          <select style={inp} value={filtroRiesgo} onChange={(e) => setFiltroRiesgo(e.target.value)}>
            <option value="">Todos</option><option value="Alto">Alto</option><option value="Medio">Medio</option><option value="Bajo">Bajo</option>
          </select>
        </div>
        <div style={{ minWidth: 160 }}>
          <label style={lab}>Intención de volver</label>
          <select style={inp} value={filtroIntencion} onChange={(e) => setFiltroIntencion(e.target.value)}>
            <option value="">Todas</option><option value="Si">Sí</option><option value="No">No</option><option value="SinDefinir">Sin definir</option>
          </select>
        </div>
        <div style={{ minWidth: 150 }}>
          <label style={lab}>Fin de contrato desde</label>
          <input type="date" style={inp} value={filtroFinDesde} onChange={(e) => setFiltroFinDesde(e.target.value)} />
        </div>
        <div style={{ minWidth: 150 }}>
          <label style={lab}>Fin de contrato hasta</label>
          <input type="date" style={inp} value={filtroFinHasta} onChange={(e) => setFiltroFinHasta(e.target.value)} />
        </div>
        <div style={{ minWidth: 150 }}>
          <label style={lab}>Próximo seguimiento desde</label>
          <input type="date" style={inp} value={filtroSegDesde} onChange={(e) => setFiltroSegDesde(e.target.value)} />
        </div>
        <div style={{ minWidth: 150 }}>
          <label style={lab}>Próximo seguimiento hasta</label>
          <input type="date" style={inp} value={filtroSegHasta} onChange={(e) => setFiltroSegHasta(e.target.value)} />
        </div>
        {hayFiltrosExtra && (
          <button style={s.ghostBtn} onClick={() => { setFiltroRiesgo(""); setFiltroIntencion(""); setFiltroFinDesde(""); setFiltroFinHasta(""); setFiltroSegDesde(""); setFiltroSegHasta(""); }}>
            <IconoX /> Limpiar filtros
          </button>
        )}
      </div>
      <p style={{ fontSize: 11.5, color: T.inkSoft, margin: "-4px 0 12px" }}>Las estadísticas siempre muestran el total de socios (incluye recuperados y dados de baja). El filtro de Estado solo afecta al listado de abajo — el resto de los filtros afecta a todo.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 26 }}>
        <StatCard n={stats.total} l="Total de socios" color={T.marca} />
        <StatCard n={stats.respondieron} l="Respondieron motivo" />
        <StatCard n={stats.riesgoAlto} l="Riesgo alto" color={T.amber} />
        <StatCard n={stats.contacto} l="Requieren contacto" color={T.red} />
        <StatCard n={stats.sinRespuesta} l="Sin respuesta (+5 días)" color={T.red} dot />
        <StatCard n={stats.recuperados} l="Recuperados" color={T.green} />
        <StatCard n={stats.reincidentes} l="Reincidentes" color={stats.reincidentes > 0 ? T.red : T.line} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={s.card}>
          <p style={s.sectionTitle}>Distribución por motivo</p>
          {MOTIVOS.map((m) => <BarRow key={m} label={m} val={motivoCounts[m]} max={maxMotivo} color={T.marca} />)}
        </div>
        <div style={s.card}>
          <p style={s.sectionTitle}>Nivel de riesgo</p>
          {Object.keys(riesgoCounts).map((r) => (
            <BarRow key={r} label={r} val={riesgoCounts[r]} max={maxRiesgo}
              color={r === "Alto" ? T.red : r === "Medio" ? T.amber : T.green} />
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 30 }}>
        <div style={s.card}>
          <p style={s.sectionTitle}>Intención de volver — total</p>
          <BarRow label="Total respondió" val={conteoIntencion.Si + conteoIntencion.No} max={Math.max(1, statsSet.length)} color={T.marca} />
          <BarRow label="Sí" val={conteoIntencion.Si} max={Math.max(1, statsSet.length)} color={T.green} />
          <BarRow label="No" val={conteoIntencion.No} max={Math.max(1, statsSet.length)} color={T.red} />
          <BarRow label="Sin definir" val={conteoIntencion.SinDefinir} max={Math.max(1, statsSet.length)} color={T.line} />
        </div>
        <div style={s.card}>
          <p style={s.sectionTitle}>Intención de volver — Sí vs No</p>
          <BarRow label="Sí" val={conteoIntencion.Si} max={maxIntencion} color={T.green} />
          <BarRow label="No" val={conteoIntencion.No} max={maxIntencion} color={T.red} />
          <p style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 10 }}>
            {conteoIntencion.Si + conteoIntencion.No > 0
              ? `${Math.round((conteoIntencion.Si / (conteoIntencion.Si + conteoIntencion.No)) * 100)}% de los que respondieron dicen que sí vuelven.`
              : "Todavía nadie respondió esta pregunta."}
          </p>
        </div>
      </div>

      {esDireccion && comparativa.length > 0 && (
        <>
          <p style={s.sectionTitle}><IconoTrofeo tam={18} /> Comparativa entre sedes</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div style={s.card}>
              <p style={{ ...s.sectionTitle, marginBottom: 14 }}>Sleepers cargados por sede</p>
              {comparativa.map((c) => <BarRow key={c.sede} label={c.sede} val={c.total} max={maxCargados} color={T.marca} />)}
            </div>
            <div style={s.card}>
              <p style={{ ...s.sectionTitle, marginBottom: 14 }}>Tasa de recuperación por sede (%)</p>
              {comparativa.map((c) => <BarRow key={c.sede} label={c.sede} val={c.tasaRecup} max={100} color={T.green} suffix="%" />)}
            </div>
          </div>
          <div style={{ ...s.tableWrap, marginBottom: 30, overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
              <thead><tr>{["Sede", "Cargados", "Socios totales", "% cartera", "Respondieron", "Tasa resp.", "Riesgo alto", "Reincid.", "Abiertos", "Cerrados", "Tasa recup."].map((h) => (
                <th key={h} style={s.th}>{h}</th>
              ))}</tr></thead>
              <tbody>{comparativa.map((c) => (
                <tr key={c.sede}>
                  <td style={s.td}><b>{c.sede}</b>{c.tasaRecup === mejorRecup && mejorRecup > 0 && <Badge tone="green">Mejor recuperación</Badge>}</td>
                  <td style={s.td}>{c.total}</td>
                  <td style={s.td}><input style={{ ...inp, width: 90, padding: "4px 8px", fontSize: 12 }} defaultValue={c.totalSocios ?? ""} placeholder="Cargar"
                    onBlur={(e) => { const v = parseInt(e.target.value.replace(/\D/g, ""), 10); if (v > 0) guardarTotal(c.sede, v); }} /></td>
                  <td style={s.td}>{c.pctCartera !== null ? c.pctCartera + "%" : "—"}</td>
                  <td style={s.td}>{c.respondieron}</td>
                  <td style={s.td}>{c.tasaResp}%</td>
                  <td style={s.td}>{c.riesgoAlto}</td>
                  <td style={s.td}>{c.reincidentes}</td>
                  <td style={s.td}>{c.abiertos}</td>
                  <td style={s.td}>{c.cerrados}</td>
                  <td style={s.td}>{c.tasaRecup}%</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}

      <p style={s.sectionTitle}>Listado de socios</p>
      <div style={{ ...s.tableWrap, overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <thead><tr>{["Alarma", "Socio", "Contacto", "Mensaje", "Motivo", "Riesgo", "Fin contrato", "Intención de volver", "Fecha carga", "Próximo seguimiento", "Estado", "Comentarios"].map((h) => (
            <th key={h} style={s.th}>{h}</th>
          ))}</tr></thead>
          <tbody>
            {filtrados.length === 0 && (
              <tr><td colSpan={12} style={{ padding: 40, textAlign: "center", color: T.inkSoft, fontSize: 13 }}>
                {casos.length ? "No hay socios que coincidan con el filtro actual." : "Todavía no cargaste ningún socio."}
              </td></tr>
            )}
            {filtrados.map((c) => {
              const key = norm(c.dni) || norm(c.email) || norm(c.nombre);
              const isDup = conteoClave[key] > 1;
              const alarma = alarmaDe(c);
              const hasPhone = c.telefono && c.telefono.length > 5;
              const hasEmail = c.email && c.email.includes("@");
              const vencido = c.fecha_seguimiento && c.fecha_seguimiento <= hoyStr() && c.estado === "Abierto";
              const porVencerContrato = contratoPorVencer(c);
              const riesgoColor = c.riesgo === "Alto" ? T.red : c.riesgo === "Medio" ? T.amber : c.riesgo === "Bajo" ? T.green : null;
              return (
                <tr key={c.id} style={{
                  opacity: c.estado === "Cerrado" ? 0.55 : 1,
                  background: isDup ? "rgba(255,69,58,0.06)" : "transparent",
                  outline: porVencerContrato ? "2px solid " + T.red : "none",
                  outlineOffset: "-2px",
                }}>
                  <td style={s.td}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 700, padding: "4px 9px", borderRadius: 999, background: alarma.bg, color: alarma.color }}>
                        {alarma.check ? <IconoCheckCirculo tam={13} /> : <span style={{ width: 9, height: 9, borderRadius: "50%", background: alarma.color, display: "inline-block" }} />}
                        {alarma.label}
                      </span>
                      {riesgoColor && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: riesgoColor + "26", color: riesgoColor }}>
                          Riesgo {c.riesgo}
                        </span>
                      )}
                      {porVencerContrato && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: T.redSoft, color: T.red, display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <IconoAlerta tam={11} /> Vence contrato
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={s.td}>
                    {puedeEditarIdentidad ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center", marginBottom: 4 }}>
                        <input defaultValue={c.nombre} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.nombre) onCambiarCampo(c.id, { nombre: v }); }}
                          style={{ ...inp, padding: "4px 7px", fontSize: 13, fontWeight: 600, width: 140 }} />
                        <input defaultValue={c.dni || ""} placeholder="DNI" onBlur={(e) => { const v = e.target.value.trim(); if (v !== (c.dni || "")) onCambiarCampo(c.id, { dni: v || null }); }}
                          style={{ ...inp, padding: "4px 7px", fontSize: 12, width: 90 }} />
                      </div>
                    ) : (
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{c.nombre}{c.dni && <span style={{ color: T.inkSoft, fontWeight: 500, fontSize: 12 }}> · DNI {c.dni}</span>}</div>
                    )}
                    {puedeEditarIdentidad ? (
                      <input defaultValue={c.sede} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.sede) onCambiarCampo(c.id, { sede: v }); }}
                        style={{ ...inp, padding: "4px 7px", fontSize: 11.5, width: 130, marginBottom: 4 }} />
                    ) : (
                      <Badge tone="gris">{c.sede || "—"}</Badge>
                    )}
                    {isDup && <span style={{ marginLeft: 6 }}><Badge tone="red">Reincidente ({conteoClave[key]})</Badge></span>}
                    {c.subido_por && <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 2 }}>Cargado por: {c.subido_por}{c.cargo_subido_por ? " · " + c.cargo_subido_por : ""}</div>}
                  </td>
                  <td style={s.td}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {hasPhone
                        ? <a href={waLink(c.telefono, c.mensaje)} target="_blank" rel="noreferrer" onClick={() => onMarcarEnvio(c)}
                            style={{ display: "inline-flex", alignItems: "center", gap: 6, background: T.green, color: T.sobreClaro, textDecoration: "none", fontSize: 11.5, fontWeight: 700, padding: "7px 11px", borderRadius: 11 }}>
                            <IconoChat /> WhatsApp
                          </a>
                        : <span style={{ ...s.disabledBtn }}>Sin teléfono</span>}
                      {hasEmail
                        ? <a href={mailLink(c.email, c.nombre, c.mensaje)} onClick={() => onMarcarEnvio(c)}
                            style={{ display: "inline-flex", alignItems: "center", gap: 6, background: T.surface2, color: T.ink, textDecoration: "none", fontSize: 11.5, fontWeight: 700, padding: "7px 11px", borderRadius: 11, border: "1px solid " + T.line }}>
                            <IconoMail /> Email
                          </a>
                        : <span style={s.disabledBtn}><IconoMail /> Sin email</span>}
                    </div>
                    <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 4 }}>{c.fecha_envio_mensaje ? "Enviado: " + fmt(c.fecha_envio_mensaje) : "Sin enviar"}</div>
                    {puedeEditarIdentidad ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                        <input defaultValue={c.email || ""} placeholder="Email" onBlur={(e) => { const v = e.target.value.trim(); if (v !== (c.email || "")) onCambiarCampo(c.id, { email: v || null }); }}
                          style={{ ...inp, padding: "4px 7px", fontSize: 11 }} />
                        <input defaultValue={c.telefono || ""} placeholder="Teléfono" onBlur={(e) => { const v = e.target.value.trim().replace(/[^\d]/g, ""); if (v !== (c.telefono || "")) onCambiarCampo(c.id, { telefono: v || null }); }}
                          style={{ ...inp, padding: "4px 7px", fontSize: 11 }} />
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: T.inkSoft }}>{c.email || "—"}</div>
                    )}
                  </td>
                  <td style={s.td}><button style={s.smallBtn} onClick={() => onVerMensaje(c)}>Ver mensaje</button></td>
                  <td style={s.td}>
                    <select style={{ ...inp, padding: "6px 8px", fontSize: 12 }} value={c.motivo || ""}
                      onChange={(e) => {
                        const motivo = e.target.value;
                        const riesgo = motivo ? (RIESGO_POR_MOTIVO[motivo] || "") : "";
                        onCambiarCampo(c.id, { motivo, riesgo, fecha_motivo_riesgo: hoyStr() });
                      }}>
                      <option value="">—</option>
                      {MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </td>
                  <td style={s.td}>
                    <select style={{ ...inp, padding: "6px 8px", fontSize: 12, opacity: c.motivo ? 0.6 : 1, cursor: c.motivo ? "not-allowed" : "pointer" }}
                      value={c.riesgo || ""} disabled={!!c.motivo}
                      title={c.motivo ? "Se calcula solo según el motivo. Borrá el motivo para editarlo a mano." : ""}
                      onChange={(e) => onCambiarCampo(c.id, { riesgo: e.target.value, fecha_motivo_riesgo: hoyStr() })}>
                      <option value="">—</option><option value="Alto">Alto</option><option value="Medio">Medio</option><option value="Bajo">Bajo</option>
                    </select>
                  </td>
                  <td style={{ ...s.td, color: porVencerContrato ? T.red : T.inkSoft, fontWeight: porVencerContrato ? 700 : 400 }}>{fmt(c.fecha_fin_contrato)}</td>
                  <td style={s.td}>
                    <select style={{ ...inp, padding: "6px 8px", fontSize: 12 }} value={c.intencion_volver || ""}
                      onChange={(e) => onCambiarCampo(c.id, { intencion_volver: e.target.value || null })}>
                      <option value="">Sin definir</option><option value="Si">Sí</option><option value="No">No</option>
                    </select>
                  </td>
                  <td style={{ ...s.td, color: T.inkSoft }}>{fmt(c.fecha_carga)}</td>
                  <td style={s.td}>
                    <input type="date" style={{ ...inp, padding: "6px 8px", fontSize: 12 }} value={c.fecha_seguimiento || ""}
                      onChange={(e) => {
                        const anio = parseInt((e.target.value || "").split("-")[0], 10);
                        if (e.target.value && (anio < 2020 || anio > 2100)) {
                          alert("La fecha ingresada no es válida. Usá el calendario para elegirla.");
                          return;
                        }
                        onCambiarCampo(c.id, { fecha_seguimiento: e.target.value || null });
                      }} />
                    {vencido && <div style={{ color: T.amber, fontSize: 10.5, fontWeight: 700, marginTop: 3, display: "flex", alignItems: "center", gap: 4 }}><IconoReloj tam={12} /> Vencido</div>}
                  </td>
                  <td style={s.td}>
                    <select style={{ ...inp, padding: "6px 8px", fontSize: 11.5, fontWeight: 700, background: c.estado === "Cerrado" ? T.greenSoft : T.redSoft, color: c.estado === "Cerrado" ? T.green : T.red }}
                      value={c.estado} onChange={(e) => onCambiarCampo(c.id, { estado: e.target.value })}>
                      <option value="Abierto">Abierto</option><option value="Cerrado">Cerrado</option>
                    </select>
                  </td>
                  <td style={s.td}>
                    <button style={s.smallBtn} onClick={() => onComentarios(c)}>
                      <IconoChat /> Comentarios {c._numComentarios > 0 && <span style={{ background: T.marca, color: "#fff", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 7, marginLeft: 4 }}>{c._numComentarios}</span>}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function Modal({ onClose, titulo, subtitulo, children }) {
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: T.surface, border: "1px solid " + T.line, borderRadius: 16, maxWidth: 520, width: "100%", maxHeight: "80vh", overflowY: "auto", padding: "22px 24px" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>{titulo}</h3>
        <p style={{ fontSize: 12, color: T.inkSoft, marginBottom: 14 }}>{subtitulo}</p>
        {children}
        <button onClick={onClose} style={{ ...btnMarca, marginTop: 16, width: "100%" }}><IconoX /> Cerrar</button>
      </div>
    </div>
  );
}

function StatCard({ n, l, color, dot }) {
  return (
    <div style={{ background: T.surface, border: "1px solid " + T.line, borderLeft: "3px solid " + (color || T.line), borderRadius: 16, padding: "16px 18px" }}>
      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.5px", color: color || T.ink, fontVariantNumeric: "tabular-nums" }}>{n}</div>
      <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 4, textTransform: "uppercase", letterSpacing: ".04em", display: "flex", alignItems: "center", gap: 5 }}>
        {dot && <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.red, display: "inline-block" }} />}{l}
      </div>
    </div>
  );
}

function BarRow({ label, val, max, color, suffix = "" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, fontSize: 13 }}>
      <div style={{ width: 150, flexShrink: 0, color: T.inkSoft, fontSize: 12.5 }}>{label}</div>
      <div style={{ flex: 1, height: 8, background: T.surface2, borderRadius: 5, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${max ? (val / max) * 100 : 0}%`, background: color, borderRadius: 5, transition: "width .3s" }} />
      </div>
      <div style={{ width: 34, textAlign: "right", fontWeight: 700, fontSize: 12.5 }}>{val}{suffix}</div>
    </div>
  );
}

const estilos = {
  card: { background: T.surface, border: "1px solid " + T.line, borderRadius: 16, padding: "18px 20px" },
  sectionTitle: { fontSize: 13, textTransform: "uppercase", letterSpacing: "-.01em", color: T.inkSoft, fontWeight: 800, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 },
  tableWrap: { background: T.surface, border: "1px solid " + T.line, borderRadius: 16 },
  th: { textAlign: "left", fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em", color: T.inkSoft, fontWeight: 700, padding: "9px 8px", borderBottom: "1px solid " + T.line, background: T.surface2, whiteSpace: "nowrap" },
  td: { padding: "9px 8px", borderBottom: "1px solid " + T.line, verticalAlign: "middle" },
  ghostBtn: { display: "inline-flex", alignItems: "center", gap: 8, background: "none", border: "1px solid " + T.line, color: T.ink, padding: "10px 16px", borderRadius: 11, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: FUENTE },
  smallBtn: { display: "inline-flex", alignItems: "center", background: "none", border: "1px solid " + T.line, color: T.ink, fontSize: 11, padding: "6px 10px", borderRadius: 11, cursor: "pointer", fontFamily: FUENTE },
  disabledBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: T.surface2, color: T.inkSoft, fontSize: 11.5, fontWeight: 700, padding: "7px 11px", borderRadius: 11 },
};
