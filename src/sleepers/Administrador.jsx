import { useMemo, useState } from "react";
import { T, FUENTE, inp, lab, btnOut, Badge } from "../estilos.jsx";
import { useCasos, actualizarCaso, eliminarCasos, reasignarSede } from "./datos.js";
import { IconoBasura, IconoPin, IconoCandado } from "./iconos.jsx";

const norm = (s) => (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

/* ============================================================
   Solapa "Administrador" — exclusiva de Direccion.
   Ac se corrigen datos mal cargados (nombre, DNI, email,
   telefono, sede) y se eliminan socios. Estas dos acciones estan
   bloqueadas a nivel de base de datos para cualquier otro rol
   (ver db/04-mejoras.sql), asi que esta pantalla es la unica
   forma de hacerlo aunque alguien manipule el navegador.
   ============================================================ */
export default function Administrador() {
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

  function toggle(id) {
    setSeleccionados((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleTodos() {
    setSeleccionados((prev) => prev.size === filtrados.length ? new Set() : new Set(filtrados.map((c) => c.id)));
  }

  function valorCampo(c, campo) {
    return ediciones[c.id]?.[campo] ?? (c[campo] || "");
  }
  function onCambiaCampo(id, campo, valor) {
    setEdiciones((prev) => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }));
  }
  async function guardarCampo(c, campo) {
    const valor = valorCampo(c, campo).trim();
    if (valor === (c[campo] || "")) return;
    try {
      await actualizarCaso(c.id, { [campo]: valor || null });
    } catch (err) {
      alert("No se pudo guardar: " + err.message);
      onCambiaCampo(c.id, campo, c[campo] || "");
    }
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

  const campoEditable = { padding: "6px 8px", fontSize: 12.5, minWidth: 110 };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <IconoCandado tam={20} />
        <span style={{ fontSize: 15, fontWeight: 800, textTransform: "uppercase", letterSpacing: "-.01em" }}>Administrador</span>
      </div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 18 }}>
        Acá corregís datos mal cargados (nombre, DNI, email, teléfono, sede) y eliminás socios.
        Estas dos acciones son exclusivas de Dirección — el resto de los roles no puede
        hacerlo aunque intente manipular la página, porque está bloqueado en la base de datos.
        El seguimiento diario (motivo, riesgo, comentarios, estado) lo sigue haciendo cada
        gerente o vendedor con normalidad desde la solapa Sleepers.
      </p>

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

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <input style={{ ...inp, maxWidth: 220 }} placeholder="Nueva sede para seleccionados" value={nuevaSede} onChange={(e) => setNuevaSede(e.target.value)} />
        <button style={btnOut} onClick={reasignarSeleccionados}><IconoPin /> Reasignar sede</button>
        <button style={{ ...btnOut, color: T.red, borderColor: T.red }} onClick={eliminarSeleccionados}><IconoBasura /> Eliminar seleccionados</button>
        <span style={{ fontSize: 11.5, color: T.inkSoft }}>{seleccionados.size > 0 ? `${seleccionados.size} seleccionado(s)` : `${filtrados.length} socio(s) en la lista`}</span>
      </div>

      <div style={{ background: T.surface, border: "1px solid " + T.line, borderRadius: 16, overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}><input type="checkbox" checked={seleccionados.size > 0 && seleccionados.size === filtrados.length} onChange={toggleTodos} /></th>
              <th style={th}>Nombre</th>
              <th style={th}>DNI</th>
              <th style={th}>Email</th>
              <th style={th}>Teléfono</th>
              <th style={th}>Sede</th>
              <th style={th}>Cargado por</th>
              <th style={th}>Estado</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: T.inkSoft }}>No hay socios que coincidan.</td></tr>
            )}
            {filtrados.map((c) => (
              <tr key={c.id}>
                <td style={td}><input type="checkbox" checked={seleccionados.has(c.id)} onChange={() => toggle(c.id)} /></td>
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
                <td style={td}><button onClick={() => eliminarUno(c.id)} style={{ background: "none", border: "none", color: T.inkSoft, cursor: "pointer" }}><IconoBasura /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th = { textAlign: "left", fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em", color: T.inkSoft, fontWeight: 700, padding: "9px 8px", borderBottom: "1px solid " + T.line, background: T.surface2, whiteSpace: "nowrap" };
const td = { padding: "8px", borderBottom: "1px solid " + T.line, verticalAlign: "middle" };
