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
