"use client";

import { QRCodeSVG } from "qrcode.react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Song = { id: string; videoId: string; title: string; channel: string; requestedBy: string };
type Player = {
  loadVideoById: (videoId: string) => void;
  destroy: () => void;
};
type YouTubeEvent = { data: number };
type YTWindow = Window & {
  YT?: { Player: new (id: string, options: object) => Player };
  onYouTubeIframeAPIReady?: () => void;
};

export default function PlayerPage() {
  const [auth, setAuth] = useState<boolean | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [current, setCurrent] = useState<Song | null>(null);
  const [queue, setQueue] = useState<Song[]>([]);
  const [origin, setOrigin] = useState("");
  const [playbackError, setPlaybackError] = useState("");
  const player = useRef<Player | null>(null);
  const currentRef = useRef<Song | null>(null);
  const advancing = useRef(false);
  const lastLoadedVideoId = useRef<string | null>(null);

  useEffect(() => {
    requestAnimationFrame(() => setOrigin(process.env.NEXT_PUBLIC_SITE_URL || window.location.origin));
    fetch("/api/auth").then((response) => response.json()).then((data) => setAuth(data.authenticated));
  }, []);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/queue", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) { setPlaybackError(data.error ?? "No se pudo cargar la cola"); return; }
    setCurrent(data.current);
    currentRef.current = data.current;
    setQueue(data.queue);
  }, []);

  const advanceCurrent = useCallback(async () => {
    const song = currentRef.current;
    if (!song || advancing.current) return;
    advancing.current = true;
    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "advance", id: song.id }),
      });
      if (response.status === 401) setPlaybackError("La sesión expiró. Vuelve a iniciar sesión desde administración.");
      await refresh();
    } finally {
      advancing.current = false;
    }
  }, [refresh]);

  useEffect(() => {
    if (!auth) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [auth, refresh]);

  useEffect(() => {
    if (!auth) return;
    let cancelled = false;
    const win = window as YTWindow;
    const createPlayer = () => {
      if (cancelled || !win.YT || player.current || !document.getElementById("rokola-video")) return;
      player.current = new win.YT.Player("rokola-video", {
        height: "100%",
        width: "100%",
        videoId: currentRef.current?.videoId,
        playerVars: { autoplay: 0, controls: 0, disablekb: 1, modestbranding: 1, rel: 0, origin: window.location.origin },
        events: {
          onReady: () => setPlayerReady(true),
          onStateChange: (event: YouTubeEvent) => {
            if (event.data === 0) void advanceCurrent();
          },
          onError: () => {
            setPlaybackError("Este video no se puede reproducir aquí. Saltando a la siguiente canción…");
            void advanceCurrent();
          },
        },
      });
    };

    if (win.YT) createPlayer();
    else {
      const callback = win.onYouTubeIframeAPIReady;
      Object.assign(win, { onYouTubeIframeAPIReady: () => { callback?.(); createPlayer(); } });
      if (!document.getElementById("youtube-iframe-api")) {
        const script = document.createElement("script");
        script.id = "youtube-iframe-api";
        script.src = "https://www.youtube.com/iframe_api";
        script.async = true;
        script.onerror = () => setPlaybackError("No se pudo cargar el reproductor de YouTube. Revisa la conexión a internet.");
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      player.current?.destroy();
      player.current = null;
      setPlayerReady(false);
    };
  }, [auth, advanceCurrent]);

  const videoId = current?.videoId;
  useEffect(() => {
    if (!started || !videoId || videoId === lastLoadedVideoId.current || !player.current) return;
    lastLoadedVideoId.current = videoId;
    setPlaybackError("");
    player.current.loadVideoById(videoId);
  }, [started, videoId]);

  function startPlayback() {
    const song = currentRef.current;
    if (!song || !player.current || !playerReady) return;
    setPlaybackError("");
    lastLoadedVideoId.current = song.videoId;
    setStarted(true);
    // Start from the click itself so the browser allows audio playback.
    player.current.loadVideoById(song.videoId);
  }

  if (auth === null) return <main className="screen-center">Cargando rokola…</main>;
  if (!auth) return <main className="screen-center"><div className="panel"><h1>Acceso del encargado</h1><p>Inicia sesión desde administración para abrir el reproductor.</p><Link className="link-button" href="/admin">Ir al panel</Link></div></main>;

  return <main className="player-layout">
    <section className="video-area">
      <div id="rokola-video" className="video-frame" />
      {!started && <div className="start-overlay">
        <span className="big-note">♫</span>
        <h1>{current ? "La noche suena mejor contigo" : "Esperando la primera canción"}</h1>
        <p>{current ? "Pulsa para iniciar el video y el sonido" : "Escanea el código QR para pedir una canción"}</p>
        <button className="primary-button" disabled={!current || !playerReady} onClick={startPlayback}>
          {!playerReady ? "Cargando reproductor…" : current ? "Iniciar rokola" : "Esperando canción…"}
        </button>
      </div>}
      {!current && <div className="empty-overlay"><QRCodeSVG value={origin} size={176} bgColor="white" fgColor="#17241f"/><h2>¡Pide tu canción!</h2><p>Escanea y elige la próxima canción</p></div>}
      {playbackError && <p className="player-error" role="status">{playbackError}</p>}
    </section>
    <aside className="player-sidebar">
      <div className="brand"><span className="brand-icon">♫</span><h1>ROKOLA</h1></div>
      <div className="side-qr"><p className="eyebrow">ESCANEA Y PIDE TU CANCIÓN</p><QRCodeSVG value={origin} size={138} bgColor="white" fgColor="#17241f"/></div>
      <p className="eyebrow">AHORA SUENA</p><h2 className="side-title">{current?.title ?? "La pista está esperando"}</h2><span className="muted">{current?.channel ?? ""}</span>
      <hr/><p className="eyebrow">A CONTINUACIÓN</p>
      {queue.slice(0, 3).map((song, index) => <div className="side-next" key={song.id}><span>{String(index + 1).padStart(2, "0")}</span><strong>{song.title}</strong></div>)}
      <Link className="admin-link" href="/admin">Panel del encargado</Link>
    </aside>
  </main>;
}
