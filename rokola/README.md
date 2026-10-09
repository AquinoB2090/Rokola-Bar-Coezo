# Rokola

Rokola para bar construida con Next.js. Incluye una vista pública para pedir canciones, el reproductor de sala y el panel privado.

## Desarrollo local

Requiere Node.js 20 o superior.

1. Copia `.env.example` a `.env.local`.
2. Define `ADMIN_PASSWORD` y `AUTH_SECRET` (usa una cadena aleatoria larga para este último).
3. Define `NEXT_PUBLIC_YOUTUBE_API_KEY` para buscar por nombre. La clave se usa desde el navegador y debe restringirse a tus dominios web en Google Cloud. Sin ella se pueden añadir videos pegando enlaces de YouTube.
4. Ejecuta `npm install` y `npm run dev`.
5. Abre `http://localhost:3000`, administra en `/admin` y reproduce en `/player`.

En desarrollo local, sin Redis, la cola se comparte en memoria entre rutas y se vacía al reiniciar el servidor. En Vercel Redis es obligatorio porque sus funciones no comparten memoria; configura `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`, además de las variables de entorno descritas en `.env.example`.

## Despliegue

Conecta este directorio como proyecto Next.js en Vercel, configura las variables de entorno y conecta una base Upstash Redis. El QR del reproductor apunta al dominio público de producción `https://rokola-bar-coezo.vercel.app/`. GitHub/Vercel, las credenciales de Upstash y la clave de Google deben configurarse en las cuentas correspondientes; no se incluyen secretos en el repositorio.

### Publicación en Vercel (paso 10)

1. Sube el repositorio a GitHub. En Vercel importa el repositorio y establece `rokola` como **Root Directory**.
2. En Storage conecta una instancia Upstash Redis. Asegúrate de que queden disponibles `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`.
3. En Settings → Environment Variables define `ADMIN_PASSWORD`, `AUTH_SECRET`, `MAX_PER_CLIENT` y `NEXT_PUBLIC_YOUTUBE_API_KEY`.
4. Despliega. El QR apunta al dominio público configurado para Rokola.
5. Recorre el flujo completo en el sitio publicado. Se requieren las cuentas de GitHub/Vercel, las credenciales de Google y la base Upstash del propietario; no se puede completar ese aprovisionamiento desde el repositorio local.

### Activar búsqueda por nombre

La búsqueda por canción o artista usa YouTube Data API v3 directamente desde el navegador. En Google Cloud habilita esa API y configura la clave con **Application restrictions → Websites**. Permite `http://localhost:3000/*` para desarrollo y `https://rokola-bar-coezo.vercel.app/*` para producción. En **API restrictions**, limita la clave a **YouTube Data API v3**. Luego copia `.env.example` como `.env.local`, pega la clave en `NEXT_PUBLIC_YOUTUBE_API_KEY` y reinicia `npm run dev`. En Vercel agrega la misma variable y vuelve a desplegar. Esta clave será visible para los visitantes, por eso debe tener ambas restricciones. Sin clave, todavía se pueden buscar videos pegando enlaces de YouTube.
