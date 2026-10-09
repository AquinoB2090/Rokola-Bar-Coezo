"use client";
import { useCallback, useEffect, useState } from "react";
type Song = { id?: string; videoId: string; title: string; channel: string; thumbnail: string; requestedBy?: string };
export default function Home() {
  const [state, setState] = useState<{ current: Song | null; queue: Song[] }>({ current: null, queue: [] });
  const [query, setQuery] = useState(""); const [results, setResults] = useState<Song[]>([]);
  const [name, setName] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => { if (document.visibilityState !== "visible") return; const r = await fetch("/api/queue", { cache: "no-store" }); if (r.ok) setState(await r.json()); }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const savedName = localStorage.getItem("rokola-name"); if (savedName) queueMicrotask(() => setName(savedName)); if (!localStorage.getItem("rokola-client")) localStorage.setItem("rokola-client", crypto.randomUUID()); void refresh(); const timer = setInterval(refresh, 4000); document.addEventListener("visibilitychange", refresh); return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); }; }, [refresh]);
  async function search(event: React.FormEvent) { event.preventDefault(); setBusy(true); setMessage(""); try { const r = await fetch(`/api/search?q=${encodeURIComponent(query)}`); const data = await r.json(); if (!r.ok) throw new Error(data.error); setResults(data); if (!data.length) setMessage("No encontramos resultados"); } catch (e) { setMessage(e instanceof Error ? e.message : "No se pudo buscar"); } finally { setBusy(false); } }
  async function add(song: Song) { setMessage(""); const r = await fetch("/api/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...song, requestedBy: name, clientId: localStorage.getItem("rokola-client") }) }); const data = await r.json(); setMessage(r.ok ? "Agregada a la cola" : data.error); if (r.ok) { setResults((items) => items.filter((item) => item.videoId !== song.videoId)); await refresh(); } }
  const queued = new Set([state.current?.videoId, ...state.queue.map((s) => s.videoId)]);
  return <main className="customer-page"><header className="brand"><span className="brand-icon">♫</span><div><p className="eyebrow">LA MÚSICA LA ELIGES TÚ</p><h1>Rokola</h1></div></header>
    <section className="now-card"><p className="eyebrow">AHORA SUENA</p><strong>{state.current?.title ?? "Aún no hay canciones"}</strong><span>{state.current?.channel ?? "Sé quien inaugure la pista"} · {state.queue.length} en espera</span></section>
    <section className="panel"><h2>Pide tu canción</h2><label className="field-label" htmlFor="requester">¿Quién la pide? <span>opcional</span></label><input id="requester" value={name} maxLength={30} placeholder="Tu nombre" onChange={(e) => { setName(e.target.value); localStorage.setItem("rokola-name", e.target.value); }} />
    <form className="search-form" onSubmit={search}><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Canción o enlace de YouTube" required/><button disabled={busy}>{busy ? "Buscando…" : "Buscar"}</button></form>{message && <p className="notice" role="status">{message}</p>}
    <div className="results">{results.map((song) => <article className="song-row" key={song.videoId}><img src={song.thumbnail} alt=""/><div className="song-info"><strong>{song.title}</strong><span>{song.channel}</span></div><button className="add-button" disabled={queued.has(song.videoId)} onClick={() => add(song)}>{queued.has(song.videoId) ? "En cola" : "＋"}</button></article>)}</div></section>
    <section className="panel queue-panel"><div className="section-heading"><h2>Próximas canciones</h2><span className="count-pill">{state.queue.length}</span></div>{state.queue.length ? state.queue.map((song, i) => <div className="queue-row" key={song.id}><span className="queue-number">{i + 1}</span><div className="song-info"><strong>{song.title}</strong><span>{song.requestedBy || "Pedido anónimo"}</span></div></div>) : <p className="muted">La pista está esperando la primera canción.</p>}</section><footer>Hecho para cantar en compañía</footer></main>;
}


