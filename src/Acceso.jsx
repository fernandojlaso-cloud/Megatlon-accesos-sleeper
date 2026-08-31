import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase.js";
import { T, FUENTE, inp, lab, btnMarca, btnOut, btnVerde, Badge, Logo } from "./estilos.jsx";

/* ============================================================
   CONFIGURACION
   Cambiá estos tres valores para adaptarlo a tu proyecto.
   El dominio tiene que coincidir con el que pusiste en el SQL.
   ============================================================ */

export const DOMINIO = "megatlon.com.ar";

export const SEDES = [
  "Alcorta", "Almagro", "Alto Rosario", "Ateneo", "Barracas", "Barrio Norte", "Belgrano",
  "Caballito", "Center", "Devoto", "Distrito Arcos", "Distrito Tecnológico",
  "Floresta", "La Imprenta", "Nuñez", "Puerto Madero", "Recoleta", "Rosario", "SEC",
  "Villa Crespo", "Gonnet", "Martinez", "Martinez 2", "Olivos", "Pilar",
  "Racing Club",
];

export const ROL_LABEL = {
  director: "Direccion",
  supervisor: "Supervisor",
  gerente: "Gerente",
  gerente_servicio: "Gerente de Servicio",
  coordinador_servicio: "Coordinador de Servicio",
  referente_servicio: "Referente de Servicio",
};

const ROLES_PEDIBLES = ["gerente", "supervisor", "gerente_servicio", "coordinador_servicio", "referente_servicio"];
// Lo que puede asignar CUALQUIER aprobador (incluido el Gerente). Direccion
// ademas puede asignar "gerente" y "director" — ver mas abajo donde se usa.
const ROLES_ASIGNABLES = ["gerente_servicio", "coordinador_servicio", "referente_servicio"];

/* ============================================================
   HOOK DE SESION
   Devuelve la sesion, el perfil y si esta cargando.
   Usalo en tu App para decidir que pantalla mostrar.
   ============================================================ */

export function useSesion() {
  const [sesion, setSesion] = useState(undefined);
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const recargarPerfil = useCallback(async () => {
    if (!sesion) { setPerfil(null); setCargando(false); return; }
    setCargando(true);
    const { data } = await supabase.from("usuarios").select("*").eq("id", sesion.user.id).maybeSingle();
    setPerfil(data || null);
    setCargando(false);
  }, [sesion]);

  useEffect(() => { if (sesion !== undefined) recargarPerfil(); }, [sesion, recargarPerfil]);

  const salir = async () => { await supabase.auth.signOut(); setPerfil(null); };

  return { sesion, perfil, cargando, salir, recargarPerfil };
}

/* ============================================================
   PANTALLA DE INGRESO Y REGISTRO
   ============================================================ */

