import { useEffect, useMemo, useState } from "react";
import { T, FUENTE, Badge } from "../estilos.jsx";
import { useCasos } from "./datos.js";
import { supabase } from "../supabase.js";

/* ============================================================
   Solapa "Panorama" — exclusiva del rol Supervisor.
   Vista de solo lectura: macro numeros y desglose por sede de
   cuanto esta sin gestionar, gestionado y cerrado. No tiene
   ninguna accion de carga ni edicion — el Supervisor solo puede
   leer, eso ya lo garantiza la base de datos.

   Definiciones:
   - Sin gestionar: caso Abierto sin ninguna interaccion todavia
     (sin motivo, sin riesgo, sin mensaje enviado, sin seguimiento
     programado y sin comentarios).
   - Gestionado: caso Abierto con alguna interaccion ya registrada.
   - Cerrado: el caso esta Cerrado (recuperado o dado de baja).
   ============================================================ */
export default function Supervisor() {
  const { casos } = useCasos();
  const [comentariosCount, setComentariosCount] = useState({});

  useEffect(() => {
    supabase.from("comentarios").select("caso_id").then(({ data, error }) => {
      if (error) return;
      const m = {};
      (data || []).forEach((c) => { m[c.caso_id] = (m[c.caso_id] || 0) + 1; });
      setComentariosCount(m);
    });
  }, [casos.length]);

  function estadoGestion(c) {
    if (c.estado === "Cerrado") return "cerrado";
    const tuvoInteraccion = !!(c.motivo || c.riesgo || c.fecha_envio_mensaje || c.fecha_seguimiento || comentariosCount[c.id] > 0);
    return tuvoInteraccion ? "gestionado" : "sin_gestionar";
  }

  const porSede = useMemo(() => {
    const sedes = [...new Set(casos.map((c) => c.sede).filter(Boolean))].sort();
    return sedes.map((sede) => {
      const lista = casos.filter((c) => c.sede === sede);
      const sinGestionar = lista.filter((c) => estadoGestion(c) === "sin_gestionar").length;
      const gestionado = lista.filter((c) => estadoGestion(c) === "gestionado").length;
      const cerrado = lista.filter((c) => estadoGestion(c) === "cerrado").length;
      const total = lista.length;
      return {
        sede, total, sinGestionar, gestionado, cerrado,
        pctGestionado: total ? Math.round(((gestionado + cerrado) / total) * 100) : 0,
        pctCerrado: total ? Math.round((cerrado / total) * 100) : 0,
      };
    });
  }, [casos, comentariosCount]);

  const macro = useMemo(() => {
    const sinGestionar = casos.filter((c) => estadoGestion(c) === "sin_gestionar").length;
    const gestionado = casos.filter((c) => estadoGestion(c) === "gestionado").length;
    const cerrado = casos.filter((c) => estadoGestion(c) === "cerrado").length;
    return { total: casos.length, sinGestionar, gestionado, cerrado };
  }, [casos, comentariosCount]);

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 800, textTransform: "uppercase", letterSpacing: "-.01em", marginBottom: 6 }}>Panorama general</div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 22 }}>
        Vista de solo lectura de todas las sedes. "Sin gestionar" son socios abiertos a los que
        todavía nadie contactó ni les registró motivo, riesgo o seguimiento.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 14, marginBottom: 34 }}>
        <Macro n={macro.total} l="Total de socios" color={T.marca} />
        <Macro n={macro.sinGestionar} l="Sin gestionar" color={T.red} />
        <Macro n={macro.gestionado} l="Gestionado" color={T.amber} />
        <Macro n={macro.cerrado} l="Cerrado" color={T.green} />
      </div>

      <p style={sectionTitle}>Por sucursal</p>
      <div style={{ background: T.surface, border: "1px solid " + T.line, borderRadius: 16, overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Sucursal</th>
              <th style={th}>Total</th>
              <th style={th}>Sin gestionar</th>
              <th style={th}>Gestionado</th>
              <th style={th}>Cerrado</th>
              <th style={th}>% gestionado o cerrado</th>
              <th style={th}>% cerrado</th>
            </tr>
          </thead>
          <tbody>
            {porSede.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: T.inkSoft }}>Todavía no hay socios cargados.</td></tr>
            )}
            {porSede.map((s) => (
              <tr key={s.sede}>
                <td style={{ ...td, fontWeight: 600 }}>{s.sede}</td>
                <td style={td}>{s.total}</td>
                <td style={td}><Badge tone="red">{s.sinGestionar}</Badge></td>
                <td style={td}><Badge tone="amber">{s.gestionado}</Badge></td>
                <td style={td}><Badge tone="green">{s.cerrado}</Badge></td>
                <td style={td}>{s.pctGestionado}%</td>
                <td style={td}>{s.pctCerrado}%</td>
              </tr>
            ))}
          </tbody>
          {porSede.length > 0 && (
            <tfoot>
              <tr style={{ background: T.surface2 }}>
                <td style={{ ...td, fontWeight: 700 }}>Total todas las sedes</td>
                <td style={{ ...td, fontWeight: 700 }}>{macro.total}</td>
                <td style={{ ...td, fontWeight: 700 }}>{macro.sinGestionar}</td>
                <td style={{ ...td, fontWeight: 700 }}>{macro.gestionado}</td>
                <td style={{ ...td, fontWeight: 700 }}>{macro.cerrado}</td>
                <td style={{ ...td, fontWeight: 700 }}>{macro.total ? Math.round(((macro.gestionado + macro.cerrado) / macro.total) * 100) : 0}%</td>
                <td style={{ ...td, fontWeight: 700 }}>{macro.total ? Math.round((macro.cerrado / macro.total) * 100) : 0}%</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function Macro({ n, l, color }) {
  return (
    <div style={{ background: T.surface, border: "1px solid " + T.line, borderLeft: "3px solid " + color, borderRadius: 16, padding: "18px 20px" }}>
      <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-.5px", color, fontVariantNumeric: "tabular-nums" }}>{n}</div>
      <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 4, textTransform: "uppercase", letterSpacing: ".04em" }}>{l}</div>
    </div>
  );
}

const sectionTitle = { fontSize: 13, textTransform: "uppercase", letterSpacing: "-.01em", color: T.inkSoft, fontWeight: 800, marginBottom: 12 };
const th = { textAlign: "left", fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".05em", color: T.inkSoft, fontWeight: 700, padding: "11px 12px", borderBottom: "1px solid " + T.line, background: T.surface2, whiteSpace: "nowrap" };
const td = { padding: "11px 12px", borderBottom: "1px solid " + T.line, verticalAlign: "middle" };
