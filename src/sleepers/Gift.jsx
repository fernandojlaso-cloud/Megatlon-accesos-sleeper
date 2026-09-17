import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { T, FUENTE, inp, lab, btnOut, btnVerde, Badge } from "../estilos.jsx";
import { useGift, crearGift, actualizarGift, agregarComentarioGift } from "./datosGift.js";
import { useMensajesPlantillas, construirMensajeGift } from "./datosPlantillas.js";
import {
  IconoSubir, IconoChat, IconoMail, IconoCarpeta, IconoFlechaAbajo,
} from "./iconos.jsx";
import Evaluacion from "./Evaluacion.jsx";

const hoyStr = () => new Date().toISOString().slice(0, 10);
const diasEntre = (desde, hasta) => {
  if (!desde) return 0;
  const d1 = new Date(desde + "T00:00:00");
  const d2 = new Date((hasta || hoyStr()) + "T00:00:00");
  return Math.round((d2 - d1) / 86400000);
};
const norm = (s) => (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[[\]]/g, "").replace(/_/g, " ").trim();
const fmt = (iso) => { if (!iso) return "—"; const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };

function normalizarFecha(valor) {
  if (valor === null || valor === undefined || valor === "") return "";
  if (valor instanceof Date && !isNaN(valor)) {
    const y = valor.getFullYear(), mo = valor.getMonth() + 1, d = valor.getDate();
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  if (typeof valor === "number" && valor > 0 && valor < 100000) {
    const info = XLSX.SSF.parse_date_code(valor);
    if (info && info.y) return `${info.y}-${String(info.m).padStart(2, "0")}-${String(info.d).padStart(2, "0")}`;
  }
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
  const find = (...names) => { for (const k of keys) { if (names.includes(norm(k))) return row[k]; } return ""; };
  const findTxt = (...names) => (find(...names) || "").toString().trim();
  const nombreCombinado = [findTxt("nombre"), findTxt("apellido")].filter(Boolean).join(" ").trim();
  return {
    nombre: findTxt("nombre y apellido", "socio", "cliente") || nombreCombinado,
    dni: findTxt("dni", "documento", "nro documento", "numero de documento", "numero documento", "cedula"),
    email: findTxt("email", "correo", "mail"),
    telefono: findTxt("telefono", "celular", "whatsapp", "tel"),
    sede: findTxt("sede", "sucursal") || defaults.sede,
    fechaActivacion: normalizarFecha(find("inicio", "fecha activacion", "fecha activacion cupon", "activacion", "fecha de activacion")),
    fechaFinCupon: normalizarFecha(find("fin", "fecha fin", "fecha fin cupon", "vencimiento cupon", "vencimiento")),
  };
}

function waLink(telefono, msg) { return "https://wa.me/" + telefono + "?text=" + encodeURIComponent(msg); }
function mailLink(email, nombre, msg) {
  const idxCierre = Math.max(msg.lastIndexOf("Saludos"), msg.lastIndexOf("Aguardo tu respuesta"));
  const cuerpo = idxCierre > -1 ? msg.slice(0, idxCierre).trim() : msg;
  return `mailto:${email}?subject=${encodeURIComponent("Megatlon — tu mes sin cargo")}&body=${encodeURIComponent(cuerpo)}`;
}

const CLAVE_CAMPOS = {
  inicial: { msg: "mensaje_1", fecha: "fecha_envio_1", label: "1. Inicial" },
  confirmacion: { msg: "mensaje_1_confirmacion", fecha: "fecha_envio_1_confirmacion", label: "2. Confirmación" },
  reenvio: { msg: "mensaje_1_reenvio", fecha: "fecha_envio_1_reenvio", label: "3. Reenvío" },
  comercial: { msg: "mensaje_2", fecha: "fecha_envio_2", label: "4. Comercial" },
};

function claveDefault(g) {
  if (!g.fecha_envio_1) return "inicial";
  if (g.dia_hora_coordinado && !g.fecha_envio_1_confirmacion) return "confirmacion";
  if (!g.dia_hora_coordinado && !g.fecha_envio_1_reenvio) return "reenvio";
  if (!g.fecha_envio_2) return "comercial";
  return "inicial";
}

export default function Gift({ perfil, cargoFirma }) {
  const { gift: giftCrudo, comentariosPorGift, recargarComentarios } = useGift();
  const { plantillas: plantillasCrudas } = useMensajesPlantillas();
  const plantillas = useMemo(() => {
    const mapa = {};
    plantillasCrudas.filter((p) => p.activa).forEach((p) => { mapa[`${p.tema}|${p.clave}`] = p.cuerpo; });
    return mapa;
  }, [plantillasCrudas]);

  const esDireccion = perfil.rol === "director";
  const puedeEditarIdentidad = esDireccion || perfil.rol === "gerente";
  const cargoLabel = cargoFirma || {
    director: "Director", gerente: "Gerente",
    gerente_servicio: "Gerente de Servicio", coordinador_servicio: "Coordinador de Servicio", referente_servicio: "Referente de Servicio",
  }[perfil.rol] || "Gerente";

  const [boAbierto, setBoAbierto] = useState(false);
  const [manualAbierto, setManualAbierto] = useState(false);
  const [evalAbierta, setEvalAbierta] = useState(false);
  const [pendientes, setPendientes] = useState([]);
  const fileRef = useRef(null);

  const [filtroSede, setFiltroSede] = useState(esDireccion ? "" : perfil.sede);
  const [filtroEstado, setFiltroEstado] = useState("Abierto");
  const [busqueda, setBusqueda] = useState("");
  const [filtroSeInscribio, setFiltroSeInscribio] = useState("");
  const [filtroVinoAProbar, setFiltroVinoAProbar] = useState("");
  const [filtroActDesde, setFiltroActDesde] = useState("");
  const [filtroActHasta, setFiltroActHasta] = useState("");
  const [filtroEnvio1, setFiltroEnvio1] = useState(false);
  const [filtroRespuesta1, setFiltroRespuesta1] = useState(false);
  const [filtroEnvio2, setFiltroEnvio2] = useState(false);
  const [filtroSeInscribioBucket, setFiltroSeInscribioBucket] = useState(null);
  const [filtroVinoBucket, setFiltroVinoBucket] = useState(false);

  const [numMensajePorCaso, setNumMensajePorCaso] = useState({});
  const [modalMensaje, setModalMensaje] = useState(null);
  const [textoModalMensaje, setTextoModalMensaje] = useState("");
  const [modalComentarios, setModalComentarios] = useState(null);
  const [nuevoComentario, setNuevoComentario] = useState("");

  const sedesDisponibles = useMemo(() => [...new Set(giftCrudo.map((c) => c.sede).filter(Boolean))].sort(), [giftCrudo]);

  function pasaFiltrosBase(c) {
    if (filtroSede && c.sede !== filtroSede) return false;
    const b = norm(busqueda);
    if (b && !(norm(c.nombre).includes(b) || norm(c.dni).includes(b) || norm(c.email).includes(b))) return false;
    if (filtroSeInscribio === "Pendiente" ? !!c.se_inscribio : (filtroSeInscribio && c.se_inscribio !== filtroSeInscribio)) return false;
    if (filtroVinoAProbar === "Pendiente" ? !!c.vino_a_probar : (filtroVinoAProbar && c.vino_a_probar !== filtroVinoAProbar)) return false;
    if (filtroActDesde && (!c.fecha_activacion_cupon || c.fecha_activacion_cupon < filtroActDesde)) return false;
    if (filtroActHasta && (!c.fecha_activacion_cupon || c.fecha_activacion_cupon > filtroActHasta)) return false;
    return true;
  }
  function pasaFiltrosBucket(c) {
    if (filtroEnvio1 && !c.fecha_envio_1) return false;
    if (filtroRespuesta1 && !c.dia_hora_coordinado) return false;
    if (filtroEnvio2 && !c.fecha_envio_2) return false;
    if (filtroSeInscribioBucket && c.se_inscribio !== filtroSeInscribioBucket) return false;
    if (filtroVinoBucket && c.vino_a_probar !== "Si") return false;
    return true;
  }

  const baseParaTortas = useMemo(() => giftCrudo.filter((c) => pasaFiltrosBase(c)),
    [giftCrudo, filtroSede, busqueda, filtroSeInscribio, filtroVinoAProbar, filtroActDesde, filtroActHasta]);

  const statsPies = useMemo(() => ({
    envio1: baseParaTortas.filter((c) => c.fecha_envio_1).length,
    respuesta1: baseParaTortas.filter((c) => c.dia_hora_coordinado).length,
    envio2: baseParaTortas.filter((c) => c.fecha_envio_2).length,
    inscriptoSi: baseParaTortas.filter((c) => c.se_inscribio === "Si").length,
    inscriptoNo: baseParaTortas.filter((c) => c.se_inscribio === "No").length,
    vinoAProbar: baseParaTortas.filter((c) => c.vino_a_probar === "Si").length,
    total: baseParaTortas.length,
  }), [baseParaTortas]);

  const filtrados = useMemo(() => giftCrudo.filter((c) => {
    if (filtroEstado && c.estado !== filtroEstado) return false;
    return pasaFiltrosBase(c) && pasaFiltrosBucket(c);
  }).sort((a, b) => {
    if (!a.fecha_fin_cupon && !b.fecha_fin_cupon) return 0;
    if (!a.fecha_fin_cupon) return 1;
    if (!b.fecha_fin_cupon) return -1;
    return a.fecha_fin_cupon < b.fecha_fin_cupon ? -1 : a.fecha_fin_cupon > b.fecha_fin_cupon ? 1 : 0;
  }), [giftCrudo, filtroSede, filtroEstado, busqueda, filtroSeInscribio, filtroVinoAProbar, filtroActDesde, filtroActHasta,
      filtroEnvio1, filtroRespuesta1, filtroEnvio2, filtroSeInscribioBucket, filtroVinoBucket]);

  function togglePie(setter) { setter((v) => !v); }
  function toggleBucket(valor) { setFiltroSeInscribioBucket((prev) => (prev === valor ? null : valor)); }

  function numMensajeDe(c) { return numMensajePorCaso[c.id] ?? claveDefault(c); }
  function elegirNumMensaje(c, clave) { setNumMensajePorCaso((prev) => ({ ...prev, [c.id]: clave })); }
  function mensajeActivoDe(c) {
    const clave = numMensajeDe(c);
    const campo = CLAVE_CAMPOS[clave].msg;
    if (c[campo]) return c[campo];
    return construirMensajeGift(c.nombre, c.subido_por || perfil.nombre, c.sede, c.cargo_subido_por || cargoLabel, plantillas, clave, c.dia_hora_coordinado || "");
  }
  async function marcarEnvio(c) {
    const clave = numMensajeDe(c);
    const { msg, fecha } = CLAVE_CAMPOS[clave];
    const campos = {};
    if (!c[msg]) campos[msg] = mensajeActivoDe(c);
    if (!c[fecha]) campos[fecha] = hoyStr();
    if (Object.keys(campos).length) await actualizarGift(c.id, campos);
  }
  function abrirMensaje(c) { setModalMensaje(c); setTextoModalMensaje(mensajeActivoDe(c)); }
  async function guardarMensaje() {
    if (!modalMensaje) return;
    const clave = numMensajeDe(modalMensaje);
    try { await actualizarGift(modalMensaje.id, { [CLAVE_CAMPOS[clave].msg]: textoModalMensaje }); setModalMensaje(null); }
    catch (err) { alert(err.message); }
  }
  async function cambiarCampo(id, campos) {
    try { await actualizarGift(id, campos); } catch (err) { alert("No se pudo guardar: " + err.message); }
  }
  async function cambiarSeInscribio(c, valor) {
    await cambiarCampo(c.id, { se_inscribio: valor || null, estado: valor ? "Cerrado" : c.estado });
  }
  function abrirComentarios(c) { setModalComentarios(c); setNuevoComentario(""); recargarComentarios(c.id); }
  async function enviarComentario() {
    const texto = nuevoComentario.trim();
    if (!texto || !modalComentarios) return;
    try {
      await agregarComentarioGift(modalComentarios.id, { texto, autor: perfil.nombre, cargo: cargoLabel, creadoPor: perfil.id });
      setNuevoComentario("");
      recargarComentarios(modalComentarios.id);
    } catch (err) { alert(err.message); }
  }

  async function onFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    let filas = [];
    try {
      if (ext === "csv") {
        const text = await file.text();
        const [head, ...rest] = text.split(/\r?\n/).filter(Boolean);
        const headers = head.split(",").map((h) => h.replace(/"/g, "").trim());
        filas = rest.map((line) => {
          const vals = line.split(",").map((v) => v.replace(/"/g, "").trim());
          const obj = {}; headers.forEach((h, i) => { obj[h] = vals[i]; }); return obj;
        });
      } else if (ext === "json") {
        const text = await file.text();
        const parsed = JSON.parse(text);
        filas = Array.isArray(parsed) ? parsed : (parsed.data || parsed.gift || parsed.rows || []);
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
      nombre: r.nombre, dni: r.dni || null, email: r.email || null, telefono: r.telefono || null,
      sede: r.sede || perfil.sede, fecha_activacion_cupon: r.fechaActivacion || null, fecha_fin_cupon: r.fechaFinCupon || null,
      fecha_carga: hoyStr(), subido_por: perfil.nombre, cargo_subido_por: cargoLabel, creado_por: perfil.id,
    }));
    try { await crearGift(filas); setPendientes([]); alert(`Se cargaron ${filas.length} registro(s).`); }
    catch (err) { alert(err.message); }
  }

  function exportarExcel() {
    const filas = filtrados.map((c) => ({
      Nombre: c.nombre, DNI: c.dni, Email: c.email, Telefono: c.telefono, Sede: c.sede,
      "Fecha activación cupón": c.fecha_activacion_cupon, "Fecha fin cupón": c.fecha_fin_cupon,
      "Día y hora coordinado": c.dia_hora_coordinado, "Vino a probar": c.vino_a_probar, "Se inscribió": c.se_inscribio,
      "Envío 1° (inicial)": c.fecha_envio_1, "Envío confirmación": c.fecha_envio_1_confirmacion,
      "Envío reenvío": c.fecha_envio_1_reenvio, "Envío comercial": c.fecha_envio_2, Estado: c.estado,
    }));
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Gift");
    XLSX.writeFile(wb, `gift_${hoyStr()}.xlsx`);
  }

  const puedeCargar = esDireccion || perfil.rol === "gerente" || perfil.rol === "gerente_servicio";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 13, textTransform: "uppercase", fontWeight: 800, letterSpacing: "-.01em", color: T.inkSoft }}>Gift — mes de regalo a ex-socios</div>
          <p style={{ fontSize: 12, color: T.inkSoft, marginTop: 4 }}>Seguimiento de la campaña de mes sin cargo: coordinación de visita, si vino a probar y si se inscribió.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setManualAbierto((v) => !v)} style={btnOut}>{manualAbierto ? "Ocultar manual" : "Manual de uso"}</button>
          <button onClick={() => setEvalAbierta((v) => !v)} style={btnOut}>{evalAbierta ? "Ocultar evaluación" : "Evaluación"}</button>
        </div>
      </div>

      {manualAbierto && (
        <div style={{ background: T.surface, border: "1px solid " + T.line, borderRadius: 16, padding: 20, marginBottom: 22, fontSize: 12.5, color: T.inkSoft, lineHeight: 1.65 }}>
          <p style={{ color: T.ink, fontWeight: 700, marginBottom: 6 }}>Qué es esta pantalla</p>
          <p>Seguimiento de la campaña de "mes sin cargo" para ex-socios: coordinar la primera visita, registrar si efectivamente vinieron a probar el servicio, y si finalmente se inscribieron.</p>
          <p style={{ color: T.ink, fontWeight: 700, margin: "14px 0 6px" }}>Cargar la base</p>
          <p>Con "Back office": Excel, CSV o JSON, reconociendo Nombre/Apellido, DNI, Email, Teléfono, Sede, y las fechas de <b style={{ color: T.ink }}>Inicio</b> (activación del cupón) y <b style={{ color: T.ink }}>Fin</b> (vencimiento del mes sin cargo).</p>
          <p style={{ color: T.ink, fontWeight: 700, margin: "14px 0 6px" }}>Los 4 mensajes</p>
          <p><b style={{ color: T.ink }}>1. Inicial</b>: apenas se activa el cupón. <b style={{ color: T.ink }}>2. Confirmación</b>: una vez coordinado día y hora de la visita. <b style={{ color: T.ink }}>3. Reenvío</b>: si no respondió el inicial. <b style={{ color: T.ink }}>4. Comercial</b>: la propuesta de asociarse, con el beneficio del descuento. Se elige cuál mandar desde la tarjeta, y se puede editar antes de enviar.</p>
          <p style={{ color: T.ink, fontWeight: 700, margin: "14px 0 6px" }}>Día y hora coordinado</p>
          <p>Campo de texto libre en la tarjeta — al completarlo queda disponible el mensaje de Confirmación, con el día y hora ya insertados en el texto.</p>
          <p style={{ color: T.ink, fontWeight: 700, margin: "14px 0 6px" }}>Vino a probar / Se inscribió</p>
          <p>Dos campos independientes. "Vino a probar" registra si efectivamente se acercó a usar el mes sin cargo. "Se inscribió" cierra el caso automáticamente en cuanto se define (Sí o No) — no hace falta cerrarlo a mano.</p>
          <p style={{ color: T.ink, fontWeight: 700, margin: "14px 0 6px" }}>Quién puede corregir o eliminar</p>
          <p>Corregir nombre, DNI, email, teléfono o sede: Dirección o Gerente. Eliminar un caso: exclusivo de Dirección, desde Administrador.</p>
        </div>
      )}

      {evalAbierta && <Evaluacion perfil={perfil} onCerrar={() => setEvalAbierta(false)} />}

      {puedeCargar && (
        <div style={{ marginBottom: 22 }}>
          <button onClick={() => setBoAbierto((v) => !v)} style={{
            display: "flex", alignItems: "center", gap: 8, width: "100%", background: T.surface, border: "1px solid " + T.line,
            borderRadius: 14, padding: "14px 18px", cursor: "pointer", fontFamily: FUENTE, color: T.ink, fontSize: 13, fontWeight: 700,
          }}>
            <IconoCarpeta /> Back office — cargar nueva base de Gift
            <span style={{ marginLeft: "auto", transform: boAbierto ? "rotate(180deg)" : "none" }}><IconoFlechaAbajo /></span>
          </button>
          {boAbierto && (
            <div style={{ background: T.surface, border: "1px solid " + T.line, borderTop: "none", borderRadius: "0 0 14px 14px", padding: 18 }}>
              <button onClick={() => fileRef.current?.click()} style={btnOut}>
                <IconoSubir /> Elegir archivo (.xlsx, .csv o .json)
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.json" onChange={onFileChange} style={{ display: "none" }} />
              </button>
              <p style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 10 }}>
                Columnas esperadas: <b style={{ color: T.ink }}>Nombre</b> (y Apellido, si vienen separados), <b style={{ color: T.ink }}>DNI</b>, <b style={{ color: T.ink }}>Email</b>, <b style={{ color: T.ink }}>Teléfono</b>, <b style={{ color: T.ink }}>Sede</b>, <b style={{ color: T.ink }}>Inicio</b> (activación del cupón) y <b style={{ color: T.ink }}>Fin</b> (vencimiento del mes sin cargo).
              </p>
              {pendientes.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <p style={{ fontSize: 12.5, marginBottom: 8 }}>{pendientes.length} fila(s) listas para cargar.</p>
                  <button style={btnVerde} onClick={confirmarCarga}>Confirmar carga</button>
                  <button style={{ ...btnOut, marginLeft: 8 }} onClick={() => setPendientes([])}>Cancelar</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 12.5, color: T.inkSoft }}>Total en la vista</div>
          <div style={{ fontSize: 30, fontWeight: 800 }}>{statsPies.total}</div>
        </div>
        <button style={btnOut} onClick={exportarExcel}><IconoFlechaAbajo /> Exportar datos filtrados (Excel)</button>
      </div>

      <p style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".04em", color: T.inkSoft, marginBottom: 8 }}>Tocá para filtrar</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 22 }}>
        {[
          { key: "envio1", label: "Envío mensaje 1", n: statsPies.envio1, color: T.marca, activo: filtroEnvio1, onClick: () => togglePie(setFiltroEnvio1) },
          { key: "resp1", label: "Respuesta mensaje 1 (coordinó)", n: statsPies.respuesta1, color: T.blue, activo: filtroRespuesta1, onClick: () => togglePie(setFiltroRespuesta1) },
          { key: "envio2", label: "Envío mensaje 2", n: statsPies.envio2, color: T.marca, activo: filtroEnvio2, onClick: () => togglePie(setFiltroEnvio2) },
          { key: "vino", label: "Vino a probar", n: statsPies.vinoAProbar, color: T.amber, activo: filtroVinoBucket, onClick: () => togglePie(setFiltroVinoBucket) },
          { key: "si", label: "Se inscribió", n: statsPies.inscriptoSi, color: T.green, activo: filtroSeInscribioBucket === "Si", onClick: () => toggleBucket("Si") },
          { key: "no", label: "No se inscribió", n: statsPies.inscriptoNo, color: T.red, activo: filtroSeInscribioBucket === "No", onClick: () => toggleBucket("No") },
        ].map(({ key, label, n, color, activo, onClick }) => {
          const pct = statsPies.total ? Math.round((n / statsPies.total) * 100) : 0;
          return (
            <button key={key} onClick={onClick}
              style={{ textAlign: "center", background: activo ? T.surface2 : T.surface, border: "1px solid " + (activo ? T.marca : T.line), borderRadius: 12, padding: "12px 8px", cursor: "pointer", fontFamily: FUENTE }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", margin: "0 auto 8px", background: `conic-gradient(${color} 0% ${pct}%, ${T.surface2} ${pct}% 100%)` }} />
              <div style={{ fontSize: 18, fontWeight: 800 }}>{n}</div>
              <div style={{ fontSize: 10.5, color: T.inkSoft }}>{label}</div>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 8 }}>
        <div style={{ minWidth: 160 }}>
          <label style={lab}>Sede</label>
          <select style={inp} value={filtroSede} onChange={(e) => setFiltroSede(e.target.value)} disabled={!esDireccion}>
            <option value="">Todas</option>
            {sedesDisponibles.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ minWidth: 140 }}>
          <label style={lab}>Estado</label>
          <select style={inp} value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
            <option value="Abierto">Abiertos</option>
            <option value="Cerrado">Cerrados</option>
            <option value="">Todos</option>
          </select>
        </div>
        <div style={{ minWidth: 160 }}>
          <label style={lab}>Se inscribió</label>
          <select style={inp} value={filtroSeInscribio} onChange={(e) => setFiltroSeInscribio(e.target.value)}>
            <option value="">Todos</option>
            <option value="Si">Sí</option>
            <option value="No">No</option>
            <option value="Pendiente">Pendiente</option>
          </select>
        </div>
        <div style={{ minWidth: 160 }}>
          <label style={lab}>Vino a probar</label>
          <select style={inp} value={filtroVinoAProbar} onChange={(e) => setFiltroVinoAProbar(e.target.value)}>
            <option value="">Todos</option>
            <option value="Si">Sí</option>
            <option value="No">No</option>
            <option value="Pendiente">Pendiente</option>
          </select>
        </div>
        <div style={{ minWidth: 150 }}>
          <label style={lab}>Activación desde</label>
          <input type="date" style={inp} value={filtroActDesde} onChange={(e) => setFiltroActDesde(e.target.value)} />
        </div>
        <div style={{ minWidth: 150 }}>
          <label style={lab}>Activación hasta</label>
          <input type="date" style={inp} value={filtroActHasta} onChange={(e) => setFiltroActHasta(e.target.value)} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={lab}>Buscar</label>
          <input style={inp} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre, DNI o email..." />
        </div>
      </div>
      <p style={{ fontSize: 11.5, color: T.inkSoft, margin: "0 0 18px" }}>El caso se cierra solo en cuanto definís "Se inscribió" (Sí o No).</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 14 }}>
        {filtrados.length === 0 && (
          <div style={{ gridColumn: "1 / -1", padding: 40, textAlign: "center", color: T.inkSoft, background: T.surface, border: "1px solid " + T.line, borderRadius: 16 }}>
            No hay casos que coincidan con los filtros.
          </div>
        )}
        {filtrados.map((c) => {
          const claveActiva = numMensajeDe(c);
          const campoFecha = CLAVE_CAMPOS[claveActiva].fecha;
          const yaEnviado = !!c[campoFecha];
          const hasPhone = c.telefono && c.telefono.length > 5;
          const hasEmail = c.email && c.email.includes("@");
          const diasFinCupon = c.fecha_fin_cupon ? diasEntre(hoyStr(), c.fecha_fin_cupon) : null;
          return (
            <div key={c.id} style={{ background: T.surface, border: "1px solid " + (c.estado === "Cerrado" ? T.line : T.marca), borderRadius: 16, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{c.nombre}</div>
                  <div style={{ fontSize: 11, color: T.inkSoft }}>DNI {c.dni || "—"}</div>
                </div>
                <Badge tone={c.estado === "Cerrado" ? "green" : "gris"}>{c.estado}</Badge>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                <Badge tone="gris">{c.sede}</Badge>
                {c.fecha_fin_cupon && <Badge tone={diasFinCupon !== null && diasFinCupon <= 7 ? "red" : "amber"}>Cupón vence en {diasFinCupon} días</Badge>}
              </div>
              <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 10 }}>
                Activación: {fmt(c.fecha_activacion_cupon)} · Fin cupón: {fmt(c.fecha_fin_cupon)}
              </div>

              <div style={{ marginBottom: 8 }}>
                <label style={lab}>Día y hora coordinado</label>
                <input defaultValue={c.dia_hora_coordinado || ""} placeholder="Ej: Miércoles 24/09, 18:00"
                  onBlur={(e) => { const v = e.target.value.trim(); if (v !== (c.dia_hora_coordinado || "")) cambiarCampo(c.id, { dia_hora_coordinado: v || null }); }}
                  style={{ ...inp, fontSize: 12.5 }} />
              </div>

              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={lab}>Vino a probar</label>
                  <select style={{ ...inp, fontSize: 12 }} value={c.vino_a_probar || ""} onChange={(e) => cambiarCampo(c.id, { vino_a_probar: e.target.value || null })}>
                    <option value="">Pendiente</option>
                    <option value="Si">Sí</option>
                    <option value="No">No</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lab}>Se inscribió</label>
                  <select style={{ ...inp, fontSize: 12 }} value={c.se_inscribio || ""} onChange={(e) => cambiarSeInscribio(c, e.target.value)}>
                    <option value="">Pendiente</option>
                    <option value="Si">Sí</option>
                    <option value="No">No</option>
                  </select>
                </div>
              </div>

              <label style={lab}>Mensaje a usar</label>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                {Object.entries(CLAVE_CAMPOS).map(([clave, info]) => (
                  <button key={clave} onClick={() => elegirNumMensaje(c, clave)}
                    style={{ fontSize: 10.5, padding: "5px 8px", borderRadius: 9, border: "1px solid " + (claveActiva === clave ? T.marca : T.line),
                      background: claveActiva === clave ? T.surface2 : "transparent", color: claveActiva === clave ? T.marca : T.inkSoft, cursor: "pointer", fontFamily: FUENTE, fontWeight: claveActiva === clave ? 700 : 500 }}>
                    {info.label}{c[info.fecha] ? " ✓" : ""}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                {hasPhone
                  ? <a href={waLink(c.telefono, mensajeActivoDe(c))} target="_blank" rel="noreferrer" onClick={() => marcarEnvio(c)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, background: T.green, color: T.sobreClaro, textDecoration: "none", fontSize: 11.5, fontWeight: 700, padding: "7px 11px", borderRadius: 11 }}>
                      <IconoChat /> WhatsApp
                    </a>
                  : <span style={{ fontSize: 11, color: T.inkSoft }}>Sin teléfono</span>}
                {hasEmail
                  ? <a href={mailLink(c.email, c.nombre, mensajeActivoDe(c))} onClick={() => marcarEnvio(c)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, background: T.surface2, color: T.ink, textDecoration: "none", fontSize: 11.5, fontWeight: 700, padding: "7px 11px", borderRadius: 11, border: "1px solid " + T.line }}>
                      <IconoMail /> Email
                    </a>
                  : <span style={{ fontSize: 11, color: T.inkSoft }}>Sin email</span>}
                <button style={{ ...btnOut, fontSize: 11, padding: "6px 10px" }} onClick={() => abrirMensaje(c)}>Ver / editar</button>
                <button style={{ ...btnOut, fontSize: 11, padding: "6px 10px" }} onClick={() => abrirComentarios(c)}>
                  Comentarios {(comentariosPorGift[c.id] || []).length > 0 ? `(${(comentariosPorGift[c.id] || []).length})` : ""}
                </button>
              </div>
              <div style={{ fontSize: 10.5, color: T.inkSoft }}>{yaEnviado ? "Enviado: " + fmt(c[campoFecha]) : "Sin enviar"}</div>
            </div>
          );
        })}
      </div>

      {modalMensaje && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setModalMensaje(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: T.surface, border: "1px solid " + T.line, borderRadius: 16, maxWidth: 560, width: "100%", maxHeight: "80vh", overflowY: "auto", padding: "22px 24px" }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>{modalMensaje.nombre}</h3>
            <p style={{ fontSize: 12, color: T.inkSoft, marginBottom: 14 }}>{CLAVE_CAMPOS[numMensajeDe(modalMensaje)].label} — lo podés editar antes de enviarlo.</p>
            <textarea style={{ ...inp, resize: "vertical", minHeight: 260, fontFamily: FUENTE, fontSize: 13, lineHeight: 1.6 }}
              value={textoModalMensaje} onChange={(e) => setTextoModalMensaje(e.target.value)} />
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
          <div style={{ background: T.surface, border: "1px solid " + T.line, borderRadius: 16, maxWidth: 480, width: "100%", maxHeight: "80vh", overflowY: "auto", padding: "22px 24px" }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 15 }}>{modalComentarios.nombre}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
              {(comentariosPorGift[modalComentarios.id] || []).map((cm) => (
                <div key={cm.id} style={{ background: T.surface2, borderRadius: 11, padding: "8px 12px" }}>
                  <p style={{ fontSize: 12.5, margin: 0 }}>{cm.texto}</p>
                  <p style={{ fontSize: 10.5, color: T.inkSoft, margin: "4px 0 0" }}>{cm.autor} · {new Date(cm.creado_en).toLocaleDateString("es-AR")}</p>
                </div>
              ))}
              {(comentariosPorGift[modalComentarios.id] || []).length === 0 && <p style={{ fontSize: 12, color: T.inkSoft }}>Sin comentarios todavía.</p>}
            </div>
            <textarea style={{ ...inp, resize: "vertical", minHeight: 70 }} value={nuevoComentario} onChange={(e) => setNuevoComentario(e.target.value)} placeholder="Agregar comentario..." />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button style={btnVerde} onClick={enviarComentario}>Agregar</button>
              <button style={btnOut} onClick={() => setModalComentarios(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