export function Auth({ titulo = "Sistema", subtitulo = "" }) {
  const [modo, setModo] = useState("login");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState("gerente");
  const [sede, setSede] = useState("");
  const [msg, setMsg] = useState(null);
  const [cargando, setCargando] = useState(false);

  const enviar = async () => {
    setMsg(null);
    if (!email.trim() || !pass) return setMsg({ tipo: "err", txt: "Completa correo y contrasena" });
    if (modo === "registro") {
      if (!email.trim().toLowerCase().endsWith("@" + DOMINIO))
        return setMsg({ tipo: "err", txt: "Solo se permiten correos @" + DOMINIO });
      if (!nombre.trim()) return setMsg({ tipo: "err", txt: "Escribi tu nombre y apellido" });
      if (rol !== "supervisor" && !sede) return setMsg({ tipo: "err", txt: "Elegi tu sede" });
      if (pass.length < 8) return setMsg({ tipo: "err", txt: "La contrasena necesita al menos 8 caracteres" });
    }
    setCargando(true);
    try {
      if (modo === "registro") {
        const { error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(), password: pass,
          options: { data: { nombre: nombre.trim(), rol, sede: rol === "supervisor" ? "Todas" : sede }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setMsg({ tipo: "ok", txt: "Cuenta creada. Revisa tu correo para confirmarla. Despues de confirmar, tu acceso queda pendiente de autorizacion." });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: pass });
        if (error) throw error;
      }
    } catch (e) {
      const t = String(e.message || e);
      setMsg({ tipo: "err", txt:
        /Database error|permiten cuentas/i.test(t) ? "Solo se permiten correos @" + DOMINIO
        : /Invalid login/i.test(t) ? "Correo o contrasena incorrectos" : t });
    } finally { setCargando(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: T.negro, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: FUENTE, color: T.ink }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <Logo size={34} />
          {subtitulo && <div style={{ color: T.inkSoft, fontSize: 12.5, marginTop: 9 }}>{subtitulo}</div>}
        </div>
        <div style={{ background: T.surface, border: "1px solid " + T.line, borderRadius: 18, padding: 24 }}>
          <div style={{ display: "flex", gap: 4, background: T.surface2, padding: 4, borderRadius: 11, marginBottom: 20 }}>
            {[["login","Ingresar"],["registro","Crear cuenta"]].map((x) => (
              <button key={x[0]} onClick={() => { setModo(x[0]); setMsg(null); }}
                style={{ flex: 1, border: "none", background: modo === x[0] ? T.marca : "transparent",
                  color: modo === x[0] ? "#fff" : T.inkSoft, fontWeight: 700, fontSize: 13.5,
                  padding: "10px 12px", borderRadius: 9, cursor: "pointer", fontFamily: FUENTE }}>{x[1]}</button>
            ))}
          </div>

          {modo === "registro" && (
            <>
              <label style={lab}>Nombre y apellido</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ ...inp, marginBottom: 16 }} />
            </>
          )}

          <label style={lab}>Correo</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder={"nombre@" + DOMINIO} style={{ ...inp, marginBottom: 16 }} />

          <label style={lab}>Contrasena</label>
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)}
            placeholder={modo === "registro" ? "Al menos 8 caracteres" : ""}
            style={{ ...inp, marginBottom: modo === "registro" ? 16 : 0 }} />

          {modo === "registro" && (
            <>
              <label style={lab}>Que puesto tenes</label>
              <select value={rol} onChange={(e) => setRol(e.target.value)} style={{ ...inp, marginBottom: 16 }}>
                {ROLES_PEDIBLES.map((r) => <option key={r} value={r}>{ROL_LABEL[r]}</option>)}
              </select>
              {rol === "supervisor" ? (
                <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 4 }}>
                  El Supervisor ve todas las sedes, no hace falta elegir una.
                </div>
              ) : (
                <>
                  <label style={lab}>Sede</label>
                  <select value={sede} onChange={(e) => setSede(e.target.value)} style={{ ...inp, color: sede ? T.ink : T.inkSoft }}>
                    <option value="">Elegi tu sede...</option>
                    {SEDES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </>
              )}
            </>
          )}

          {msg && (
            <div style={{ background: msg.tipo === "ok" ? T.greenSoft : T.redSoft,
              color: msg.tipo === "ok" ? T.green : T.red, borderRadius: 10, padding: "11px 14px",
              fontSize: 13, marginTop: 16, fontWeight: 600, lineHeight: 1.45 }}>{msg.txt}</div>
          )}

          <button onClick={enviar} disabled={cargando}
            style={{ ...btnMarca, width: "100%", padding: 14, fontSize: 15, marginTop: 18, opacity: cargando ? 0.7 : 1 }}>
            {cargando ? "Un momento..." : modo === "registro" ? "Crear cuenta" : "Entrar"}
          </button>

          {modo === "registro" && (
            <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 14, lineHeight: 1.55 }}>
              El puesto y la sede que elijas son un pedido. Alguien con permisos confirma tu acceso antes de que puedas ver datos.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   PANTALLA DE ESPERA
   Se muestra mientras la cuenta no esta activa.
   ============================================================ */

export function Pendiente({ perfil, onSalir, titulo = "Sistema" }) {
  const rechazado = perfil && perfil.estado === "rechazado";
  const inactivo = perfil && perfil.estado === "inactivo";
  return (
    <div style={{ minHeight: "100vh", background: T.negro, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: FUENTE, color: T.ink }}>
      <div style={{ background: T.surface, border: "1px solid " + T.line, borderRadius: 18, padding: 30, maxWidth: 450, textAlign: "center" }}>
        <Logo size={26} />
        <div style={{ fontSize: 17, fontWeight: 700, margin: "18px 0 8px" }}>
          {rechazado ? "Tu solicitud fue rechazada"
            : inactivo ? "Tu acceso fue dado de baja"
            : "Tu acceso esta pendiente de autorizacion"}
        </div>
        <div style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.6 }}>
          {rechazado || inactivo
            ? "Si crees que es un error, habla con quien administra el sistema."
            : "Pediste " + (ROL_LABEL[perfil && perfil.rol_solicitado] || "acceso")
              + (perfil && perfil.sede_solicitada ? " en " + perfil.sede_solicitada : "")
              + ". Lo van a revisar en breve."}
        </div>
        <button onClick={onSalir} style={{ ...btnOut, marginTop: 22 }}>Salir</button>
      </div>
    </div>
  );
}

