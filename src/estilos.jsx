/* Identidad visual. Cambia estos valores para adaptarlo a otra marca. */

export const T = {
  negro: "#000000",
  fondo: "#0B0B0C",
  ink: "#FFFFFF",
  inkSoft: "#8E8E93",
  surface: "#1A1A1C",
  surface2: "#242427",
  line: "#2E2E32",
  marca: "#F2622A",          // color principal: marca y acciones
  marcaSoft: "rgba(242,98,42,.15)",
  red: "#FF453A",   redSoft: "rgba(255,69,58,.15)",
  amber: "#FFD426", amberSoft: "rgba(255,212,38,.14)",
  green: "#30D158", greenSoft: "rgba(48,209,88,.14)",
  blue: "#0A84FF",  blueSoft: "rgba(10,132,255,.15)",
  sobreClaro: "#06210E",     // texto sobre fondos claros (verde, amarillo)
};

export const FUENTE = "'Inter', -apple-system, system-ui, sans-serif";

export const inp = {
  width: "100%", border: "1px solid " + T.line, borderRadius: 11,
  padding: "12px 14px", fontSize: 14, fontFamily: FUENTE,
  color: T.ink, background: T.surface2,
};

export const lab = {
  display: "block", fontSize: 11.5, fontWeight: 700, color: T.inkSoft,
  marginBottom: 7, textTransform: "uppercase", letterSpacing: ".05em",
};

export const btnMarca = {
  background: T.marca, color: "#fff", border: "none", borderRadius: 11,
  padding: "11px 17px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: FUENTE,
};

export const btnOut = {
  background: "transparent", color: T.ink, border: "1px solid " + T.line,
  borderRadius: 11, padding: "11px 17px", fontWeight: 700, fontSize: 13,
  cursor: "pointer", fontFamily: FUENTE,
};

export const btnVerde = {
  background: T.green, color: T.sobreClaro, border: "none", borderRadius: 11,
  padding: "11px 17px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: FUENTE,
};

export function Badge({ children, tone = "green" }) {
  const map = {
    red: [T.redSoft, T.red], amber: [T.amberSoft, T.amber], green: [T.greenSoft, T.green],
    blue: [T.blueSoft, T.blue], marca: [T.marcaSoft, T.marca], gris: [T.surface2, T.inkSoft],
  };
  const c = map[tone] || map.green;
  return (
    <span style={{ background: c[0], color: c[1], fontSize: 11, fontWeight: 700,
      padding: "4px 9px", borderRadius: 7, whiteSpace: "nowrap" }}>{children}</span>
  );
}

export function Logo({ size = 24 }) {
  return (
    <span style={{ fontWeight: 800, letterSpacing: ".08em", fontSize: size, whiteSpace: "nowrap" }}>
      <span style={{ color: T.marca }}>SLEEPER</span>{" "}
      <span style={{ color: T.ink }}>MEGATLON</span>
    </span>
  );
}
