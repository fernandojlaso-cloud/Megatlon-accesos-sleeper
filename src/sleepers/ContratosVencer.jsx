import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { T, FUENTE, inp, lab, btnMarca, btnOut, btnVerde, Badge } from "../estilos.jsx";
import {
  useSeguimientoContratos, actualizarRegistro, agregarComentarioRegistro,
  parsearContratos, parsearAccesos, parsearNPS, cargarContratos, cargarAccesos, cargarNPS,
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

export default function ContratosVencer({ perfil }) {
  const { registros: crudos, comentariosPorRegistro, recargarComentarios } = useSeguimientoContratos();
  const registros = useMemo(() => crudos.map((r) => ({ ...r, _clasif: clasificar(r), _numComentarios: (comentariosPorRegistro[r.id] || []).length })), [crudos, comentariosPorRegistro]);

  const cargoLabel = {
    director: "Director", gerente: "Gerente",
    gerente_servicio: "Gerente de Servicio", coordinador_servicio: "Coordinador de Servicio", referente_servicio: "Referente de Servicio",
  }[perfil.rol] || "Gerente";
  const puedeCargar = ["director", "gerente", "gerente_servicio", "coordinador_servicio", "referente_servicio"].includes(perfil.rol);

  const [boAbierto, setBoAbierto] = useState(false);
  const [cargando, setCargando] = useState(null);
  const [resultadoCarga, setResultadoCarga] = useState(null);
  const refContratos = useRef(null);
  const refAccesos = useRef(null);
  const refNPS = useRef(null);

  const [filtroSede, setFiltroSede] = useState("");
  const [filtroClasif, setFiltroClasif] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("Abierto");
  const [busqueda, setBusqueda] = useState("");
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
    const b = norm(busqueda);
    if (b && !(norm(r.nombre).includes(b) || norm(r.dni).includes(b))) return false;
    return true;
  }), [enVentana, filtroSede, filtroEstado, filtroClasif, busqueda]);

  const stats = useMemo(() => {
    const base = enVentana.filter((r) => !filtroSede || r.sede === filtroSede);
    const critico = base.filter((r) => r._clasif.completo && r._clasif.score <= 2).length;
    const atencion = base.filter((r) => r._clasif.completo && r._clasif.score >= 3 && r._clasif.score <= 5).length;
    const saludable = base.filter((r) => r._clasif.completo && r._clasif.score >= 6).length;
    const incompleto = base.filter((r) => !r._clasif.completo).length;
    const cerrados = base.filter((r) => r.estado === "Cerrado").length;
    return { total: base.length, critico, atencion, saludable, incompleto, cerrados };
  }, [enVentana, filtroSede]);

  async function subir(ref, tipo) {
    const file = ref.current.files[0];
    if (!file) return;
    setCargando(tipo);
    setResultadoCarga(null);
    try {
      const filas = await leerArchivo(file);
      if (tipo === "contratos") {
        const parsed = parsearContratos(filas);
        if (!parsed.length) { setResultadoCarga({ tipo: "err", txt: "No encontré filas válidas en el archivo de Contratos a vencer." }); }
        else {
          const n = await cargarContratos(parsed, { nombre: perfil.nombre, cargo: cargoLabel, creadoPor: perfil.id });
          setResultadoCarga({ tipo: "ok", txt: `Contratos a vencer: ${n} socios cargados/actualizados para este mes.` });
        }
      } else if (tipo === "accesos") {
        const parsed = parsearAccesos(filas);
        const { coincidencias, total } = await cargarAccesos(parsed);
        setResultadoCarga({ tipo: "ok", txt: `Accesos: ${coincidencias} de ${total} DNI coincidieron con la base de Contratos de este mes y se actualizaron. El resto se descartó (no está en la base de este mes).` });
      } else if (tipo === "nps") {
        const parsed = parsearNPS(filas);
        const { coincidencias, total } = await cargarNPS(parsed);
        setResultadoCarga({ tipo: "ok", txt: `NPS: ${coincidencias} de ${total} DNI coincidieron con la base de Contratos de este mes y se actualizaron.` });
      }
    } catch (err) {
      setResultadoCarga({ tipo: "err", txt: "No se pudo procesar el archivo: " + err.message });
    } finally {
      setCargando(null);
      ref.current.value = "";
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
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 13, textTransform: "uppercase", fontWeight: 800, letterSpacing: "-.01em", color: T.inkSoft }}>Seguimiento de contratos a vencer</div>
        <p style={{ fontSize: 12, color: T.inkSoft, marginTop: 4 }}>Socios activos cuyo contrato vence entre 91 y 150 días desde hoy, cruzando Contratos + Accesos + NPS por DNI.</p>
      </div>

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
                Cargá primero <b style={{ color: T.ink }}>Contratos a vencer</b> (define la base de socios del mes). Después subí Accesos y NPS
                para completar sus datos — los DNI que no estén en la base de Contratos de este mes se descartan solos.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
                <div style={s.uploadCard}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>1 · Contratos a vencer</div>
                  <p style={{ fontSize: 11, color: T.inkSoft, marginBottom: 10 }}>Define la base del mes.</p>
                  <label style={{ ...btnMarca, display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12.5 }}>
                    <IconoSubir /> {cargando === "contratos" ? "Cargando..." : "Elegir archivo"}
                    <input ref={refContratos} type="file" accept=".csv,.xlsx,.xls" onChange={() => subir(refContratos, "contratos")} style={{ display: "none" }} disabled={!!cargando} />
                  </label>
                </div>
                <div style={s.uploadCard}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>2 · Accesos por socio</div>
                  <p style={{ fontSize: 11, color: T.inkSoft, marginBottom: 10 }}>Asistencia de los últimos 2 meses.</p>
                  <label style={{ ...btnOut, display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12.5 }}>
                    <IconoSubir /> {cargando === "accesos" ? "Cargando..." : "Elegir archivo"}
                    <input ref={refAccesos} type="file" accept=".csv,.xlsx,.xls" onChange={() => subir(refAccesos, "accesos")} style={{ display: "none" }} disabled={!!cargando} />
                  </label>
                </div>
                <div style={s.uploadCard}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>3 · NPS y comentarios</div>
                  <p style={{ fontSize: 11, color: T.inkSoft, marginBottom: 10 }}>Última respuesta de cada socio.</p>
                  <label style={{ ...btnOut, display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12.5 }}>
                    <IconoSubir /> {cargando === "nps" ? "Cargando..." : "Elegir archivo"}
                    <input ref={refNPS} type="file" accept=".csv,.xlsx,.xls" onChange={() => subir(refNPS, "nps")} style={{ display: "none" }} disabled={!!cargando} />
                  </label>
                </div>
              </div>
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
            <option value="critico">Crítico (1-2)</option>
            <option value="atencion">Atención (3-5)</option>
            <option value="saludable">Saludable (6-10)</option>
            <option value="incompleto">Datos incompletos</option>
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
          <input style={inp} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre o DNI..." />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 26 }}>
        <StatCard n={stats.total} l="En ventana 91-150 días" color={T.marca} />
        <StatCard n={stats.critico} l="Crítico" color={T.red} />
        <StatCard n={stats.atencion} l="Atención" color={T.amber} />
        <StatCard n={stats.saludable} l="Saludable" color={T.green} />
        <StatCard n={stats.incompleto} l="Datos incompletos" color={T.line} />
        <StatCard n={stats.cerrados} l="Cerrados" color={T.green} />
      </div>

      {filtrados.length === 0 ? (
        <div style={{ padding: 50, textAlign: "center", color: T.inkSoft, background: T.surface, border: "1px solid " + T.line, borderRadius: 16 }}>
          {enVentana.length ? "No hay socios que coincidan con el filtro actual." : "Todavía no hay socios en la ventana de 91 a 150 días. Cargá la planilla de Contratos a vencer arriba."}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 16 }}>
          {filtrados.map((r) => {
            const dias = diasEntre(hoyStr(), r.fecha_fin_contrato);
            const c = r._clasif;
            const nota = c.completo ? notaEspecial(c.nivel, c.segmento) : null;
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

                <select style={{ ...inp, padding: "6px 8px", fontSize: 11.5, fontWeight: 700, background: r.estado === "Cerrado" ? T.greenSoft : T.redSoft, color: r.estado === "Cerrado" ? T.green : T.red }}
                  value={r.estado} onChange={(e) => cambiarEstado(r, e.target.value)}>
                  <option value="Abierto">Abierto</option>
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
