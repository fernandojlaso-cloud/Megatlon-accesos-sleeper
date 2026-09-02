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
    // Supabase/PostgREST devuelve como maximo 1000 filas por pedido salvo que
    // se pida explicitamente con .range(): paginamos hasta traer todo.
    const TAM_PAGINA = 1000;
    let desde = 0;
    let todos = [];
    while (true) {
      const { data, error } = await supabase
        .from("casos")
        .select("*")
        .order("creado_en", { ascending: false })
        .range(desde, desde + TAM_PAGINA - 1);
      if (error) { console.error(error); break; }
      todos = todos.concat(data || []);
      if (!data || data.length < TAM_PAGINA) break;
      desde += TAM_PAGINA;
    }
    setCasos(todos);
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

export async function eliminarCasos(ids) {
  await porLotes(ids, 150, async (parte) => {
    const { error } = await supabase.from("casos").delete().in("id", parte);
    if (error) throw error;
  });
}

export async function reasignarSede(ids, nuevaSede) {
  await porLotes(ids, 150, async (parte) => {
    const { error } = await supabase.from("casos").update({ sede: nuevaSede }).in("id", parte);
    if (error) throw error;
  });
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
