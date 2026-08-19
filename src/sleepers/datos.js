import { useEffect, useState, useCallback } from "react";
import { supabase } from "../supabase.js";

/* ============================================================
   Hook principal: trae los casos (filtrados por las políticas
   de la base, según sede/rol) y se mantiene sincronizado en
   tiempo real, igual que hacia onSnapshot con Firestore.
   ============================================================ */
export function useCasos() {
  const [casos, setCasos] = useState([]);
  const [comentariosPorCaso, setComentariosPorCaso] = useState({});
  const [cargando, setCargando] = useState(true);

  const recargar = useCallback(async () => {
    const { data, error } = await supabase
      .from("casos")
      .select("*")
      .order("creado_en", { ascending: false });
    if (!error) setCasos(data || []);
    setCargando(false);
  }, []);

  const recargarComentarios = useCallback(async (casoId) => {
    const { data, error } = await supabase
      .from("comentarios")
      .select("*")
      .eq("caso_id", casoId)
      .order("creado_en", { ascending: true });
    if (!error) {
      setComentariosPorCaso((prev) => ({ ...prev, [casoId]: data || [] }));
    }
  }, []);

  useEffect(() => {
    recargar();
    const canal = supabase
      .channel("casos-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "casos" }, () => recargar())
      .on("postgres_changes", { event: "*", schema: "public", table: "comentarios" }, (payload) => {
        const casoId = payload.new?.caso_id || payload.old?.caso_id;
        if (casoId) recargarComentarios(casoId);
      })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [recargar, recargarComentarios]);

  return { casos, comentariosPorCaso, recargarComentarios, cargando };
}

export async function crearCasos(filas) {
  const { error } = await supabase.from("casos").insert(filas);
  if (error) throw error;
}

export async function actualizarCaso(id, campos) {
  const { error } = await supabase.from("casos").update(campos).eq("id", id);
  if (error) throw error;
}

export async function eliminarCasos(ids) {
  const { error } = await supabase.from("casos").delete().in("id", ids);
  if (error) throw error;
}

export async function reasignarSede(ids, nuevaSede) {
  const { error } = await supabase.from("casos").update({ sede: nuevaSede }).in("id", ids);
  if (error) throw error;
}

export async function agregarComentario(casoId, { texto, autor, cargo, creadoPor }) {
  const { error } = await supabase.from("comentarios").insert({
    caso_id: casoId, texto, autor, cargo, creado_por: creadoPor,
  });
  if (error) throw error;
}

export function useSociosTotales() {
  const [totales, setTotales] = useState({});

  const recargar = useCallback(async () => {
    const { data, error } = await supabase.from("socios_totales").select("*");
    if (!error) {
      const mapa = {};
      (data || []).forEach((r) => { mapa[r.sede] = r.total; });
      setTotales(mapa);
    }
  }, []);

  useEffect(() => { recargar(); }, [recargar]);

  const guardar = useCallback(async (sede, total) => {
    const { error } = await supabase.from("socios_totales").upsert({ sede, total });
    if (error) throw error;
    await recargar();
  }, [recargar]);

  return { totales, guardar };
}
