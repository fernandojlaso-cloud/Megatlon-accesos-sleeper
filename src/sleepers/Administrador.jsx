import { useMemo, useState } from "react";
import { T, FUENTE, inp, lab, btnOut, Badge } from "../estilos.jsx";
import { useCasos, actualizarCaso, eliminarCasos, reasignarSede } from "./datos.js";
import { useSeguimientoContratos, actualizarRegistro, eliminarRegistros, reasignarSedeRegistros, clasificar } from "./datosContratos.js";
import { IconoBasura, IconoPin, IconoCandado } from "./iconos.jsx";

const norm = (s) => (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

/* ============================================================
   Solapa "Administrador" — Direccion y Gerente (cada uno ve y
   corrige solo su sede; Direccion ve todas). Tiene dos segmentos
   separados, nunca mezclados: Sleepers y Contratos a Vencer.

   Corregir identidad (nombre, DNI, email, telefono, sede) lo
   puede hacer Direccion o Gerente. Eliminar y reasignar en bloque
   son exclusivos de Direccion — bloqueado a nivel de base de
   datos, no solo en la pantalla.
   ============================================================ */
export default function Administrador({ perfil }) {
  const [segmento, setSegmento] = useState("sleepers");
  const puedeEliminar = perfil?.rol === "director";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <IconoCandado tam={20} />
        <span style={{ fontSize: 15, fontWeight: 800, textTransform: "uppercase", letterSpacing: "-.01em" }}>Administrador</span>
      </div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 18 }}>
        Acá corregís datos mal cargados (nombre, DNI, email, teléfono, sede). Eliminar y reasignar sede
        en bloque son exclusivos de Dirección — el resto de los roles no puede hacerlo aunque intente
        manipular la página, porque está bloqueado en la base de datos.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, borderBottom: "1px solid " + T.line }}>
        <button onClick={() => setSegmento("sleepers")} style={tabBtn(segmento === "sleepers")}>Sleepers</button>
        <button onClick={() => setSegmento("contratos")} style={tabBtn(segmento === "contratos")}>Contratos a Vencer</button>
      </div>

      {segmento === "sleepers"
        ? <SegmentoSleepers puedeEliminar={puedeEliminar} />
        : <SegmentoContratos puedeEliminar={puedeEliminar} />}
    </div>
  );
}

function tabBtn(activo) {
  return {
    background: "none", border: "none", borderBottom: activo ? "2px solid " + T.marca : "2px solid transparent",
    color: activo ? T.ink : T.inkSoft, fontWeight: activo ? 700 : 600, fontSize: 13, padding: "10px 4px",
    cursor: "pointer", fontFamily: FUENTE, marginBottom: -1,
  };
}

/* ============================================================
   Segmento Sleepers
   ============================================================ */
