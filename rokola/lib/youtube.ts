function decode(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

export function extractVideoId(input: string): string | null {
  try {
    const url = new URL(input);
    let id = url.hostname.includes("youtu.be") ? url.pathname.slice(1) : url.searchParams.get("v");
    if (!id && /youtube\.com$/.test(url.hostname)) id = url.pathname.match(/\/(?:shorts|embed|live)\/([^/?]+)/)?.[1] ?? null;
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export async function lookupVideo(input: string) {
  const videoId = extractVideoId(input);
  if (!videoId) throw new Error("Pega un enlace válido de YouTube");
  const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`, { cache: "no-store" });
  if (!response.ok) throw new Error("No se encontró un video público que permita inserción");
  const data = await response.json();
  return [{ videoId, title: decode(data.title), channel: decode(data.author_name), thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` }];
}
