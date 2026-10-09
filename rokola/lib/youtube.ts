import type { Song } from "./types";
const cache = new Map<string, { at: number; songs: Omit<Song, "id" | "requestedBy" | "clientId" | "addedAt">[] }>();
const decode = (value: string) => value.replace(/&amp;/g, "&").replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
export function extractVideoId(input: string): string | null {
  try {
    const url = new URL(input);
    let id = url.hostname.includes("youtu.be") ? url.pathname.slice(1) : url.searchParams.get("v");
    if (!id && /youtube\.com$/.test(url.hostname)) id = url.pathname.match(/\/(?:shorts|embed|live)\/([^/?]+)/)?.[1] ?? null;
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}
export async function lookupVideo(input: string) {
  const videoId = extractVideoId(input);
  if (videoId) {
    const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`, { cache: "no-store" });
    if (!response.ok) throw new Error("No se encontró un video público que permita inserción");
    const data = await response.json();
    return [{ videoId, title: decode(data.title), channel: decode(data.author_name), thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` }];
  }
  const query = input.trim().toLocaleLowerCase();
  if (query.length < 2 || query.length > 100) throw new Error("Escribe una canción o pega un enlace de YouTube");
  const hit = cache.get(query);
  if (hit && Date.now() - hit.at < 3_600_000) return hit.songs;
  if (!process.env.YOUTUBE_API_KEY) throw new Error("La búsqueda por nombre necesita YOUTUBE_API_KEY. Configúrala en .env.local; mientras tanto puedes pegar un enlace de YouTube.");
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.search = new URLSearchParams({ part: "snippet", type: "video", videoEmbeddable: "true", safeSearch: "moderate", maxResults: "8", q: input.trim(), key: process.env.YOUTUBE_API_KEY }).toString();
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) {
    const reason = data.error?.errors?.[0]?.reason;
    const apiMessage = String(data.error?.message ?? "");
    if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") throw new Error("Se agotó la cuota de búsqueda; pega el enlace de YouTube");
    if (apiMessage.includes("Android client application")) throw new Error("La clave está restringida a Android, pero Rokola busca desde el servidor. En Google Cloud cambia Application restrictions a None y limita la clave a YouTube Data API v3.");
    if (reason === "accessNotConfigured") throw new Error("Activa YouTube Data API v3 en el proyecto de Google Cloud de esta clave.");
    if (reason === "forbidden" || reason === "ipRefererBlocked") throw new Error("Google bloqueó la clave por sus restricciones. Revisa las restricciones de aplicación y permite YouTube Data API v3.");
    if (reason === "keyInvalid") throw new Error("Google no reconoce esta clave. Revisa YOUTUBE_API_KEY en .env.local.");
    throw new Error("No se pudo buscar en YouTube. Revisa la clave y la configuración de YouTube Data API v3 en Google Cloud.");
  }
  const songs = (data.items ?? []).map((item: { id: { videoId: string }; snippet: { title: string; channelTitle: string; thumbnails: { medium?: { url: string } } } }) => ({ videoId: item.id.videoId, title: decode(item.snippet.title), channel: decode(item.snippet.channelTitle), thumbnail: item.snippet.thumbnails.medium?.url ?? `https://i.ytimg.com/vi/${item.id.videoId}/hqdefault.jpg` }));
  cache.set(query, { at: Date.now(), songs });
  return songs;
}



