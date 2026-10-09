# Rokola

Rokola para bar construida con Next.js. Incluye una vista pública para pedir canciones, el reproductor de sala y el panel privado.

## Desarrollo local

Requiere Node.js 20 o superior.

1. Copia `.env.example` a `.env.local`.
2. Define `ADMIN_PASSWORD` y `AUTH_SECRET` (usa una cadena aleatoria larga para este último).
3. Opcionalmente define `YOUTUBE_API_KEY`; sin ella se pueden añadir videos pegando enlaces de YouTube.
4. Ejecuta `npm install` y `npm run dev`.
5. Abre `http://localhost:3000`, administra en `/admin` y reproduce en `/player`.

Sin credenciales de Redis, la cola se guarda en memoria y se vacía al reiniciar el servidor. Para despliegue configura `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`, además de las variables de entorno descritas en `.env.example`.

## Despliegue

Conecta este directorio como proyecto Next.js en Vercel, configura las variables de entorno y conecta una base Upstash Redis. Configura `NEXT_PUBLIC_SITE_URL` con el dominio público para el QR. GitHub/Vercel, las credenciales de Upstash y la clave de Google deben configurarse en las cuentas correspondientes; no se incluyen secretos en el repositorio.

### Publicación en Vercel (paso 10)

1. Sube el repositorio a GitHub. En Vercel importa el repositorio y establece `rokola` como **Root Directory**.
2. En Storage conecta una instancia Upstash Redis. Asegúrate de que queden disponibles `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`.
3. En Settings → Environment Variables define `ADMIN_PASSWORD`, `AUTH_SECRET`, `MAX_PER_CLIENT` y, si quieres búsquedas por texto, `YOUTUBE_API_KEY`.
4. Despliega. Copia el dominio asignado en `NEXT_PUBLIC_SITE_URL` y vuelve a desplegar para que el QR lo use.
5. Recorre el flujo completo en el sitio publicado. Se requieren las cuentas de GitHub/Vercel, las credenciales de Google y la base Upstash del propietario; no se puede completar ese aprovisionamiento desde el repositorio local.
