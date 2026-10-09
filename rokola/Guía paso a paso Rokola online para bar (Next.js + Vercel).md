# Guía paso a paso: Rokola online para bar (Next.js + Vercel)

Oct 9, 2026 · @Brandon Aquino

## Qué vamos a construir

La rokola son tres pantallas que comparten una sola cola de canciones guardada en Redis; todo cabe en los planes gratis de Vercel, Upstash y YouTube.

- **`/` (clientes):** la abren al escanear el QR, buscan una canción o pegan un enlace de YouTube y la agregan a la cola.
- **`/player` (TV del bar):** reproduce el video de YouTube en pantalla completa, muestra el QR y las próximas canciones. Se abre una sola vez en la computadora del bar.
- **`/admin` (encargado):** ve la cola y puede eliminar, subir a prioridad, reordenar o saltar la canción actual. Pide contraseña.

Tres decisiones de diseño que conviene entender antes de escribir código:

1. **La cola vive en Redis, no en memoria.** Vercel ejecuta cada petición en una función efímera; una variable global se pierde entre peticiones. Usaremos Upstash Redis (gratis) y, en tu computadora, un respaldo en memoria para desarrollar sin configurar nada.
2. **Se sincroniza con *polling*, no con WebSockets.** Vercel no mantiene conexiones persistentes. Cada pantalla pregunta el estado cada 3 segundos, suficiente para una rokola.
3. **El video se reproduce con la YouTube IFrame API.** Es la forma permitida de incrustar YouTube y avisa cuando el video termina, para pasar a la siguiente canción.

## Requisitos previos

Necesitas cuatro cosas; las dos últimas las puedes dejar para el despliegue.

