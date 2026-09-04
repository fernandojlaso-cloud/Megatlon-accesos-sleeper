import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase.js";
import { completarPlaceholders } from "./datosPlantillas.js";

/* ============================================================
   Hook principal con sincronizacion en tiempo real, igual patron
   que useCasos.
   ============================================================ */
export function useSeguimientoContratos() {
  const [registros, setRegistros] = useState([]);
  const [comentariosPorRegistro, setComentariosPorRegistro] = useState({});

  const recargar = useCallback(async () => {
    // Supabase/PostgREST devuelve como maximo 1000 filas por pedido salvo que
    // se pida explicitamente con .range(): paginamos hasta traer todo.
    const TAM_PAGINA = 1000;
    let desde = 0;
    let todos = [];
    while (true) {
      const { data, error } = await supabase
        .from("seguimiento_contratos")
        .select("*")
        .order("fecha_fin_contrato", { ascending: true })
        .order("id", { ascending: true })
        .range(desde, desde + TAM_PAGINA - 1);
      if (error) { console.error(error); break; }
      todos = todos.concat(data || []);
      if (!data || data.length < TAM_PAGINA) break;
      desde += TAM_PAGINA;
    }
    setRegistros(todos);
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
// Con selecciones grandes, mandar todos los ID en un solo pedido genera una URL
// gigante que corta la conexion ("Failed to fetch"). Lo partimos en lotes.
async function porLotes(ids, tam, fn) {
  for (let i = 0; i < ids.length; i += tam) {
    const parte = ids.slice(i, i + tam);
    let intentos = 0;
    while (true) {
      try { await fn(parte); break; }
      catch (err) {
        intentos++;
        if (intentos >= 4) throw err;
        await new Promise((res) => setTimeout(res, 1000 * intentos));
      }
    }
    if (i + tam < ids.length) await new Promise((res) => setTimeout(res, 300));
  }
}

export async function eliminarRegistros(ids) {
  await porLotes(ids, 150, async (parte) => {
    const { error } = await supabase.from("seguimiento_contratos").delete().in("id", parte);
    if (error) throw error;
  });
}
export async function reasignarSedeRegistros(ids, nuevaSede) {
  await porLotes(ids, 150, async (parte) => {
    const { error } = await supabase.from("seguimiento_contratos").update({ sede: nuevaSede }).in("id", parte);
    if (error) throw error;
  });
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
// Se sube TODO el archivo de Contratos, sin filtrar por dias — el filtro de
// 91-150 dias solo se aplica en pantalla (ver "enVentana" en ContratosVencer.jsx),
// no en lo que se guarda. Asi el historial queda completo para consultarlo mas
// adelante aunque hoy no aparezca en el listado principal.
export function parsearContratos(filas) {
  const out = [];
  let sinDni = 0;
  for (const row of filas) {
    const dni = soloDigitos(buscarCol(row, "numero_doc", "numerodoc", "dni", "documento"));
    if (!dni) { sinDni++; continue; } // sin DNI no hay forma de identificar/cruzar al socio, se descarta
    const nombre = [buscarCol(row, "nombre"), buscarCol(row, "apellido")].filter(Boolean).join(" ").trim();
    const sedeOriginal = normalizarSede(buscarCol(row, "sucursal contrato", "sucursal"));
    const fechaFin = fechaAISO(buscarCol(row, "fecha fin contrato", "fecha_fin_contrato"));
    if (!nombre || !fechaFin) continue;
    const sinSede = !sedeOriginal;
    out.push({
      dni, nombre, sede: sedeOriginal || "Sin sede",
      // Sin sede no se puede asignar a ningun equipo para trabajarlo: se carga
      // igual (no desaparece de la planilla) pero directamente dado de baja.
      estado: sinSede ? "Cerrado" : "Abierto",
      tipo_socio_n1: buscarCol(row, "tipo_socio_n1") || null,
      tipo_socio_n2: buscarCol(row, "tipo_socio_n2") || null,
      lista_precio: buscarCol(row, "lista precio", "lista_precio") || null,
      fecha_fin_contrato: fechaFin,
    });
  }
  out.sinDni = sinDni;
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
   Carga a la base: todo se combina en el navegador ANTES de
   guardar nada. Contratos define el universo de DNI del mes;
   Accesos y NPS solo aportan datos a esos mismos DNI (lo que no
   matchea se informa pero se descarta). Se graba todo junto con
   un solo guardado, para que no haya pasos parciales confusos.
   ============================================================ */
export function combinarPlanillas(contratosParsed, accesosParsed, npsParsed) {
  const accesosPorDni = {};
  accesosParsed.forEach((a) => { accesosPorDni[a.dni] = a; });
  const npsPorDni = {};
  npsParsed.forEach((n) => { npsPorDni[n.dni] = n; });

  let matchAccesos = 0, matchNPS = 0;
  const filas = contratosParsed.map((c) => {
    const acc = accesosPorDni[c.dni];
    const nps = npsPorDni[c.dni];
    if (acc) matchAccesos++;
    if (nps) matchNPS++;
    return {
      ...c,
      asistencias_2m: acc ? acc.asistencias_2m : null,
      telefono: (nps && nps.telefono) || (acc && acc.telefono) || null,
      email: (nps && nps.email) || (acc && acc.email) || null,
      nps_score: nps ? nps.nps_score : null,
      nps_comentario: nps ? nps.nps_comentario : null,
      nps_fecha_respuesta: nps ? nps.nps_fecha_respuesta : null,
    };
  });

  return {
    filas,
    totalContratos: contratosParsed.length,
    totalAccesos: accesosParsed.length,
    totalNPS: npsParsed.length,
    matchAccesos, matchNPS,
  };
}

export async function guardarSeguimientoMes(filas, { nombre, cargo, creadoPor }, onProgreso) {
  const mesCarga = hoyYYYYMM();
  const filasFinal = filas.map((r) => ({
    ...r, mes_carga: mesCarga, subido_por: nombre, cargo_subido_por: cargo, creado_por: creadoPor,
  }));
  const LOTE = 150;
  const totalLotes = Math.ceil(filasFinal.length / LOTE) || 1;
  const espera = (ms) => new Promise((res) => setTimeout(res, ms));
  for (let i = 0; i < filasFinal.length; i += LOTE) {
    const parte = filasFinal.slice(i, i + LOTE);
    const numLote = Math.floor(i / LOTE) + 1;
    if (onProgreso) onProgreso(numLote, totalLotes);
    let intentos = 0;
    while (true) {
      try {
        const { error } = await supabase.from("seguimiento_contratos").upsert(parte, { onConflict: "dni,mes_carga" });
        if (error) throw error;
        break;
      } catch (err) {
        intentos++;
        if (intentos >= 4) throw new Error(`Se cortó en el lote ${numLote} de ${totalLotes} (${err.message || err}). Ya se guardaron los anteriores — probá subir de nuevo, los que ya están se van a actualizar sin duplicarse.`);
        await espera(1000 * intentos); // 1s, 2s, 3s entre reintentos
      }
    }
    // Pausa corta entre lotes para no saturar la conexión con pedidos seguidos.
    if (i + LOTE < filasFinal.length) await espera(350);
  }
  return filasFinal.length;
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
  if (segmento && nivel) {
    return { segmento, nivel, score: MATRIZ_SALUD[`${nivel}|${segmento}`], completo: true };
  }
  // Sin respuesta de NPS: nos regimos solo por la asistencia, con otros cortes
  // (distintos de los de la matriz, que son 1-9 critico / 10-28 atencion / 29+ saludable).
  if (!segmento && r.asistencias_2m !== null && r.asistencias_2m !== undefined) {
    const a = r.asistencias_2m;
    const score = a <= 9 ? 1 : a <= 28 ? 4 : 7;
    return { segmento: null, nivel: null, score, completo: true, soloAsistencia: true };
  }
  return { segmento, nivel, score: null, completo: false };
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

Hace unos días noté que no estás viniendo seguido y leí tu comentario sobre tu experiencia. Me importa mucho escucharte y saber qué podemos resolver.

¿Tenés 5 minutos hoy para que lo charlemos por teléfono o preferís que lo conversemos por acá? Quiero asegurarme de darte una solución.

${ANCLA_CIERRE}`,

    "Baja|Pasivo": `Hola ${first},

¡Cómo estás! Noté que bajaste la frecuencia de entrenamiento estas semanas. Quería saber si hay algo en lo que te pueda ayudar o si algo te está complicando venir.

Si querés, coordinamos un re-onboarding para armar una rutina nueva y retomar con todo. ¡Avisame!

${ANCLA_CIERRE}`,

    "Media|Detractor": `Hola ${first},

¿Cómo va? Estuve viendo tus comentarios y noté que hay cosas de tu experiencia en la sede que no te cerraron del todo. Me gustaría entender bien qué podemos mejorar.

¿Tendrás unos minutos esta semana para charlarlo brevemente?

${ANCLA_CIERRE}`,

    "Alta|Detractor": `Hola ${first},

¡Te veo entrenando un montón y te agradezco un montón la constancia! Por otro lado, vi que tu devolución no fue del todo positiva y quiero entender por qué. Viniendo tanto, tu experiencia tiene que ser impecable.

¿Charlamos un minutito la próxima vez que pases por recepción?

${ANCLA_CIERRE}`,

    "Media|Pasivo": `Hola ${first},

¡Hola! Quería escribirte para saber cómo venís con tus entrenamientos y si hay algo en lo que te podamos dar una mano para que disfrutes más de la sede.

¿Cómo viene tu semana?

${ANCLA_CIERRE}`,

    "Baja|Promotor": `Hola ${first},

¡Sabemos que nos tenés súper buena onda y eso nos encanta! Pero noté que hace un tiempo no te cruzamos por el club.

¿Te armamos una rutina corta o te sumamos a alguna clase para volver con ganas esta semana? Contame qué día te queda cómodo.

${ANCLA_CIERRE}`,

    "Media|Promotor": `Hola ${first},

¡Qué bueno tenerte siempre firme como socio! Quería saber cómo venís entrenando y si conocés nuestra grilla actual de clases o si precisás renovar tu plan de entrenamiento.

¡Estamos para lo que necesites!

${ANCLA_CIERRE}`,

    "Alta|Pasivo": `Hola ${first},

Te vemos siempre entrenando por acá y nos encanta tu constancia — ¡gracias por elegirnos! Te escribo simplemente para saber cómo la estás pasando y si hay algo que podamos sumar para mejorar tu día a día en el club.

${ANCLA_CIERRE}`,

    "Alta|Promotor": `Hola ${first},

¡Se nota tu compromiso viniendo tan seguido, gracias por la buena energía de siempre! Queríamos saludarte y recordarte que estamos para lo que necesites.

Ah, y si tenés algún amigo o familiar que quiera sumarse a entrenar, avisame: tenemos un beneficio especial para vos y 1 mes bonificado para él.

${ANCLA_CIERRE}`,
  };
  return CUERPOS[clave] || null;
}

export function construirMensajeContrato(nombreCompleto, gerente, sede, cargoLabel, dias, nivel, segmento, plantillas) {
  const g = gerente || "el equipo";
  const s = sede || "tu sede";
  const claveDb = nivel && segmento && plantillas ? plantillas[`contratos|${nivel}|${segmento}`] : null;
  const cuerpo = claveDb
    ? completarPlaceholders(claveDb, { nombre: nombreCompleto, gerente: g, cargo: cargoLabel, sede: s })
    : ((nivel && segmento && cuerpoPorClasificacion(nivel, segmento, nombreCompleto)) || cuerpoGenerico(nombreCompleto));
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
