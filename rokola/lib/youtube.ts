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
  if (!process.env.YOUTUBE_API_KEY) throw new Error("La búsqueda necesita una clave de YouTube; pega el enlace del video");
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.search = new URLSearchParams({ part: "snippet", type: "video", videoEmbeddable: "true", safeSearch: "moderate", maxResults: "8", q: input.trim(), key: process.env.YOUTUBE_API_KEY }).toString();
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.errors?.[0]?.reason === "quotaExceeded" ? "Se agotó la cuota de búsqueda; pega el enlace de YouTube" : "No se pudo buscar en YouTube");
  const songs = (data.items ?? []).map((item: { id: { videoId: string }; snippet: { title: string; channelTitle: string; thumbnails: { medium?: { url: string } } } }) => ({ videoId: item.id.videoId, title: decode(item.snippet.title), channel: decode(item.snippet.channelTitle), thumbnail: item.snippet.thumbnails.medium?.url ?? `https://i.ytimg.com/vi/${item.id.videoId}/hqdefault.jpg` }));
  cache.set(query, { at: Date.now(), songs });
  return songs;
}

