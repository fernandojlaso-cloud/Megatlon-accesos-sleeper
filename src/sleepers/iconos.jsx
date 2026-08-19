/* Iconos SVG en linea, sin emoticones, estilo outline consistente
   con el resto de la app. */

function Icono({ tam = 15, children, style }) {
  return (
    <svg
      width={tam} height={tam} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, verticalAlign: "-3px", ...style }}
    >
      {children}
    </svg>
  );
}

export const IconoSubir = (p) => (
  <Icono {...p}><path d="M12 16V4M12 4l-4 4M12 4l4 4" /><path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" /></Icono>
);
export const IconoBajar = (p) => (
  <Icono {...p}><path d="M12 4v12M12 16l-4-4M12 16l4-4" /><path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" /></Icono>
);
export const IconoBasura = (p) => (
  <Icono {...p}>
    <path d="M4 7h16" /><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2" />
    <path d="M6.5 7l1 12.5a2 2 0 002 2h5a2 2 0 002-2L17.5 7" /><path d="M10 11v6M14 11v6" />
  </Icono>
);
export const IconoCandado = (p) => (
  <Icono {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></Icono>
);
export const IconoLlave = (p) => (
  <Icono {...p}><path d="M14.7 6.3a4 4 0 00-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 005.4-5.4l-2.7 2.7-2.8-.8-.8-2.8z" /></Icono>
);
export const IconoPin = (p) => (
  <Icono {...p}><path d="M12 21s7-7.6 7-12.2A7 7 0 105 8.8C5 13.4 12 21 12 21z" /><circle cx="12" cy="9" r="2.4" /></Icono>
);
export const IconoMas = (p) => (
  <Icono {...p}><path d="M12 5v14M5 12h14" /></Icono>
);
export const IconoChat = (p) => (
  <Icono {...p}><path d="M4 5h16a1 1 0 011 1v10a1 1 0 01-1 1H9l-5 4v-4H4a1 1 0 01-1-1V6a1 1 0 011-1z" /></Icono>
);
export const IconoMail = (p) => (
  <Icono {...p}><path d="M4 6h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1z" /><path d="M3.5 7l8.5 6 8.5-6" /></Icono>
);
export const IconoAlerta = (p) => (
  <Icono {...p}><path d="M12 3l9.5 17H2.5L12 3z" /><path d="M12 10v4" /><path d="M12 17.2v.01" /></Icono>
);
export const IconoReloj = (p) => (
  <Icono {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3.2 2" /></Icono>
);
export const IconoCheckCirculo = (p) => (
  <Icono {...p}><circle cx="12" cy="12" r="9" /><path d="M8 12.3l2.6 2.6L16 9" /></Icono>
);
export const IconoX = (p) => (
  <Icono {...p}><path d="M6 6l12 12M18 6L6 18" /></Icono>
);
export const IconoTrofeo = (p) => (
  <Icono {...p}>
    <path d="M8 4h8v4a4 4 0 01-8 0V4z" /><path d="M8 5H5a3 3 0 003 3M16 5h3a3 3 0 01-3 3" />
    <path d="M10 14v2.5M14 14v2.5M8 20.5h8M9.2 16.5h5.6l.8 4H8.4l.8-4z" />
  </Icono>
);
export const IconoCarpeta = (p) => (
  <Icono {...p}><path d="M3 7.5a2 2 0 012-2h4l2 2h8a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2v-7z" /></Icono>
);
export const IconoFlechaAbajo = (p) => (
  <Icono {...p}><path d="M6 9l6 6 6-6" /></Icono>
);
