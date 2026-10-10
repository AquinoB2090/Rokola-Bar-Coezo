"use client";
import { useCallback, useEffect, useState } from "react";
type Song = { id?: string; videoId: string; title: string; channel: string; thumbnail: string; requestedBy?: string };
type YouTubeSearchItem = {
  id: { videoId: string };
  snippet: { title: string; channelTitle: string; thumbnails: { medium?: { url: string } } };
};

function isYouTubeLink(value: string) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "youtu.be" || host.endsWith(".youtu.be") || host === "youtube.com" || host.endsWith(".youtube.com");
  } catch {
    return false;
  }
}

function decodeYouTubeText(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
export default function Home() {
  const [state, setState] = useState<{ current: Song | null; queue: Song[] }>({ current: null, queue: [] });
  const [query, setQuery] = useState(""); const [results, setResults] = useState<Song[]>([]);
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    const response = await fetch("/api/queue", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) { setMessage(data.error ?? "No se pudo cargar la cola"); return; }
    setState(data);
  }, []);
  useEffect(() => {
    if (!localStorage.getItem("rokola-client")) localStorage.setItem("rokola-client", crypto.randomUUID());
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const timer = setInterval(refresh, 4000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [refresh]);
  async function search(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      let songs: Song[];
      if (isYouTubeLink(query.trim())) {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        songs = data;
      } else {
        const key = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
        if (!key) throw new Error("Falta NEXT_PUBLIC_YOUTUBE_API_KEY. Configúrala para habilitar búsquedas por nombre.");
        const url = new URL("https://www.googleapis.com/youtube/v3/search");
        url.search = new URLSearchParams({
          part: "snippet", type: "video", videoEmbeddable: "true", safeSearch: "moderate",
          maxResults: "8", q: query.trim(), regionCode: "GT", relevanceLanguage: "es", key,
        }).toString();
        const response = await fetch(url);
        const data = await response.json();
        if (!response.ok) {
          const reason = data.error?.errors?.[0]?.reason;
          if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") throw new Error("Se agotó la cuota de búsqueda de YouTube.");
          if (reason === "forbidden" || reason === "ipRefererBlocked") throw new Error("Google bloqueó la clave. En Google Cloud configura Application restrictions como Websites y permite el dominio de esta app.");
          if (reason === "accessNotConfigured") throw new Error("Activa YouTube Data API v3 en el proyecto de Google Cloud de esta clave.");
          throw new Error("YouTube rechazó la clave. Revisa sus restricciones de sitio web y que tenga habilitada YouTube Data API v3.");
        }
        songs = (data.items ?? []).map((item: YouTubeSearchItem) => ({
          videoId: item.id.videoId,
          title: decodeYouTubeText(item.snippet.title),
          channel: decodeYouTubeText(item.snippet.channelTitle),
          thumbnail: item.snippet.thumbnails.medium?.url ?? `https://i.ytimg.com/vi/${item.id.videoId}/hqdefault.jpg`,
        }));
      }
      setResults(songs);
      if (!songs.length) setMessage("No encontramos resultados");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo buscar en YouTube");
    } finally {
      setBusy(false);
    }
  }
  async function add(song: Song) { setMessage(""); const r = await fetch("/api/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...song, clientId: localStorage.getItem("rokola-client") }) }); const data = await r.json(); setMessage(r.ok ? "Agregada a la cola" : data.error); if (r.ok) { setResults((items) => items.filter((item) => item.videoId !== song.videoId)); await refresh(); } }
  const queued = new Set([state.current?.videoId, ...state.queue.map((s) => s.videoId)]);
  return <main className="customer-page"><header className="brand"><span className="brand-icon">♫</span><div><p className="eyebrow">LA MÚSICA LA ELIGES TÚ</p><h1>Rokola</h1></div></header>
    <section className="now-card"><p className="eyebrow">AHORA SUENA</p><strong>{state.current?.title ?? "Aún no hay canciones"}</strong><span>{state.current?.channel ?? "Sé quien inaugure la pista"} · {state.queue.length} en espera</span></section>
    <section className="panel"><h2>Busca tu canción</h2>
    <form className="search-form" onSubmit={search}><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Busca canción, artista o pega un enlace" required/><button disabled={busy}>{busy ? "Buscando…" : "Buscar"}</button></form>{message && <p className="notice" role="status">{message}</p>}
    <div className="results">{results.map((song) => <article className="song-row" key={song.videoId}><img src={song.thumbnail} alt=""/><div className="song-info"><strong>{song.title}</strong><span>{song.channel}</span></div><button className="add-button" disabled={queued.has(song.videoId)} onClick={() => add(song)}>{queued.has(song.videoId) ? "En cola" : "＋"}</button></article>)}</div></section>
    <section className="panel queue-panel"><div className="section-heading"><h2>Próximas canciones</h2><span className="count-pill">{state.queue.length}</span></div>{state.queue.length ? state.queue.map((song, i) => <div className="queue-row" key={song.id}><span className="queue-number">{i + 1}</span><div className="song-info"><strong>{song.title}</strong><span>{song.requestedBy || "Pedido anónimo"}</span></div></div>) : <p className="muted">La pista está esperando la primera canción.</p>}</section><footer>Hecho para cantar en compañía</footer></main>;
}