function SegmentoSleepers({ puedeEliminar }) {
  const { casos } = useCasos();
  const [busqueda, setBusqueda] = useState("");
  const [filtroSede, setFiltroSede] = useState("");
  const [seleccionados, setSeleccionados] = useState(new Set());
  const [nuevaSede, setNuevaSede] = useState("");
  const [ediciones, setEdiciones] = useState({});

  const sedes = useMemo(() => [...new Set(casos.map((c) => c.sede).filter(Boolean))].sort(), [casos]);
  const filtrados = useMemo(() => casos.filter((c) => {
    if (filtroSede && c.sede !== filtroSede) return false;
    const b = norm(busqueda);
    if (b && !(norm(c.nombre).includes(b) || norm(c.dni).includes(b) || norm(c.email).includes(b))) return false;
    return true;
  }), [casos, filtroSede, busqueda]);

  function toggle(id) { setSeleccionados((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function toggleTodos() { setSeleccionados((prev) => prev.size === filtrados.length ? new Set() : new Set(filtrados.map((c) => c.id))); }
  function valorCampo(c, campo) { return ediciones[c.id]?.[campo] ?? (c[campo] || ""); }
  function onCambiaCampo(id, campo, valor) { setEdiciones((prev) => ({ ...prev, [id]: { ...prev[id], [campo]: valor } })); }
  async function guardarCampo(c, campo) {
    const valor = valorCampo(c, campo).trim();
    if (valor === (c[campo] || "")) return;
    try { await actualizarCaso(c.id, { [campo]: valor || null }); }
    catch (err) { alert("No se pudo guardar: " + err.message); onCambiaCampo(c.id, campo, c[campo] || ""); }
  }
  async function eliminarUno(id) {
    if (!confirm("¿Eliminar este socio? No se puede deshacer.")) return;
    try { await eliminarCasos([id]); } catch (err) { alert(err.message); }
  }
  async function eliminarSeleccionados() {
    if (!seleccionados.size) return alert("Seleccioná al menos un socio.");
    if (!confirm(`¿Eliminar ${seleccionados.size} socio(s)? No se puede deshacer.`)) return;
    try { await eliminarCasos([...seleccionados]); setSeleccionados(new Set()); } catch (err) { alert(err.message); }
  }
  async function reasignarSeleccionados() {
    if (!seleccionados.size) return alert("Seleccioná al menos un socio.");
    if (!nuevaSede.trim()) return alert("Escribí la sede de destino.");
    try { await reasignarSede([...seleccionados], nuevaSede.trim()); setSeleccionados(new Set()); setNuevaSede(""); } catch (err) { alert(err.message); }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 16 }}>
        <div style={{ minWidth: 160 }}>
          <label style={lab}>Sede</label>
          <select style={inp} value={filtroSede} onChange={(e) => setFiltroSede(e.target.value)}>
            <option value="">Todas</option>
            {sedes.map((sd) => <option key={sd} value={sd}>{sd}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={lab}>Buscar</label>
          <input style={inp} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre, DNI o email..." />
        </div>
      </div>

      {puedeEliminar && (
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
          <input style={{ ...inp, maxWidth: 220 }} placeholder="Nueva sede para seleccionados" value={nuevaSede} onChange={(e) => setNuevaSede(e.target.value)} />
          <button style={btnOut} onClick={reasignarSeleccionados}><IconoPin /> Reasignar sede</button>
          <button style={{ ...btnOut, color: T.red, borderColor: T.red }} onClick={eliminarSeleccionados}><IconoBasura /> Eliminar seleccionados</button>
          <span style={{ fontSize: 11.5, color: T.inkSoft }}>{seleccionados.size > 0 ? `${seleccionados.size} seleccionado(s)` : `${filtrados.length} socio(s) en la lista`}</span>
        </div>
      )}

      <div style={{ background: T.surface, border: "1px solid " + T.line, borderRadius: 16, overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {puedeEliminar && <th style={th}><input type="checkbox" checked={seleccionados.size > 0 && seleccionados.size === filtrados.length} onChange={toggleTodos} /></th>}
              <th style={th}>Nombre</th>
              <th style={th}>DNI</th>
              <th style={th}>Email</th>
              <th style={th}>Teléfono</th>
              <th style={th}>Sede</th>
              <th style={th}>Cargado por</th>
              <th style={th}>Estado</th>
              {puedeEliminar && <th style={th}></th>}
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: T.inkSoft }}>No hay socios que coincidan.</td></tr>
            )}
            {filtrados.map((c) => (
              <tr key={c.id}>
                {puedeEliminar && <td style={td}><input type="checkbox" checked={seleccionados.has(c.id)} onChange={() => toggle(c.id)} /></td>}
                <td style={td}><input style={{ ...inp, ...campoEditable }} value={valorCampo(c, "nombre")}
                  onChange={(e) => onCambiaCampo(c.id, "nombre", e.target.value)} onBlur={() => guardarCampo(c, "nombre")} /></td>
                <td style={td}><input style={{ ...inp, ...campoEditable, minWidth: 80 }} value={valorCampo(c, "dni")}
                  onChange={(e) => onCambiaCampo(c.id, "dni", e.target.value)} onBlur={() => guardarCampo(c, "dni")} /></td>
                <td style={td}><input style={{ ...inp, ...campoEditable }} value={valorCampo(c, "email")}
                  onChange={(e) => onCambiaCampo(c.id, "email", e.target.value)} onBlur={() => guardarCampo(c, "email")} /></td>
                <td style={td}><input style={{ ...inp, ...campoEditable }} value={valorCampo(c, "telefono")}
                  onChange={(e) => onCambiaCampo(c.id, "telefono", e.target.value)} onBlur={() => guardarCampo(c, "telefono")} /></td>
                <td style={td}><input style={{ ...inp, ...campoEditable }} value={valorCampo(c, "sede")}
                  onChange={(e) => onCambiaCampo(c.id, "sede", e.target.value)} onBlur={() => guardarCampo(c, "sede")} /></td>
                <td style={{ ...td, color: T.inkSoft }}>{c.subido_por || "—"}{c.cargo_subido_por ? " · " + c.cargo_subido_por : ""}</td>
                <td style={{ ...td, color: T.inkSoft }}><Badge tone={c.estado === "Cerrado" ? "green" : "gris"}>{c.estado}</Badge></td>
                {puedeEliminar && <td style={td}><button onClick={() => eliminarUno(c.id)} style={delBtn}><IconoBasura /></button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================================================
   Segmento Contratos a Vencer
   ============================================================ */
function SegmentoContratos({ puedeEliminar }) {
  const { registros: crudos } = useSeguimientoContratos();
  const registros = useMemo(() => crudos.map((r) => ({ ...r, _clasif: clasificar(r) })), [crudos]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroSede, setFiltroSede] = useState("");
  const [filtroClasif, setFiltroClasif] = useState("");
  const [filtroVenceDesde, setFiltroVenceDesde] = useState("");
  const [filtroVenceHasta, setFiltroVenceHasta] = useState("");
  const [seleccionados, setSeleccionados] = useState(new Set());
  const [nuevaSede, setNuevaSede] = useState("");
  const [ediciones, setEdiciones] = useState({});

  const sedes = useMemo(() => [...new Set(registros.map((r) => r.sede).filter(Boolean))].sort(), [registros]);
  const filtrados = useMemo(() => registros.filter((r) => {
    if (filtroSede && r.sede !== filtroSede) return false;
    if (filtroClasif) {
      const s = r._clasif;
      if (filtroClasif === "incompleto" && s.completo) return false;
      if (filtroClasif === "critico" && !(s.completo && s.score <= 2)) return false;
      if (filtroClasif === "atencion" && !(s.completo && s.score >= 3 && s.score <= 5)) return false;
      if (filtroClasif === "saludable" && !(s.completo && s.score >= 6)) return false;
    }
    if (filtroVenceDesde && (!r.fecha_fin_contrato || r.fecha_fin_contrato < filtroVenceDesde)) return false;
    if (filtroVenceHasta && (!r.fecha_fin_contrato || r.fecha_fin_contrato > filtroVenceHasta)) return false;
    const b = norm(busqueda);
    if (b && !(norm(r.nombre).includes(b) || norm(r.dni).includes(b))) return false;
    return true;
  }), [registros, filtroSede, filtroClasif, busqueda, filtroVenceDesde, filtroVenceHasta]);

  function toggle(id) { setSeleccionados((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function toggleTodos() { setSeleccionados((prev) => prev.size === filtrados.length ? new Set() : new Set(filtrados.map((r) => r.id))); }
  function valorCampo(r, campo) { return ediciones[r.id]?.[campo] ?? (r[campo] || ""); }
  function onCambiaCampo(id, campo, valor) { setEdiciones((prev) => ({ ...prev, [id]: { ...prev[id], [campo]: valor } })); }
  async function guardarCampo(r, campo) {
    const valor = valorCampo(r, campo).trim();
    if (valor === (r[campo] || "")) return;
    try { await actualizarRegistro(r.id, { [campo]: valor || null }); }
    catch (err) { alert("No se pudo guardar: " + err.message); onCambiaCampo(r.id, campo, r[campo] || ""); }
  }
  async function eliminarUno(id) {
    if (!confirm("¿Eliminar este registro? No se puede deshacer.")) return;
    try { await eliminarRegistros([id]); } catch (err) { alert(err.message); }
  }
  async function eliminarSeleccionados() {
    if (!seleccionados.size) return alert("Seleccioná al menos un registro.");
    if (!confirm(`¿Eliminar ${seleccionados.size} registro(s)? No se puede deshacer.`)) return;
    try { await eliminarRegistros([...seleccionados]); setSeleccionados(new Set()); } catch (err) { alert(err.message); }
  }
  async function reasignarSeleccionados() {
    if (!seleccionados.size) return alert("Seleccioná al menos un registro.");
    if (!nuevaSede.trim()) return alert("Escribí la sede de destino.");
    try { await reasignarSedeRegistros([...seleccionados], nuevaSede.trim()); setSeleccionados(new Set()); setNuevaSede(""); } catch (err) { alert(err.message); }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 16 }}>
        <div style={{ minWidth: 160 }}>
          <label style={lab}>Sede</label>
          <select style={inp} value={filtroSede} onChange={(e) => setFiltroSede(e.target.value)}>
            <option value="">Todas</option>
            {sedes.map((sd) => <option key={sd} value={sd}>{sd}</option>)}
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
        <div style={{ minWidth: 150 }}>
          <label style={lab}>Vencimiento desde</label>
          <input type="date" style={inp} value={filtroVenceDesde} onChange={(e) => setFiltroVenceDesde(e.target.value)} />
        </div>
        <div style={{ minWidth: 150 }}>
          <label style={lab}>Vencimiento hasta</label>
          <input type="date" style={inp} value={filtroVenceHasta} onChange={(e) => setFiltroVenceHasta(e.target.value)} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={lab}>Buscar</label>
          <input style={inp} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre o DNI..." />
        </div>
      </div>

      {puedeEliminar && (
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
          <input style={{ ...inp, maxWidth: 220 }} placeholder="Nueva sede para seleccionados" value={nuevaSede} onChange={(e) => setNuevaSede(e.target.value)} />
          <button style={btnOut} onClick={reasignarSeleccionados}><IconoPin /> Reasignar sede</button>
          <button style={{ ...btnOut, color: T.red, borderColor: T.red }} onClick={eliminarSeleccionados}><IconoBasura /> Eliminar seleccionados</button>
          <span style={{ fontSize: 11.5, color: T.inkSoft }}>{seleccionados.size > 0 ? `${seleccionados.size} seleccionado(s)` : `${filtrados.length} registro(s) en la lista`}</span>
        </div>
      )}

      <div style={{ background: T.surface, border: "1px solid " + T.line, borderRadius: 16, overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {puedeEliminar && <th style={th}><input type="checkbox" checked={seleccionados.size > 0 && seleccionados.size === filtrados.length} onChange={toggleTodos} /></th>}
              <th style={th}>Nombre</th>
              <th style={th}>DNI</th>
              <th style={th}>Email</th>
              <th style={th}>Teléfono</th>
              <th style={th}>Sede</th>
              <th style={th}>Vencimiento</th>
              <th style={th}>NPS</th>
              <th style={th}>Asistencia</th>
              <th style={th}>Calificación</th>
              <th style={th}>Cargado por</th>
              <th style={th}>Estado</th>
              {puedeEliminar && <th style={th}></th>}
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 && (
              <tr><td colSpan={13} style={{ padding: 40, textAlign: "center", color: T.inkSoft }}>No hay registros que coincidan.</td></tr>
            )}
            {filtrados.map((r) => (
              <tr key={r.id}>
                {puedeEliminar && <td style={td}><input type="checkbox" checked={seleccionados.has(r.id)} onChange={() => toggle(r.id)} /></td>}
                <td style={td}><input style={{ ...inp, ...campoEditable }} value={valorCampo(r, "nombre")}
                  onChange={(e) => onCambiaCampo(r.id, "nombre", e.target.value)} onBlur={() => guardarCampo(r, "nombre")} /></td>
                <td style={td}><input style={{ ...inp, ...campoEditable, minWidth: 80 }} value={valorCampo(r, "dni")}
                  onChange={(e) => onCambiaCampo(r.id, "dni", e.target.value)} onBlur={() => guardarCampo(r, "dni")} /></td>
                <td style={td}><input style={{ ...inp, ...campoEditable }} value={valorCampo(r, "email")}
                  onChange={(e) => onCambiaCampo(r.id, "email", e.target.value)} onBlur={() => guardarCampo(r, "email")} /></td>
                <td style={td}><input style={{ ...inp, ...campoEditable }} value={valorCampo(r, "telefono")}
                  onChange={(e) => onCambiaCampo(r.id, "telefono", e.target.value)} onBlur={() => guardarCampo(r, "telefono")} /></td>
                <td style={td}><input style={{ ...inp, ...campoEditable }} value={valorCampo(r, "sede")}
                  onChange={(e) => onCambiaCampo(r.id, "sede", e.target.value)} onBlur={() => guardarCampo(r, "sede")} /></td>
                <td style={{ ...td, color: T.inkSoft }}>{r.fecha_fin_contrato || "—"}</td>
                <td style={{ ...td, color: T.inkSoft }}>{r.nps_score ?? "—"}</td>
                <td style={{ ...td, color: T.inkSoft }}>{r.asistencias_2m ?? "—"}</td>
                <td style={td}>{r._clasif.completo ? <Badge tone={r._clasif.score <= 2 ? "red" : r._clasif.score <= 5 ? "amber" : "green"}>{r._clasif.score}/10</Badge> : <Badge tone="gris">—</Badge>}</td>
                <td style={{ ...td, color: T.inkSoft }}>{r.subido_por || "—"}{r.cargo_subido_por ? " · " + r.cargo_subido_por : ""}</td>
                <td style={{ ...td, color: T.inkSoft }}><Badge tone={r.estado === "Cerrado" ? "green" : r.estado === "Seguimiento" ? "amber" : "gris"}>{r.estado}</Badge></td>
                {puedeEliminar && <td style={td}><button onClick={() => eliminarUno(r.id)} style={delBtn}><IconoBasura /></button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const campoEditable = { padding: "6px 8px", fontSize: 12.5, minWidth: 110 };
const delBtn = { background: "none", border: "none", color: T.inkSoft, cursor: "pointer" };
const th = { textAlign: "left", fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em", color: T.inkSoft, fontWeight: 700, padding: "9px 8px", borderBottom: "1px solid " + T.line, background: T.surface2, whiteSpace: "nowrap" };
const td = { padding: "8px", borderBottom: "1px solid " + T.line, verticalAlign: "middle" };
