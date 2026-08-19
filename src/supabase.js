import { createClient } from "@supabase/supabase-js";

/* La clave publishable (o anon) es publica por diseno: va dentro
   de la app sin riesgo. La seguridad la dan las politicas de la
   base, no el ocultamiento de esta clave.

   NUNCA pongas aca la service_role key. */

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
);
