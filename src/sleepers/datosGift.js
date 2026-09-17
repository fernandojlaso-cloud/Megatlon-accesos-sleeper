import { useEffect, useState, useCallback } from "react";
import { supabase } from "../supabase.js";

/* ============================================================
   Hook principal para Gift: mismo patron que useCasos (casos de
   Sleepers), con paginacion y sincronizacion en tiempo real.
   ============================================================ */
export function useGift() {
  const [gift, setGift] = useState([]);
  const [comentariosPorGift, setComentariosPorGift] = useState({});
  const [cargando, setCargando] = useState(true);

  const recargar = useCallback(async () => {
    const TAM_PAGINA = 1000;
    let desde = 0;
    let todos = [];
    while (true) {
      const { data, error } = await supabase
        .from("gift")
        .select("*")
        .order("creado_en", { ascending: false })
        .range(desde, desde + TAM_PAGINA - 1);
      if (error) { console.error(error); break; }
      todos = todos.concat(data || []);
      if (!data || data.length < TAM_PAGINA) break;
      desde += TAM_PAGINA;
    }
    setGift(todos);
    setCargando(false);
  }, []);

  const recargarComentarios = useCallback(async (giftId) => {
    const { data, error } = await supabase
      .from("gift_comentarios")
      .select("*")
      .eq("gift_id", giftId)
      .order("creado_en", { ascending: true });
    if (!error) {
      setComentariosPorGift((prev) => ({ ...prev, [giftId]: data || [] }));
    }
  }, []);

  useEffect(() => {
    recargar();
    const canal = supabase
      .channel("gift-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "gift" }, () => recargar())
      .on("postgres_changes", { event: "*", schema: "public", table: "gift_comentarios" }, (payload) => {
        const giftId = payload.new?.gift_id || payload.old?.gift_id;
        if (giftId) recargarComentarios(giftId);
      })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [recargar, recargarComentarios]);

  return { gift, comentariosPorGift, recargarComentarios, cargando };
}

export async function crearGift(filas) {
  const { error } = await supabase.from("gift").insert(filas);
  if (error) throw error;
}

export async function actualizarGift(id, campos) {
  const { error } = await supabase.from("gift").update(campos).eq("id", id);
  if (error) throw error;
}

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

export async function eliminarGift(ids) {
  await porLotes(ids, 150, async (parte) => {
    const { error } = await supabase.from("gift").delete().in("id", parte);
    if (error) throw error;
  });
}

export async function reasignarSedeGift(ids, nuevaSede) {
  await porLotes(ids, 150, async (parte) => {
    const { error } = await supabase.from("gift").update({ sede: nuevaSede }).in("id", parte);
    if (error) throw error;
  });
}

export async function agregarComentarioGift(giftId, { texto, autor, cargo, creadoPor }) {
  const { error } = await supabase.from("gift_comentarios").insert({
    gift_id: giftId, texto, autor, cargo, creado_por: creadoPor,
  });
  if (error) throw error;
}
