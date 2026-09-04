import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase.js";

/* ============================================================
   Banco de preguntas de la evaluacion — editable desde
   Administrador. Se usa tanto para la pantalla de gestion como
   para rendir la evaluacion en si.
   ============================================================ */
export function useBancoPreguntas() {
  const [preguntas, setPreguntas] = useState([]);
  const [cargando, setCargando] = useState(true);

  const recargar = useCallback(async () => {
    const { data, error } = await supabase
      .from("evaluacion_preguntas")
      .select("*")
      .order("tema", { ascending: true })
      .order("creado_en", { ascending: true });
    if (!error) setPreguntas(data || []);
    setCargando(false);
  }, []);

  useEffect(() => {
    recargar();
    const canal = supabase
      .channel("preguntas-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "evaluacion_preguntas" }, () => recargar())
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [recargar]);

  return { preguntas, cargando, recargar };
}

export async function crearPregunta({ tema, prompt, opciones, correcta, explicacion, creadoPor }) {
  const { error } = await supabase.from("evaluacion_preguntas").insert({
    tema, prompt, opciones, correcta, explicacion, creado_por: creadoPor,
  });
  if (error) throw error;
}

export async function actualizarPregunta(id, campos) {
  const { error } = await supabase.from("evaluacion_preguntas")
    .update({ ...campos, actualizado_en: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function eliminarPregunta(id) {
  const { error } = await supabase.from("evaluacion_preguntas").delete().eq("id", id);
  if (error) throw error;
}

// Para rendir la evaluacion: solo las activas.
export async function obtenerPreguntasActivas() {
  const { data, error } = await supabase
    .from("evaluacion_preguntas")
    .select("*")
    .eq("activa", true);
  if (error) throw error;
  return data || [];
}
