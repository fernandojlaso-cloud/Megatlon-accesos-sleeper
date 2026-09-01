import { useState, useEffect } from "react";
import { T, FUENTE, Logo } from "./estilos.jsx";
import { useSesion, Auth, Pendiente, Equipo, Actividad, ROL_LABEL } from "./Acceso.jsx";
import Sleepers from "./sleepers/Sleepers.jsx";
import Administrador from "./sleepers/Administrador.jsx";
import Supervisor from "./sleepers/Supervisor.jsx";
import ContratosVencer from "./sleepers/ContratosVencer.jsx";

/* ============================================================
   EJEMPLO DE USO
   Este archivo muestra como enganchar el sistema de accesos.
   Reemplaza el contenido de las solapas por lo tuyo.
   ============================================================ */

const TITULO = "SLEEPER MEGATLON";

export default function App() {
  const { sesion, perfil, cargando, salir } = useSesion();
  const [solapa, setSolapa] = useState("sleepers");
  const CARGOS_FIRMA = ["Director", "Gerente", "Gerente de Servicio", "Coordinador de Servicio", "Referente de Servicio"];
  const [cargoFirma, setCargoFirma] = useState("Gerente");
  useEffect(() => {
    if (!perfil) return;
    try {
      const guardado = localStorage.getItem("cargoFirma_" + perfil.id);
      setCargoFirma(guardado || ROL_LABEL[perfil.rol] || "Gerente");
    } catch {
      setCargoFirma(ROL_LABEL[perfil.rol] || "Gerente");
    }
  }, [perfil?.id]);
  function cambiarCargoFirma(valor) {
    setCargoFirma(valor);
    try { if (perfil) localStorage.setItem("cargoFirma_" + perfil.id, valor); } catch {}
  }

  // Cargando
  if (sesion === undefined || (sesion && cargando && !perfil)) {
    return (
      <div style={{ minHeight: "100vh", background: T.negro, color: T.ink, display: "flex",
        alignItems: "center", justifyContent: "center", fontFamily: FUENTE }}><Logo size={28} /></div>
    );
  }

  // Sin sesion: login o registro
  if (!sesion) return <Auth titulo={TITULO} subtitulo="Acceso al sistema" />;

  // Con sesion pero sin aprobar: pantalla de espera
  if (!perfil || perfil.estado !== "activo") {
    return <Pendiente perfil={perfil} onSalir={salir} titulo={TITULO} />;
  }

  const esDireccion = perfil.rol === "director";
  const esSupervisor = perfil.rol === "supervisor";
  const esGerente = perfil.rol === "gerente";
  const puedeEquipo = esDireccion || esGerente;
  const puedeAdministrador = esDireccion || esGerente;

  const SOLAPAS = esSupervisor
    ? [["panorama", "Panorama"]]
    : [
        ["sleepers", "Sleepers"],
        ["contratos", "Contratos a Vencer"],
        ...(esDireccion ? [["panorama", "Panorama"]] : []),
        ...(puedeAdministrador ? [["administrador", "Administrador"]] : []),
        ...(puedeEquipo ? [["equipo", "Equipo"], ["actividad", "Actividad"]] : []),
      ];
  const solapaActual = esSupervisor ? "panorama" : solapa;

  return (
    <div style={{ minHeight: "100vh", background: T.fondo, fontFamily: FUENTE, color: T.ink }}>
      <header style={{ background: T.negro, borderBottom: "1px solid " + T.line, padding: "15px 24px" }}>
        <div style={{ maxWidth: ["sleepers","administrador","panorama","contratos"].includes(solapaActual) ? 1900 : 1000, margin: "0 auto", display: "flex", alignItems: "center",
          justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <Logo size={22} />
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ textAlign: "right", lineHeight: 1.35 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{perfil.nombre}</div>
              <div style={{ fontSize: 11.5, color: T.inkSoft }}>
                {ROL_LABEL[perfil.rol]}{(esDireccion || esSupervisor) ? " - Todas las sedes" : " - " + perfil.sede}
              </div>
            </div>
            {!esSupervisor && (
              <div style={{ textAlign: "right" }}>
                <label style={{ fontSize: 9.5, color: T.inkSoft, textTransform: "uppercase", letterSpacing: ".04em", display: "block", marginBottom: 2 }}>Firmo mensajes como</label>
                <select value={cargoFirma} onChange={(e) => cambiarCargoFirma(e.target.value)}
                  style={{ background: T.surface2, border: "1px solid " + T.line, color: T.ink, fontSize: 11.5,
                    padding: "5px 8px", borderRadius: 8, fontFamily: FUENTE }}>
                  {CARGOS_FIRMA.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
            <button onClick={salir} style={{ border: "1px solid " + T.line, background: "transparent",
              color: T.inkSoft, fontWeight: 600, fontSize: 12, padding: "8px 15px", borderRadius: 999,
              cursor: "pointer", fontFamily: FUENTE }}>Salir</button>
          </div>
        </div>
      </header>

      <div style={{ background: T.negro, borderBottom: "1px solid " + T.line }}>
        <div style={{ maxWidth: ["sleepers","administrador","panorama","contratos"].includes(solapaActual) ? 1900 : 1000, margin: "0 auto", padding: "0 16px", display: "flex", gap: 2, overflowX: "auto" }}>
          {SOLAPAS.map((x) => {
            const on = solapaActual === x[0];
            return (
              <button key={x[0]} onClick={() => setSolapa(x[0])}
                style={{ border: "none", background: "none",
                  borderBottom: "2px solid " + (on ? T.marca : "transparent"),
                  color: on ? T.ink : T.inkSoft, fontWeight: 700, fontSize: 13.5,
                  padding: "15px", cursor: "pointer", whiteSpace: "nowrap", fontFamily: FUENTE }}>{x[1]}</button>
            );
          })}
        </div>
      </div>

      <main style={{ maxWidth: ["sleepers","administrador","panorama","contratos"].includes(solapaActual) ? 1900 : 1000, margin: "0 auto", padding: "20px 16px 60px" }}>
        {solapaActual === "sleepers" && <Sleepers perfil={perfil} cargoFirma={cargoFirma} />}
        {solapaActual === "contratos" && <ContratosVencer perfil={perfil} cargoFirma={cargoFirma} />}
        {solapaActual === "administrador" && puedeAdministrador && <Administrador perfil={perfil} />}
        {solapaActual === "equipo" && puedeEquipo && <Equipo perfil={perfil} />}
        {solapaActual === "actividad" && puedeEquipo && <Actividad />}
        {solapaActual === "panorama" && (esSupervisor || esDireccion) && <Supervisor />}
      </main>
    </div>
  );
}
