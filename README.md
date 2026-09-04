# EDC Tracker

Version en Next.js (App Router, JavaScript) del tablero "Seguimiento de
actividades EDC", con persistencia real en Supabase (antes usaba
`window.storage`, que solo funcionaba dentro del entorno de Claude).

## 1. Crear la tabla en Supabase

1. Entra a tu proyecto en https://supabase.com/dashboard
2. Ve a **SQL Editor > New query**
3. Copia y pega el contenido de `schema.sql` y dale **Run**

Esto crea la tabla `actividades` con Row Level Security habilitado y
politicas abiertas para la clave publicable (adecuado para una herramienta
interna sin login; si mas adelante agregas autenticacion, ajusta las
politicas en `schema.sql`).

## 2. Variables de entorno

Ya estan puestas en `.env.local` (no se sube a git):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (la publishable key)
- `SUPABASE_SECRET_KEY` (guardada pero sin uso todavia; nunca debe
  exponerse al navegador ni llevar el prefijo `NEXT_PUBLIC_`)

## 3. Instalar y correr

```bash
npm install
npm run dev
```

Abre http://localhost:3000

## 4. Estructura

- `app/page.js` – el tablero (tabla editable, cuenta regresiva, progreso,
  exportar a Excel/PDF)
- `lib/supabaseClient.js` – cliente de Supabase (clave publicable, solo
  cliente)
- `schema.sql` – definicion de la tabla y politicas de RLS

## 5. Deploy

El camino mas simple es Vercel:

```bash
npx vercel
```

y configurar ahi las mismas 2 variables `NEXT_PUBLIC_*` (la secreta no
hace falta a menos que agregues rutas de API con permisos elevados).
