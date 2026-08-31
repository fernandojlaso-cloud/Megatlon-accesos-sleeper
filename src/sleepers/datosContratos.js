import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase.js";

/* ============================================================
   Hook principal con sincronizacion en tiempo real, igual patron
   que useCasos.
   ============================================================ */
export function useSeguimientoContratos() {
  const [registros, setRegistros] = useState([]);
  const [comentariosPorRegistro, setComentariosPorRegistro] = useState({});

  const recargar = useCallback(async () => {
    const { data, error } = await supabase
      .from("seguimiento_contratos")
      .select("*")
      .order("fecha_fin_contrato", { ascending: true });
    if (!error) setRegistros(data || []);
  }, []);

  const recargarComentarios = useCallback(async (registroId) => {
    const { data, error } = await supabase
      .from("seguimiento_contratos_comentarios")
      .select("*")
      .eq("registro_id", registroId)
      .order("creado_en", { ascending: true });
    if (!error) setComentariosPorRegistro((prev) => ({ ...prev, [registroId]: data || [] }));
  }, []);

  useEffect(() => {
    recargar();
    const canal = supabase
      .channel("seg-contratos-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "seguimiento_contratos" }, () => recargar())
      .on("postgres_changes", { event: "*", schema: "public", table: "seguimiento_contratos_comentarios" }, (payload) => {
        const id = payload.new?.registro_id || payload.old?.registro_id;
        if (id) recargarComentarios(id);
      })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [recargar, recargarComentarios]);

  return { registros, comentariosPorRegistro, recargarComentarios, recargar };
}

export async function actualizarRegistro(id, campos) {
  const { error } = await supabase.from("seguimiento_contratos").update(campos).eq("id", id);
  if (error) throw error;
}
export async function eliminarRegistros(ids) {
  const { error } = await supabase.from("seguimiento_contratos").delete().in("id", ids);
  if (error) throw error;
}
export async function agregarComentarioRegistro(registroId, { texto, autor, cargo, creadoPor }) {
  const { error } = await supabase.from("seguimiento_contratos_comentarios").insert({
    registro_id: registroId, texto, autor, cargo, creado_por: creadoPor,
  });
  if (error) throw error;
}

/* ============================================================
   Normalizacion de sedes: las planillas de la empresa a veces
   usan otro formato ("Martinez II") que el que ya usa el sistema
   ("Martinez 2").
   ============================================================ */
const NORMALIZAR_SEDE = { "martinez ii": "Martinez 2" };
function normalizarSede(s) {
  const key = (s || "").toString().trim().toLowerCase();
  return NORMALIZAR_SEDE[key] || (s || "").toString().trim();
}

const norm = (s) => (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
const soloDigitos = (s) => (s || "").toString().replace(/[^\d]/g, "");
const hoyYYYYMM = () => new Date().toISOString().slice(0, 7);

function fechaAISO(valor) {
  if (!valor) return null;
  if (valor instanceof Date && !isNaN(valor)) return valor.toISOString().slice(0, 10);
  const str = valor.toString().trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const m = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = "20" + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

function buscarCol(row, ...nombres) {
  const keys = Object.keys(row);
  for (const k of keys) { if (nombres.includes(norm(k))) return row[k]; }
  return null;
}

/* ---------- Parseo de la planilla "Contratos a vencer" (la base) ---------- */
export function parsearContratos(filas) {
  const out = [];
  for (const row of filas) {
    const dni = soloDigitos(buscarCol(row, "numero_doc", "numerodoc", "dni", "documento"));
    if (!dni) continue; // salta filas de encabezado/filtro sin DNI valido
    const nombre = [buscarCol(row, "nombre"), buscarCol(row, "apellido")].filter(Boolean).join(" ").trim();
    const sede = normalizarSede(buscarCol(row, "sucursal contrato", "sucursal"));
    const fechaFin = fechaAISO(buscarCol(row, "fecha fin contrato", "fecha_fin_contrato"));
    if (!nombre || !sede || !fechaFin) continue;
    out.push({
      dni, nombre, sede,
      tipo_socio_n1: buscarCol(row, "tipo_socio_n1") || null,
      tipo_socio_n2: buscarCol(row, "tipo_socio_n2") || null,
      lista_precio: buscarCol(row, "lista precio", "lista_precio") || null,
      fecha_fin_contrato: fechaFin,
    });
  }
  return out;
}

/* ---------- Parseo de "Accesos" ---------- */
export function parsearAccesos(filas) {
  const out = [];
  for (const row of filas) {
    const dni = soloDigitos(buscarCol(row, "numero_doc", "numerodoc", "dni"));
    if (!dni) continue;
    const accesos = buscarCol(row, "accesos");
    if (accesos === null || accesos === undefined || accesos === "") continue;
    out.push({
      dni, asistencias_2m: parseInt(accesos, 10) || 0,
      telefono: soloDigitos(buscarCol(row, "telefono")) || null,
      email: buscarCol(row, "mail", "email") || null,
    });
  }
  return out;
}

/* ---------- Parseo de "NPS y comentarios" ----------
   El DNI viene mezclado en "Apellido - Nombre - DNI". Si la misma
   persona respondio la encuesta varias veces, nos quedamos con la
   respuesta mas reciente segun "Mes - Año de respuesta". */
export function parsearNPS(filas) {
  const porDni = {};
  for (const row of filas) {
    const combinado = buscarCol(row, "apellido - nombre - dni", "apellido-nombre-dni");
    if (!combinado) continue;
    const partes = combinado.toString().split(" - ");
    const dni = soloDigitos(partes[partes.length - 1]);
    if (!dni) continue;
    const npsRaw = buscarCol(row, "nps");
    const nps = npsRaw === null || npsRaw === undefined || npsRaw === "" ? null : parseInt(npsRaw, 10);
    const comentario = buscarCol(row, "comentario") || null;
    const fechaResp = fechaAISO(buscarCol(row, "mes - año de respuesta", "mes - ano de respuesta", "mes-año de respuesta"));
    const anterior = porDni[dni];
    if (!anterior || (fechaResp && (!anterior.nps_fecha_respuesta || fechaResp > anterior.nps_fecha_respuesta))) {
      porDni[dni] = {
        dni, nps_score: nps, nps_comentario: comentario, nps_fecha_respuesta: fechaResp,
        telefono: soloDigitos(buscarCol(row, "telefono")) || null,
        email: buscarCol(row, "mail", "email") || null,
      };
    }
  }
  return Object.values(porDni);
}

/* ============================================================
   Carga a la base. Contratos crea/pisa la base del mes. Accesos
   y NPS solo ENRIQUECEN filas que ya existen para ese mismo mes
   (los DNI que no estan en la base de contratos de ese mes se
   descartan) — asi el universo siempre lo define "Contratos a
   vencer", como pediste.
   ============================================================ */
export async function cargarContratos(filasParsed, { nombre, cargo, creadoPor }) {
  const mesCarga = hoyYYYYMM();
  const filas = filasParsed.map((r) => ({
    ...r, mes_carga: mesCarga, subido_por: nombre, cargo_subido_por: cargo, creado_por: creadoPor,
  }));
  const { error } = await supabase.from("seguimiento_contratos").upsert(filas, { onConflict: "dni,mes_carga" });
  if (error) throw error;
  return filas.length;
}

async function enriquecer(filasNuevas, camposDe) {
  const mesCarga = hoyYYYYMM();
  const { data: existentes, error } = await supabase
    .from("seguimiento_contratos")
    .select("*")
    .eq("mes_carga", mesCarga);
  if (error) throw error;
  const porDni = {};
  existentes.forEach((r) => { porDni[r.dni] = r; });

  const actualizaciones = [];
  let coincidencias = 0;
  for (const fila of filasNuevas) {
    const base = porDni[fila.dni];
    if (!base) continue; // no esta en la base de Contratos de este mes: se descarta
    coincidencias++;
    actualizaciones.push({ ...base, ...camposDe(fila, base) });
  }
  if (actualizaciones.length) {
    const { error: err2 } = await supabase.from("seguimiento_contratos").upsert(actualizaciones, { onConflict: "dni,mes_carga" });
    if (err2) throw err2;
  }
  return { coincidencias, total: filasNuevas.length };
}

export function cargarAccesos(filasParsed) {
  return enriquecer(filasParsed, (f, base) => ({
    asistencias_2m: f.asistencias_2m,
    telefono: f.telefono || base.telefono,
    email: f.email || base.email,
  }));
}
export function cargarNPS(filasParsed) {
  return enriquecer(filasParsed, (f, base) => ({
    nps_score: f.nps_score, nps_comentario: f.nps_comentario, nps_fecha_respuesta: f.nps_fecha_respuesta,
    telefono: f.telefono || base.telefono,
    email: f.email || base.email,
  }));
}

/* ============================================================
   Clasificacion: matriz de "salud del vinculo" (1-10).
   ============================================================ */
export function segmentoNPS(score) {
  if (score === null || score === undefined) return null;
  if (score <= 6) return "Detractor";
  if (score <= 8) return "Pasivo";
  return "Promotor";
}
export function nivelAsistencia(asistencias) {
  if (asistencias === null || asistencias === undefined) return null;
  if (asistencias <= 9) return "Baja";
  if (asistencias <= 23) return "Media";
  return "Alta";
}
const MATRIZ_SALUD = {
  "Alta|Detractor": 5, "Alta|Pasivo": 8, "Alta|Promotor": 10,
  "Media|Detractor": 3, "Media|Pasivo": 5, "Media|Promotor": 7,
  "Baja|Detractor": 1, "Baja|Pasivo": 2, "Baja|Promotor": 4,
};
export function clasificar(r) {
  const segmento = segmentoNPS(r.nps_score);
  const nivel = nivelAsistencia(r.asistencias_2m);
  if (!segmento || !nivel) return { segmento, nivel, score: null, completo: false };
  return { segmento, nivel, score: MATRIZ_SALUD[`${nivel}|${segmento}`], completo: true };
}

/* ============================================================
   Mensajes sugeridos por clasificacion. El cuerpo termina
   siempre en "¡Gracias!" antes de la firma — eso permite recortar
   la firma para el email (que ya lleva la suya propia) del mismo
   modo que en Sleepers.
   ============================================================ */
const ANCLA_CIERRE = "¡Gracias!";

function cuerpoPorClasificacion(nivel, segmento, nombreCompleto) {
  const first = (nombreCompleto || "").trim().split(" ")[0] || "Hola";
  const clave = `${nivel}|${segmento}`;
  const CUERPOS = {
    "Baja|Detractor": `Hola ${first},

Hace un tiempo que no te veo por el gym. Además leí tu comentario sobre tu experiencia con nosotros, y la verdad quiero escucharte — capaz hay algo puntual que podemos resolver.

¿Tenés unos minutos para que hablemos, aunque sea por teléfono? Me importa mucho tu opinión y prefiero conversarlo directamente con vos.

${ANCLA_CIERRE}`,

    "Baja|Pasivo": `Hola ${first},

Noté que hace un tiempo no te veo entrenando. Quería saber cómo estás y si hay algo que te esté complicando venir — a veces alcanza con ajustar el horario o la rutina.

Si querés, coordinamos una vuelta con onboarding para que retomes con todo.

${ANCLA_CIERRE}`,

    "Media|Detractor": `Hola ${first},

Quería charlar con vos porque vi que no estuviste del todo conforme con tu experiencia. Me gustaría entender bien qué podemos mejorar.

¿Tenés unos minutos esta semana para que lo charlemos?

${ANCLA_CIERRE}`,

    "Alta|Detractor": `Hola ${first},

Te veo seguido por el gym, así que antes que nada: ¡gracias por tu constancia! Pero también vi que tu comentario no fue del todo positivo, y me importa entender por qué — viniendo tanto, quiero asegurarme de que tu experiencia sea la mejor posible.

¿Podemos charlarlo en persona la próxima vez que vengas, o preferís que te llame?

${ANCLA_CIERRE}`,

    "Media|Pasivo": `Hola ${first},

Quería contactarte para ver cómo veniste entrenando últimamente y si hay algo en lo que te podamos ayudar.

¿Tenés unos minutos para charlarlo?

${ANCLA_CIERRE}`,

    "Baja|Promotor": `Hola ${first},

Sabemos que nos tenés buena onda, ¡y eso nos pone muy contentos! Pero noté que hace un tiempo no te veo por el gym.

¿Te copa que te arme una rutina corta o te sume a alguna clase para volver con ganas? Contame qué día te queda bien.

${ANCLA_CIERRE}`,

    "Media|Promotor": `Hola ${first},

¡Qué bueno tenerte como socio! Quería saber cómo veniste entrenando y si hay algo que podamos hacer para que sumes más días.

¿Charlamos esta semana?

${ANCLA_CIERRE}`,

    "Alta|Pasivo": `Hola ${first},

Te vemos seguido por el gym, ¡genial! Te escribo simplemente para saber cómo la estás pasando y si hay algo que podamos mejorar para vos.

¿Cuándo te queda bien que lo charlemos?

${ANCLA_CIERRE}`,

    "Alta|Promotor": `Hola ${first},

Se nota tu compromiso viniendo tan seguido, ¡gracias por eso! Quería saludarte y contarte que estamos para lo que necesites.

Ah, y si tenés algún amigo que quiera sumarse, avisame que tenemos beneficios para los dos.

${ANCLA_CIERRE}`,
  };
  return CUERPOS[clave] || null;
}

export function construirMensajeContrato(nombreCompleto, gerente, sede, cargoLabel, dias, nivel, segmento) {
  const g = gerente || "el equipo";
  const s = sede || "tu sede";
  const cuerpo = (nivel && segmento && cuerpoPorClasificacion(nivel, segmento, nombreCompleto))
    || cuerpoGenerico(nombreCompleto);
  return `${cuerpo}

${g}
${cargoLabel || "Gerente"} | Megatlon ${s}`;
}

function cuerpoGenerico(nombreCompleto) {
  const first = (nombreCompleto || "").trim().split(" ")[0] || "Hola";
  return `Hola ${first},

Quería contactarte para ver cómo veniste entrenando y si hay algo en lo que te podamos ayudar.

¿Tenés unos minutos para charlarlo, o preferís que te llame?

${ANCLA_CIERRE}`;
}

// Version sin firma para email (el cliente de correo ya agrega la suya).
export function mensajeContratoSinFirma(mensajeCompleto) {
  const idx = (mensajeCompleto || "").lastIndexOf(ANCLA_CIERRE);
  if (idx === -1) return mensajeCompleto;
  return mensajeCompleto.slice(0, idx + ANCLA_CIERRE.length);
}