/* ============================================================
   PANEL DE EQUIPO
   Aprobar, rechazar, cambiar rol y sede, dar de baja.
   ============================================================ */

export function Equipo({ perfil }) {
  const [usuarios, setUsuarios] = useState([]);
  const [edit, setEdit] = useState({});
  const esDireccion = perfil.rol === "director";

  const cargar = useCallback(async () => {
    const { data } = await supabase.from("usuarios").select("*").order("creado_en", { ascending: false });
    setUsuarios(data || []);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async (id, cambios) => {
    const patch = { ...cambios };
    if (cambios.estado === "activo") { patch.aprobado_por = perfil.id; patch.aprobado_en = new Date().toISOString(); }
    if (cambios.estado === "inactivo") patch.desactivado_en = new Date().toISOString();
    await supabase.from("usuarios").update(patch).eq("id", id);
    await cargar();
  };

  const valorRol = (u) => (edit[u.id]?.rol !== undefined ? edit[u.id].rol : (u.rol || u.rol_solicitado || "vendedor"));
  const valorSede = (u) => (edit[u.id]?.sede !== undefined ? edit[u.id].sede : (u.sede || u.sede_solicitada || perfil.sede));
  const cambiar = (id, k, v) => setEdit((e) => ({ ...e, [id]: { ...(e[id] || {}), [k]: v } }));

  const pendientes = usuarios.filter((u) => u.estado === "pendiente");
  const activos = usuarios.filter((u) => u.estado === "activo");
  const otros = usuarios.filter((u) => u.estado === "inactivo" || u.estado === "rechazado");

  const fila = (u, modo) => (
    <div key={u.id} style={{ background: T.surface, border: "1px solid " + T.line,
      borderLeft: "3px solid " + (modo === "pendiente" ? T.amber : u.estado === "activo" ? T.green : T.line),
      borderRadius: 16, padding: "15px 17px" }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 15.5 }}>{u.nombre}</div>
        <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 3 }}>{u.email}</div>
        {modo === "pendiente" ? (
          <div style={{ fontSize: 12.5, color: T.amber, marginTop: 6, fontWeight: 600 }}>
            Pidio: {ROL_LABEL[u.rol_solicitado] || "sin especificar"}
            {u.sede_solicitada ? " en " + u.sede_solicitada : ""}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <Badge tone={u.estado === "activo" ? "green" : "gris"}>
              {u.estado === "activo" ? "Activo" : u.estado === "inactivo" ? "Dado de baja" : "Rechazado"}
            </Badge>
            {u.rol && <Badge tone="marca">{ROL_LABEL[u.rol]}</Badge>}
            {u.sede && <Badge tone="gris">{u.sede}</Badge>}
          </div>
        )}
      </div>

      {u.id !== perfil.id && (
        <div style={{ borderTop: "1px solid " + T.line, marginTop: 14, paddingTop: 14 }}>
          <div style={{ display: "flex", gap: 11, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 160px" }}>
              <label style={{ ...lab, fontSize: 11 }}>Rol que le asignas</label>
              <select value={valorRol(u)} onChange={(e) => cambiar(u.id, "rol", e.target.value)} style={{ ...inp, padding: "10px 12px" }}>
                {ROLES_ASIGNABLES.map((r) => <option key={r} value={r}>{ROL_LABEL[r]}</option>)}
                {esDireccion && <option value="gerente">Gerente</option>}
                {esDireccion && <option value="supervisor">Supervisor</option>}
                {esDireccion && <option value="director">Direccion</option>}
              </select>
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <label style={{ ...lab, fontSize: 11 }}>Sede</label>
              <select value={valorSede(u)} onChange={(e) => cambiar(u.id, "sede", e.target.value)}
                disabled={!esDireccion} style={{ ...inp, padding: "10px 12px", opacity: esDireccion ? 1 : 0.6 }}>
                {SEDES.concat(esDireccion ? ["Todas"] : []).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 13, flexWrap: "wrap" }}>
            <button onClick={() => guardar(u.id, { estado: "activo", rol: valorRol(u), sede: valorSede(u) })} style={btnVerde}>
              {u.estado === "activo" ? "Guardar cambios" : "Aprobar acceso"}
            </button>
            {u.estado === "pendiente" && (
              <button onClick={() => guardar(u.id, { estado: "rechazado" })}
                style={{ ...btnOut, color: T.red, borderColor: T.red }}>Rechazar</button>
            )}
            {u.estado === "activo" && (
              <button onClick={() => guardar(u.id, { estado: "inactivo" })}
                style={{ ...btnOut, color: T.inkSoft }}>Dar de baja</button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const titulo = { fontSize: 20, fontWeight: 800, textTransform: "uppercase", letterSpacing: "-.01em" };

  return (
    <div style={{ fontFamily: FUENTE, color: T.ink }}>
      {pendientes.length > 0 && (
        <>
          <div style={titulo}>Esperando tu autorizacion</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "12px 0 26px" }}>
            {pendientes.map((u) => fila(u, "pendiente"))}
          </div>
        </>
      )}
      <div style={titulo}>Equipo activo</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        {activos.map((u) => fila(u, "activo"))}
      </div>
      {otros.length > 0 && (
        <>
          <div style={{ ...titulo, marginTop: 26 }}>Sin acceso</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {otros.map((u) => fila(u, "otro"))}
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================
   REGISTRO DE ACTIVIDAD
   ============================================================ */

export function Actividad({ limite = 60 }) {
  const [log, setLog] = useState([]);
  useEffect(() => {
    supabase.from("actividad_log").select("*")
      .order("ocurrido_en", { ascending: false }).limit(limite)
      .then(({ data }) => setLog(data || []));
  }, [limite]);

  const ACC = {
    cuenta_aprobada: ["Cuenta aprobada", "green"],
    cuenta_rechazada: ["Cuenta rechazada", "red"],
    cuenta_dada_de_baja: ["Baja de acceso", "red"],
    perfil_modificado: ["Perfil modificado", "amber"],
    insert: ["Registro creado", "green"],
    update: ["Registro modificado", "blue"],
    delete: ["Registro borrado", "red"],
    socio_cargado: ["Socio cargado", "green"],
    socio_eliminado: ["Socio eliminado", "red"],
    socio_modificado: ["Socio modificado", "blue"],
    estado_cambiado: ["Estado cambiado", "amber"],
    motivo_cargado: ["Motivo cargado", "blue"],
    riesgo_actualizado: ["Riesgo actualizado", "amber"],
    sede_reasignada: ["Sede reasignada", "blue"],
    mensaje_enviado: ["Mensaje enviado", "green"],
    seguimiento_programado: ["Seguimiento programado", "blue"],
    intencion_volver_cargada: ["Intención de volver cargada", "blue"],
    datos_corregidos: ["Datos corregidos", "amber"],
    comentario_agregado: ["Comentario agregado", "blue"],
  };

  const fmt = (iso) => iso
    ? new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div style={{ fontFamily: FUENTE, color: T.ink }}>
      <div style={{ fontSize: 20, fontWeight: 800, textTransform: "uppercase" }}>Registro de actividad</div>
      <div style={{ fontSize: 13, color: T.inkSoft, margin: "6px 0 15px" }}>
        Cada accion queda registrada automaticamente por la base de datos.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {log.map((l) => {
          const a = ACC[l.accion] || [l.accion, "gris"];
          return (
            <div key={l.id} style={{ background: T.surface, border: "1px solid " + T.line, borderRadius: 13,
              padding: "12px 16px", display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ minWidth: 200, flex: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <Badge tone={a[1]}>{a[0]}</Badge>
                  <span style={{ fontWeight: 700, fontSize: 13.5 }}>{l.usuario_nombre || "Sistema"}</span>
                  {l.rol && <span style={{ fontSize: 12, color: T.inkSoft }}>{ROL_LABEL[l.rol]}</span>}
                  {l.sede && <Badge tone="gris">{l.sede}</Badge>}
                </div>
                {l.detalle && (
                  <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 5 }}>
                    {Object.keys(l.detalle).filter((k) => l.detalle[k] != null)
                      .map((k) => k + ": " + l.detalle[k]).join(" - ")}
                  </div>
                )}
              </div>
              <span style={{ fontSize: 11.5, color: T.inkSoft, whiteSpace: "nowrap" }}>{fmt(l.ocurrido_en)}</span>
            </div>
          );
        })}
        {log.length === 0 && (
          <div style={{ background: T.surface, border: "1px dashed " + T.line, borderRadius: 14,
            padding: 30, textAlign: "center", color: T.inkSoft }}>Todavia no hay actividad registrada.</div>
        )}
      </div>
    </div>
  );
}
