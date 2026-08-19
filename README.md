# Sistema de accesos y registro de actividad

Paquete listo para instalar en cualquier proyecto con **Supabase + React + Vercel**.

Incluye tres cosas que suelen dar trabajo y acá ya están resueltas:

**Registro con aprobación.** Cada persona se registra sola, pero entra en estado *pendiente* y no ve absolutamente nada hasta que alguien la aprueba. Lo que elige al registrarse (puesto y sede) es solo un pedido: quien aprueba decide el rol real.

**Permisos dentro de la base, no en la pantalla.** Si un vendedor no puede borrar, no puede borrar aunque manipule la aplicación. Es Postgres el que rechaza la operación.

**Registro de actividad automático.** Son disparadores de la base, así que no depende de que la app se acuerde de escribir el log. Queda quién hizo qué, cuándo y en qué sede.

---

## Instalación

### 1. Base de datos

En Supabase, abrí el **SQL Editor** y corré los dos archivos **en orden**:

1. `db/01-accesos.sql`
2. `db/02-actividad.sql`

**Antes de correr el primero**, editá dos líneas al final del archivo, en la función `crear_usuario_desde_auth()`:

```sql
dominio_permitido text := 'megatlon.com.ar';        -- tu dominio
mail_director     text := 'flaso@megatlon.com.ar';  -- tu mail
```

El mail que pongas ahí se activa solo como director la primera vez que se registre. Es la única excepción del sistema; alguien tiene que ser el primero.

### 2. Configurar la app

```bash
npm install
cp .env.example .env
```

Completá `.env` con la URL y la clave de tu proyecto (**Project Settings → API**):

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_KEY=sb_publishable_...
```

> La clave *publishable* (o *anon*) es pública por diseño y va dentro de la app sin riesgo. La seguridad la dan las políticas de la base. **La `service_role` key nunca va acá.**

Después, en `src/Acceso.jsx`, ajustá tres constantes arriba de todo: el dominio de correo, la lista de sedes y las etiquetas de los roles.

### 3. Probar

```bash
npm run dev
```

Abre en `http://localhost:5173`. Registrate con el mail que pusiste como director: vas a entrar directo. Registrate con otro mail del mismo dominio: vas a ver la pantalla de espera hasta que lo apruebes desde la solapa **Equipo**.

### 4. Publicar en Vercel

Importá el proyecto desde el panel de Vercel. Detecta Vite solo.

Cargá las dos variables de entorno en **Settings → Environment Variables**, con los mismos nombres que en el `.env`.

**Un paso que se olvida siempre:** en Supabase, entrá a **Authentication → URL Configuration** y poné tu dirección de Vercel en **Site URL**. Si no, el mail de confirmación manda a `localhost` y nadie puede confirmar su cuenta.

Y revisá en Vercel que **Deployment Protection** esté desactivada, o va a pedir cuenta de Vercel antes de mostrar tu pantalla de ingreso.

---

## Cómo usarlo en tu app

`src/App.jsx` es un ejemplo mínimo. La parte que importa:

```jsx
const { sesion, perfil, cargando, salir } = useSesion();

if (!sesion) return <Auth />;                          // login
if (perfil?.estado !== "activo") return <Pendiente />;  // esperando aprobación
// acá adentro, el usuario está aprobado
```

Dentro tenés el objeto `perfil` con `id`, `nombre`, `rol` y `sede`. Usalo para decidir qué mostrar.

## Cómo proteger tus propias tablas

Agregale una columna `sede text not null` a tu tabla y copiá el molde que está comentado al final de `db/02-actividad.sql`. Son cuatro políticas: leer, crear, editar y borrar.

Lo mismo para el log: hay un molde de disparador que copiás cambiando el nombre de la tabla.

## Si tu proyecto no tiene sedes

El campo `sede` es lo que separa los datos por grupo. Puede representar una sucursal, un equipo, un cliente o lo que necesites — es texto libre.

Si no te hace falta separar nada, la salida más simple es dejarlo y ponerle a todos el mismo valor, por ejemplo `"General"`. Sacar la columna implica tocar todas las políticas y no vale la pena.

## Los cinco roles

| Rol | Alcance |
|---|---|
| **director** | Todo, todas las sedes. Puede crear otros directores. |
| **gerente** | Su sede. Aprueba y edita a su equipo, pero no puede crear un director ni mover gente a otra sede. |
| **vendedor** | Carga y edita registros de su sede. No puede borrar. |
| **profesor** | Acceso acotado, definido por vos en las políticas. |
| **control_acceso** | Solo lectura. |

Cambiá los nombres en el `enum` del SQL si no encajan con tu proyecto. Si los cambiás, actualizá también `ROL_LABEL` en `src/Acceso.jsx`.

---

## Un recordatorio

En cuanto esto guarde datos de personas reales, estás manejando datos personales. Conviene que el área de sistemas o legales de la empresa sepa que el sistema existe y dónde están alojados los datos. Es un trámite corto y mejor hacerlo antes de tener cientos de registros adentro.
