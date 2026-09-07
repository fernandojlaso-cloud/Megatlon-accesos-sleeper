import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase.js";

/* ============================================================
   Plantillas de mensajes — editables desde Administrador.
   ============================================================ */
export function useMensajesPlantillas() {
  const [plantillas, setPlantillas] = useState([]);
  const [cargando, setCargando] = useState(true);

  const recargar = useCallback(async () => {
    const { data, error } = await supabase
      .from("mensajes_plantillas")
      .select("*")
      .order("tema", { ascending: true })
      .order("creado_en", { ascending: true });
    if (!error) setPlantillas(data || []);
    setCargando(false);
  }, []);

  useEffect(() => {
    recargar();
    const canal = supabase
      .channel("plantillas-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "mensajes_plantillas" }, () => recargar())
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [recargar]);

  return { plantillas, cargando, recargar };
}

export async function crearPlantilla({ tema, clave, etiqueta, cuerpo, actualizadoPor }) {
  const { error } = await supabase.from("mensajes_plantillas").insert({
    tema, clave, etiqueta, cuerpo, actualizado_por: actualizadoPor,
  });
  if (error) throw error;
}

export async function actualizarPlantilla(id, campos) {
  const { error } = await supabase.from("mensajes_plantillas")
    .update({ ...campos, actualizado_en: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function eliminarPlantilla(id) {
  const { error } = await supabase.from("mensajes_plantillas").delete().eq("id", id);
  if (error) throw error;
}

// Trae las plantillas activas como mapa "tema|clave" -> cuerpo, para usar al armar mensajes.
export async function obtenerPlantillasActivas() {
  const { data, error } = await supabase
    .from("mensajes_plantillas")
    .select("tema, clave, cuerpo")
    .eq("activa", true);
  if (error) throw error;
  const mapa = {};
  (data || []).forEach((p) => { mapa[`${p.tema}|${p.clave}`] = p.cuerpo; });
  return mapa;
}

export function completarPlaceholders(texto, { nombre, gerente, cargo, sede }) {
  const first = (nombre || "").trim().split(" ")[0] || nombre || "Hola";
  return (texto || "")
    .replaceAll("{nombre}", first)
    .replaceAll("{gerente}", gerente || "el equipo")
    .replaceAll("{cargo}", cargo || "Gerente")
    .replaceAll("{sede}", sede || "tu sede");
}

function construirMensajeFallback(nombre, gerente, sede, cargoLabel) {
  const first = (nombre || "").trim().split(" ")[0] || nombre || "Hola";
  const g = gerente || "el equipo";
  const s = sede || "tu sede";
  const cRol = (cargoLabel || "Gerente").toLowerCase();
  return `Hola ${first},

Espero que estés muy bien.

Soy ${g}, ${cRol} de Megatlon ${s}.

Te escribo porque hace un tiempo que no te vemos entrenando y quería contactarme personalmente para saber cómo estás.

Más allá del gimnasio, entendemos que cada persona atraviesa momentos, cambios de rutina, temas laborales, familiares o de salud que pueden hacer difícil mantener la actividad física. Por eso me gustaría conocer tu situación y ver si hay algo en lo que podamos ayudarte.

Si te parece, contame cuál es el principal motivo por el que dejaste de asistir:

• Falta de tiempo.
• Lesión o tema de salud.
• Situaciones personales o familiares.
• Cambio de domicilio o lugar de trabajo.
• Algún aspecto de tu experiencia en el gimnasio que no haya cumplido tus expectativas.
• Otro motivo.

No se trata de una venta ni de una campaña comercial. Simplemente queremos acompañarte mejor.

Te agradezco mucho el tiempo para responder este mensaje.

${g}
${cargoLabel || "Gerente"} | Megatlon ${s}`;
}

export function construirMensajeSleeper(nombre, gerente, sede, cargoLabel, plantillas) {
  const g = gerente || "el equipo";
  const s = sede || "tu sede";
  const claveDb = plantillas && plantillas["sleepers|general"];
  if (!claveDb) return construirMensajeFallback(nombre, gerente, sede, cargoLabel);
  const cuerpo = completarPlaceholders(claveDb, { nombre, gerente: g, cargo: cargoLabel, sede: s });
  return `${cuerpo}

${g}
${cargoLabel || "Gerente"} | Megatlon ${s}`;
}