1. **Node.js 20 o superior** y un editor de código (VS Code). Comprueba con `node -v`.
2. **Una cuenta en [GitHub](https://github.com) y otra en [Vercel](https://vercel.com)** (el plan gratis alcanza). Vercel despliega directo desde un repositorio de GitHub.
3. **Una API key de YouTube Data API v3**, solo para buscar canciones por nombre:
   1. Entra a [Google Cloud Console](https://console.cloud.google.com) y crea un proyecto.
   2. En *APIs y servicios → Biblioteca*, busca **YouTube Data API v3** y actívala.
   3. En *Credenciales → Crear credenciales → Clave de API*, copia la clave y restríngela a esa API.
   4. Cada búsqueda cuesta 100 de las 10 000 unidades diarias gratis, o sea unas 100 búsquedas por día. La guía cachea cada búsqueda una hora para ahorrar cuota. Pegar un enlace de YouTube no gasta cuota.
4. **Una base Redis de Upstash.** Se crea desde Vercel (*Storage → Marketplace → Upstash Redis*) en el paso 10 y las variables de entorno se enlazan solas. En tu computadora no hace falta.

## ¿Necesito una base de datos?

Sí, pero pequeña: necesitas guardar la cola fuera de Vercel, y la opción más simple es Upstash Redis, que tiene plan gratis.

El motivo es técnico: Vercel ejecuta cada petición en una función que se apaga al terminar, así que cualquier cosa guardada en memoria desaparece entre una petición y la siguiente. Sin almacenamiento externo, la cola se vaciaría sola.

- **Qué se guarda:** un solo registro con la canción que suena y la lista de las que esperan. No hay usuarios, ni historial, ni tablas.
- **Por qué Redis y no SQL:** al ser un único registro pequeño, una base relacional como Postgres sería más trabajo sin ninguna ventaja.
- **Cuándo no haría falta:** si en vez de Vercel corres la app en una computadora del bar con un servidor Node siempre encendido, la memoria sirve, aunque la cola se pierde al reiniciar.
- **Cuidado con el consumo:** cada pantalla abierta consulta la cola cada pocos segundos y cada consulta cuenta como un comando de Redis. Revisa el límite vigente del plan gratis de Upstash y, si te quedas corto, consulta cada 5 segundos en vez de 3 o pausa la consulta de los celulares con la pantalla apagada.

## ¿Se pueden quitar los anuncios?

No hay una forma legítima de reproducir videos de YouTube sin anuncios dentro de tu propia página, y esta guía no incluye trucos para lograrlo.

Los anuncios los inserta YouTube dentro de su reproductor incrustado. Quitarlos exige bloquearlos o descargar los videos, y las condiciones de uso de YouTube lo prohíben. Tus opciones reales son estas:

1. **YouTube Premium en el navegador del reproductor.** Quien inicia sesión con una cuenta Premium normalmente no ve anuncios en videos incrustados. El problema es que Premium está pensado para uso personal y sus condiciones limitan el uso comercial, así que en un bar es una zona gris. Léelas antes de pagar.
2. **Aceptar los anuncios.** Es lo más sencillo y lo que permite la API oficial. La rokola sigue funcionando: la siguiente canción solo avanza cuando termina el video real, anuncios incluidos.
3. **Un servicio de música para negocios.** Los servicios con licencia comercial (por ejemplo Soundtrack Your Brand) no tienen anuncios, pero no reproducen videos de YouTube ni dejan que los clientes pidan cualquier canción.

Aparte de los anuncios, un bar que pone música al público suele necesitar una licencia de comunicación pública con la sociedad de derechos de autor de su país. Vale la pena preguntar.

## Paso 1: crear el proyecto

El proyecto es una app de Next.js con TypeScript y dos dependencias extra, y casi todo el trabajo está en tres pantallas y unas pocas rutas del servidor.

1. Crea la app con la herramienta oficial de Next.js (create-next-app) y elige TypeScript, App Router, carpeta de código fuente y alias de importación por defecto. No necesitas Tailwind ni ESLint.
2. Instala dos paquetes: el cliente de Upstash Redis y una librería para dibujar el código QR (qrcode.react).
3. Organiza el código en dos bloques:
   - **Lógica compartida del servidor:** un archivo para los tipos de datos, uno para guardar y modificar la cola, uno para la sesión del administrador y uno para hablar con YouTube.
   - **Páginas y rutas:** la página de clientes en la raíz, una página del reproductor, una página del administrador, y rutas del servidor para buscar canciones, leer y agregar a la cola, iniciar y cerrar sesión, y ejecutar las acciones del administrador.
4. Crea un archivo de variables de entorno local con cuatro valores: la contraseña del administrador, una cadena larga y aleatoria para firmar la sesión, la clave de YouTube (puede quedar vacía al principio) y el máximo de canciones por cliente, por ejemplo 3.

## Paso 2: la cola

La cola es el corazón de la rokola, y todo lo demás solo la muestra o la modifica.

**Qué guarda cada canción:** un id propio, el id del video de YouTube, título, canal, miniatura, el nombre de quien la pidió, un identificador anónimo de su celular y la hora en que se agregó.

**Qué guarda el estado:** la canción que suena ahora y la lista ordenada de las que esperan. Se guarda como un único registro en Redis. En tu computadora, sin Redis configurado, el mismo código usa memoria para que puedas desarrollar sin cuentas.

**Las operaciones que debe permitir:**

- Agregar una canción al final.
- Eliminar una canción de la cola.
- Dar prioridad: moverla al primer lugar de la espera.
- Subirla o bajarla un puesto.
- Avanzar a la siguiente canción.
- Vaciar la cola.

**Reglas que evitan problemas en el bar:**

1. No se acepta una canción que ya suena o ya está en la cola.
2. Cada celular puede tener como máximo 3 canciones esperando.
3. El identificador del celular nunca se envía de vuelta a los navegadores; solo lo usa el servidor para contar.
4. "Avanzar" indica qué canción cree quien lo pide que está sonando, y solo se ejecuta si coincide. Así, si el reproductor y el administrador piden la siguiente al mismo tiempo, la cola avanza una sola vez.

Una limitación que conviene conocer: leer y guardar el registro completo no es una operación atómica. Con las pocas personas de un bar basta; en el peor caso dos pedidos simultáneos hacen que una canción se pierda y el cliente la vuelve a pedir.

## Paso 3: búsqueda en YouTube

El cliente puede pedir una canción de dos maneras, y las dos pasan por el servidor para no exponer tu clave de YouTube.

- **Pegando un enlace:** el servidor reconoce los formatos habituales (youtu.be, youtube.com/watch, shorts y similares), extrae el id del video y lo valida con el servicio oEmbed de YouTube. No usa clave ni cuota, y rechaza los videos que no se pueden incrustar.
- **Escribiendo un nombre:** el servidor llama a la YouTube Data API pidiendo solo videos incrustables, con búsqueda segura moderada y unos 8 resultados. Pedir solo videos incrustables evita que alguien agregue una canción que luego no se pueda reproducir.

Tres detalles que ahorran problemas:

1. Guarda cada búsqueda en caché durante una hora; así repetir "Bohemian Rhapsody" diez veces cuesta una sola búsqueda de tu cuota diaria.
2. Decodifica los símbolos que YouTube envía codificados en los títulos (el "y" comercial o el apóstrofo salen como códigos de texto).
3. Si se agota la cuota, el mensaje al cliente debe ser claro y sugerirle pegar el enlace de la canción.

## Paso 4: la ruta pública de la cola

Una sola ruta del servidor sirve a las tres pantallas: con GET devuelve el estado y con POST agrega una canción.

**Leer la cola (GET).** Devuelve la canción que suena y la lista de espera, sin el identificador de los celulares. Debe marcarse como no cacheable; si Vercel guardara la respuesta, los clientes verían una cola vieja.

**Agregar una canción (POST).** El navegador envía el id del video, el título, el canal, su nombre opcional y su identificador. Antes de guardar, el servidor:

1. Comprueba que el id de video tenga exactamente 11 caracteres válidos.
2. Exige un identificador de cliente razonable y recorta los textos a una longitud máxima (150 para el título, 30 para el nombre).
3. Construye la miniatura a partir del id del video, en vez de confiar en una dirección enviada por el cliente.
4. Aplica las reglas del paso 2 y, si alguna falla, responde con un mensaje claro en español que el cliente muestra tal cual (por ejemplo "Esa canción ya está en la cola").

El identificador del celular lo genera el navegador la primera vez que entra y lo guarda en su almacenamiento local. No es seguridad: alguien puede borrarlo y obtener otro cupo. Es solo un freno contra el abuso accidental, y para un bar suele bastar.

Un riesgo conocido: el título que manda el cliente podría falsearse. Si te importa, haz que el servidor consulte el título real con oEmbed antes de guardar.

## Paso 5: acceso del administrador

Una sola contraseña, guardada como variable de entorno, protege el panel, el reproductor y todas las acciones que cambian la cola; no necesitas cuentas de usuario.

El flujo, en cuatro piezas:

1. **Iniciar sesión:** una ruta recibe la contraseña y la compara con la variable de entorno usando una comparación de tiempo constante. Si coincide, responde con una cookie.
2. **La cookie:** guarda un valor derivado de la contraseña y de la cadena secreta (un hash), no la contraseña. Debe ser httpOnly, para que el JavaScript de la página no pueda leerla, y marcada como segura en producción. Una duración de 30 días evita volver a escribirla cada noche.
3. **Comprobar sesión:** una ruta responde si la cookie actual es válida. Las páginas de administrador y reproductor la usan para mostrar el formulario de acceso o el contenido.
4. **Acciones protegidas:** una única ruta ejecuta eliminar, dar prioridad, subir, bajar, avanzar y vaciar. Lo primero que hace es verificar la cookie y, si falta, responde 401. Valida además que la acción sea una de la lista y que traiga los datos que necesita.

El reproductor también exige sesión porque es quien avisa "ya terminó, siguiente". Si no lo protegieras, cualquier cliente podría saltarse canciones.

Que sea sencillo tiene un costo: nada limita los intentos de contraseña. Usa una contraseña larga, y si lo quieres más robusto, agrega un límite de intentos por dirección IP con el mismo Redis.

## Paso 6: la pantalla de los clientes

Es la página raíz, y debe diseñarse primero para celular, porque casi todos llegarán desde el QR con una sola mano y poca paciencia.

Lo que debe tener, de arriba hacia abajo:

1. **Qué suena ahora y cuántas hay en espera**, para que el cliente sepa cuánto tardará su canción.
2. **Un campo de nombre opcional** ("¿Quién la pide?"). Se guarda en el celular para no volver a escribirlo.
3. **Un buscador** que acepte un nombre o un enlace de YouTube, con un solo botón de buscar.
4. **Los resultados**, cada uno con miniatura, título, canal y un botón grande de agregar. Si la canción ya está en la cola, el botón aparece desactivado con el texto "En la cola".
5. **La cola completa**, numerada, con el nombre de quien pidió cada canción.

Comportamiento que marca la diferencia:

- Al agregar, mostrar de inmediato "Agregada" o el mensaje de error del servidor tal cual, sin pantallas intermedias.
- Refrescar la cola cada 4 segundos, y dejar de hacerlo mientras la pestaña esté oculta, para ahorrar comandos de Redis y batería.
- Generar el identificador del celular la primera vez y guardarlo en el almacenamiento local del navegador.
- Tratar el acceso por QR como público: esta pantalla nunca muestra botones de administrador.

Para probarla, abre la dirección desde tu celular en la misma red Wi-Fi que tu computadora y comprueba tres casos: una búsqueda por nombre, un enlace pegado y el rechazo del cuarto pedido seguido.

## Paso 7: la pantalla del reproductor

Es la pieza más delicada: una página que se abre una vez en la computadora o la TV del bar, reproduce video sin parar y avisa al servidor cuando una canción termina.

Lo que debe hacer, en orden:

1. **Pedir sesión de administrador.** Si no la hay, muestra un enlace al panel para iniciar sesión.
2. **Esperar un clic en "Iniciar rokola".** Los navegadores bloquean el sonido automático hasta que la persona toca la página. Con ese primer clic, todas las canciones siguientes sí arrancan solas.
3. **Cargar la YouTube IFrame API y crear un solo reproductor.** Se crea una vez y se reutiliza; no se recrea con cada canción.
4. **Reproducir lo que diga el servidor.** Cada vez que cambia la canción actual, le ordena al reproductor cargar ese video.
5. **Avisar cuando termina.** Al recibir el evento de fin de video, pide al servidor avanzar, indicando qué canción creía que sonaba (la regla de idempotencia del paso 2).
6. **Saltar sola si el video falla.** Si YouTube devuelve error (video eliminado, bloqueado en el país o no incrustable), pide avanzar igualmente, para que la rokola nunca se quede trabada.
7. **Arrancar sola.** Si no suena nada y alguien agrega una canción a una cola vacía, el reproductor pide avanzar para iniciarla.

Lo que se ve en pantalla:

- **El video ocupa casi todo el espacio**, con los controles de YouTube ocultos para que los clientes no se distraigan.
- **Una barra lateral** con el código QR, el título de lo que suena y las próximas tres canciones.
- **Una pantalla de espera** con el QR muy grande y el texto "¡Pide tu canción!" cuando no hay nada en cola.

El QR apunta a la raíz de tu sitio. Usa una variable de entorno con la dirección pública para que el QR siempre lleve al dominio de producción, aunque abras el reproductor desde otra dirección.

Consejos de instalación en el bar: usa un navegador dedicado en pantalla completa (tecla F11), desactiva la suspensión de la pantalla del equipo y abre el reproductor desde una cuenta de navegador que no uses para otra cosa. Si decides usar YouTube Premium (ver la sección de anuncios), este es el navegador donde debe estar iniciada esa sesión.

## Paso 8: el panel de administración

Es la pantalla del encargado, pensada para usarse con el celular o una tablet detrás de la barra, y se mantiene al día sola cada 3 segundos.

Si no hay sesión, muestra solo un formulario de contraseña. Con sesión, muestra:

1. **Ahora suena:** la canción actual con un botón "Saltar".
2. **La cola en orden**, donde cada canción tiene cuatro acciones:
   - **Prioridad:** la manda al primer lugar de la espera. Es el botón más usado, así que debe ser el más visible.
   - **Subir** y **bajar** un puesto, para ajustes finos.
   - **Eliminar**, para quitar canciones inapropiadas o repetidas.
3. **Vaciar cola**, con una confirmación obligatoria, porque borra todo de golpe.
4. **Enlaces y cierre de sesión:** acceso directo a la pantalla del reproductor y botón para salir.

Detalles que evitan errores en una noche concurrida:

- Mostrar quién pidió cada canción, para identificar a quien abusa.
- Desactivar "Prioridad" y "Subir" en la primera canción de la espera y "Bajar" en la última.
- Si el servidor responde que la sesión expiró, volver al formulario sin perder la pantalla.
- Aplicar el cambio en la pantalla en cuanto el servidor responde, sin esperar al siguiente refresco.

## Paso 9: variables de entorno y prueba en local

Con solo dos variables obligatorias ya puedes probar todo en tu computadora; las demás se agregan al desplegar.

| Variable | Para qué sirve | ¿Obligatoria? |
| --- | --- | --- |
| ADMIN\_PASSWORD | Contraseña del panel y del reproductor | Sí |
| AUTH\_SECRET | Cadena larga aleatoria que firma la sesión | Sí |
| YOUTUBE\_API\_KEY | Búsqueda por nombre; sin ella solo funcionan los enlaces | No, pero recomendada |
| UPSTASH\_REDIS\_REST\_URL y UPSTASH\_REDIS\_REST\_TOKEN | Conexión a Redis; sin ellas la cola vive en memoria | Solo en producción |
| MAX\_PER\_CLIENT | Máximo de canciones en espera por celular (por defecto 3) | No |
| NEXT\_PUBLIC\_SITE\_URL | Dirección pública que lleva el QR | Recomendada en producción |

Para probar, arranca el servidor de desarrollo (npm run dev) y recorre este circuito completo:

1. Abre la página de administrador e inicia sesión.
2. Abre el reproductor en otra pestaña y pulsa "Iniciar rokola".
3. Abre la página de clientes desde tu celular, en la misma red Wi-Fi, usando la dirección IP de tu computadora.
4. Agrega una canción por enlace y otra por nombre; la primera debe empezar a sonar sola.
5. Agrega cuatro canciones seguidas desde el mismo celular; la cuarta debe rechazarse.
6. En el panel, da prioridad a una canción del final y comprueba que suena la siguiente.
7. Salta la canción actual y elimina otra desde el panel.
8. Deja que un video termine solo y confirma que pasa a la siguiente sin tocar nada.

Si los pasos 4 y 8 funcionan, lo difícil ya está resuelto.

## Paso 10: desplegar en Vercel

Vercel despliega solo cada vez que subes cambios a GitHub, así que el despliegue se reduce a conectar el repositorio, la base y las variables.

1. **Sube el proyecto a GitHub.** Verifica que el archivo de variables locales no se suba; el proyecto de Next.js ya lo excluye por defecto.
2. **Importa el repositorio en Vercel** (*Add New → Project*). Vercel detecta Next.js sin configuración adicional.
3. **Crea la base de datos** desde la pestaña *Storage* del proyecto, eligiendo *Upstash Redis* en el Marketplace, y conéctala al proyecto. Vercel crea las variables de conexión por ti.
4. **Agrega las variables restantes** en *Settings → Environment Variables*: contraseña del administrador, cadena secreta, clave de YouTube y máximo por cliente.
5. **Despliega** y abre la dirección que te da Vercel.
6. **Define la dirección pública del QR.** Copia el dominio final, guárdalo como la variable de dirección pública y vuelve a desplegar, porque esa variable se incorpora al construir la app.
7. **Repite el circuito de pruebas del paso 9** ya en producción, esta vez con datos móviles en el celular para confirmar que el QR funciona fuera de tu Wi-Fi.

Dos cosas que conviene revisar antes de abrir al público:

- **El plan de Vercel.** El plan gratuito (Hobby) está pensado para proyectos personales y no comerciales. Un bar es un negocio, así que lee las condiciones vigentes; puede corresponderte un plan de pago.
- **Un dominio propio** (opcional) hace que el QR sea más corto y confiable, y no cambia si recreas el proyecto.

Para los clientes, imprime el QR en tarjetas o calcomanías en las mesas apuntando al mismo dominio. El QR de la pantalla del reproductor sirve de respaldo.

## Problemas comunes y mejoras

La mayoría de los fallos reales tienen causas conocidas, y esta tabla cubre las más probables.

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| La cola se vacía sola en producción | Falta la conexión a Redis y se usa memoria | Revisa que las variables de Upstash estén en el proyecto y vuelve a desplegar |
| El video no arranca al abrir el reproductor | El navegador bloquea el sonido automático | Pulsa "Iniciar rokola" una vez en esa pestaña |
| La rokola se queda detenida en un video | El video no se puede incrustar o fue eliminado | Debe saltarse solo al recibir el error; si no, revisa ese manejo en el reproductor |
| La búsqueda por nombre falla | Clave ausente o cuota diaria agotada | Revisa la clave en Google Cloud; mientras tanto se pueden pegar enlaces |
| El QR lleva a una dirección equivocada | No se definió la dirección pública | Define la variable y vuelve a desplegar |
| Dos canciones avanzan de golpe | Dos pantallas pidieron "siguiente" a la vez | Revisa que "avanzar" envíe la canción esperada |
| Redis se acaba antes de fin de mes | Demasiadas consultas por pantalla abierta | Sube el intervalo de consulta y pausa las pestañas ocultas |

Mejoras para después, de mayor a menor valor para un bar:

1. **Límite de intentos de contraseña** con Redis, para el panel de administrador.
2. **Fichas o turnos:** que cada celular pueda pedir una canción cada cierto tiempo, en lugar de un tope fijo.
3. **Lista de palabras prohibidas** para ocultar canciones inapropiadas en los resultados.
4. **Historial** de lo más pedido de la noche, guardado en Redis.
5. **Eventos en tiempo real** con un servicio de mensajería (Pusher, Ably) si el refresco cada 3 segundos no te alcanza.
