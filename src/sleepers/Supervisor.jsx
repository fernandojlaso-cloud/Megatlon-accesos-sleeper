import { useEffect, useMemo, useState } from "react";
import { T, FUENTE, Badge } from "../estilos.jsx";
import { useCasos } from "./datos.js";
import { useSeguimientoContratos, clasificar } from "./datosContratos.js";
import { supabase } from "../supabase.js";

const hoyStr = () => new Date().toISOString().slice(0, 10);
const diasEntre = (desde, hasta) => {
  if (!desde) return 0;
  const d1 = new Date(desde + "T00:00:00");
  const d2 = new Date((hasta || hoyStr()) + "T00:00:00");
  return Math.round((d2 - d1) / 86400000);
};

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

  // ---------- Contratos a vencer ----------
  const { registros: registrosContratos } = useSeguimientoContratos();
  const contratosEnVentana = useMemo(() => registrosContratos.map((r) => ({ ...r, _clasif: clasificar(r) }))
    .filter((r) => { const d = diasEntre(hoyStr(), r.fecha_fin_contrato); return d >= 91 && d <= 150; }),
    [registrosContratos]);

  const macroContratos = useMemo(() => {
    const critico = contratosEnVentana.filter((r) => r._clasif.completo && r._clasif.score <= 2).length;
    const atencion = contratosEnVentana.filter((r) => r._clasif.completo && r._clasif.score >= 3 && r._clasif.score <= 5).length;
    const saludable = contratosEnVentana.filter((r) => r._clasif.completo && r._clasif.score >= 6).length;
    const incompleto = contratosEnVentana.filter((r) => !r._clasif.completo).length;
    const abiertos = contratosEnVentana.filter((r) => r.estado === "Abierto").length;
    const enSeguimiento = contratosEnVentana.filter((r) => r.estado === "Seguimiento").length;
    const cerrados = contratosEnVentana.filter((r) => r.estado === "Cerrado").length;
    return { total: contratosEnVentana.length, critico, atencion, saludable, incompleto, abiertos, enSeguimiento, cerrados };
  }, [contratosEnVentana]);

  const contratosPorSede = useMemo(() => {
    const sedes = [...new Set(contratosEnVentana.map((r) => r.sede).filter(Boolean))].sort();
    return sedes.map((sede) => {
      const lista = contratosEnVentana.filter((r) => r.sede === sede);
      const critico = lista.filter((r) => r._clasif.completo && r._clasif.score <= 2).length;
      const atencion = lista.filter((r) => r._clasif.completo && r._clasif.score >= 3 && r._clasif.score <= 5).length;
      const saludable = lista.filter((r) => r._clasif.completo && r._clasif.score >= 6).length;
      const incompleto = lista.filter((r) => !r._clasif.completo).length;
      const cerrados = lista.filter((r) => r.estado === "Cerrado").length;
      const total = lista.length;
      return {
        sede, total, critico, atencion, saludable, incompleto, cerrados,
        pctCritico: total ? Math.round((critico / total) * 100) : 0,
        pctCerrado: total ? Math.round((cerrados / total) * 100) : 0,
      };
    });
  }, [contratosEnVentana]);

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

      <p style={{ ...sectionTitle, marginTop: 34 }}>Contratos a vencer (ventana 91-150 días)</p>
      <p style={{ fontSize: 11.5, color: T.inkSoft, marginTop: -6, marginBottom: 14 }}>La asistencia es de los últimos 2 meses. El NPS es histórico (última respuesta del socio, sin importar hace cuánto).</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14, marginBottom: 22 }}>
        <Macro n={macroContratos.total} l="Total en ventana" color={T.marca} />
        <Macro n={macroContratos.critico} l="Riesgo de baja" color={T.red} />
        <Macro n={macroContratos.atencion} l="En seguimiento" color={T.amber} />
        <Macro n={macroContratos.saludable} l="Fidelizado" color={T.green} />
        <Macro n={macroContratos.incompleto} l="Datos incompletos" color={T.line} />
        <Macro n={macroContratos.abiertos} l="Abiertos" color={T.amber} />
        <Macro n={macroContratos.enSeguimiento} l="En seguimiento" color={T.amber} />
        <Macro n={macroContratos.cerrados} l="Cerrados" color={T.green} />
      </div>

      <p style={sectionTitle}>Contratos a vencer — por sucursal</p>
      <div style={{ background: T.surface, border: "1px solid " + T.line, borderRadius: 16, overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Sucursal</th>
              <th style={th}>Total</th>
              <th style={th}>Riesgo de baja</th>
              <th style={th}>En seguimiento</th>
              <th style={th}>Fidelizado</th>
              <th style={th}>Incompletos</th>
              <th style={th}>Cerrados</th>
              <th style={th}>% riesgo de baja</th>
              <th style={th}>% cerrado</th>
            </tr>
          </thead>
          <tbody>
            {contratosPorSede.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: T.inkSoft }}>Todavía no hay contratos en la ventana de 91-150 días.</td></tr>
            )}
            {contratosPorSede.map((s) => (
              <tr key={s.sede}>
                <td style={{ ...td, fontWeight: 600 }}>{s.sede}</td>
                <td style={td}>{s.total}</td>
                <td style={td}><Badge tone="red">{s.critico}</Badge></td>
                <td style={td}><Badge tone="amber">{s.atencion}</Badge></td>
                <td style={td}><Badge tone="green">{s.saludable}</Badge></td>
                <td style={td}><Badge tone="gris">{s.incompleto}</Badge></td>
                <td style={td}><Badge tone="green">{s.cerrados}</Badge></td>
                <td style={td}>{s.pctCritico}%</td>
                <td style={td}>{s.pctCerrado}%</td>
              </tr>
            ))}
          </tbody>
          {contratosPorSede.length > 0 && (
            <tfoot>
              <tr style={{ background: T.surface2 }}>
                <td style={{ ...td, fontWeight: 700 }}>Total todas las sedes</td>
                <td style={{ ...td, fontWeight: 700 }}>{macroContratos.total}</td>
                <td style={{ ...td, fontWeight: 700 }}>{macroContratos.critico}</td>
                <td style={{ ...td, fontWeight: 700 }}>{macroContratos.atencion}</td>
                <td style={{ ...td, fontWeight: 700 }}>{macroContratos.saludable}</td>
                <td style={{ ...td, fontWeight: 700 }}>{macroContratos.incompleto}</td>
                <td style={{ ...td, fontWeight: 700 }}>{macroContratos.cerrados}</td>
                <td style={{ ...td, fontWeight: 700 }}>{macroContratos.total ? Math.round((macroContratos.critico / macroContratos.total) * 100) : 0}%</td>
                <td style={{ ...td, fontWeight: 700 }}>{macroContratos.total ? Math.round((macroContratos.cerrados / macroContratos.total) * 100) : 0}%</td>
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
