"use client";

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
  const [playbackError, setPlaybackError] = useState("");
  const player = useRef<Player | null>(null);
  const videoArea = useRef<HTMLElement | null>(null);
  const currentRef = useRef<Song | null>(null);
  const advancing = useRef(false);
  const lastLoadedVideoId = useRef<string | null>(null);

  useEffect(() => {
    fetch("/api/auth").then((response) => response.json()).then((data) => setAuth(data.authenticated));
  }, []);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/queue", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) { setPlaybackError(data.error ?? "No se pudo cargar la cola"); return; }
    setCurrent(data.current);
    currentRef.current = data.current;
  }, []);

  function enterFullscreen() {
    const area = videoArea.current;
    if (area && !document.fullscreenElement) {
      void area.requestFullscreen?.().catch(() => {});
    }
  }

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
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, modestbranding: 1, rel: 0, fs: 1, origin: window.location.origin },
        events: {
          onReady: () => setPlayerReady(true),
          onStateChange: (event: YouTubeEvent) => {
            if (event.data === 1) {
              setStarted(true);
              setPlaybackError("");
            }
            if (event.data === 0) void advanceCurrent();
          },
          onAutoplayBlocked: () => {
            setStarted(false);
            setPlaybackError("El navegador bloqueó el inicio automático con sonido. Pulsa el botón para iniciar la reproducción.");
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
    if (!playerReady || !videoId || videoId === lastLoadedVideoId.current || !player.current) return;
    lastLoadedVideoId.current = videoId;
    setPlaybackError("");
    setStarted(true);
    player.current.loadVideoById(videoId);
  }, [playerReady, videoId]);

  function startPlayback() {
    const song = currentRef.current;
    if (!song || !player.current || !playerReady) return;
    setPlaybackError("");
    enterFullscreen();
    lastLoadedVideoId.current = song.videoId;
    setStarted(true);
    // Start from the click itself so the browser allows audio playback.
    player.current.loadVideoById(song.videoId);
  }

  if (auth === null) return <main className="screen-center">Cargando rokola…</main>;
  if (!auth) return <main className="screen-center"><div className="panel"><h1>Acceso del encargado</h1><p>Inicia sesión desde administración para abrir el reproductor.</p><Link className="link-button" href="/admin">Ir al panel</Link></div></main>;

  return <main className="player-layout">
    <section className="video-area" ref={videoArea}>
      <div id="rokola-video" className="video-frame" />
      {!started && <div className="start-overlay">
        <h1>{current ? "La noche suena mejor contigo" : "Esperando la primera canción"}</h1>
        {current && <p>{playbackError || "Iniciando video y sonido…"}</p>}
        <button className="primary-button" disabled={!current || !playerReady} onClick={startPlayback}>
          {!playerReady ? "Cargando reproductor…" : current ? playbackError ? "Iniciar reproducción" : "Iniciar rokola" : "Esperando canción…"}
        </button>
      </div>}
      <button className="fullscreen-button" type="button" aria-label="Poner video en pantalla completa" onClick={enterFullscreen}>⛶</button>
      {playbackError && <p className="player-error" role="status">{playbackError}</p>}
    </section>
  </main>;
}
