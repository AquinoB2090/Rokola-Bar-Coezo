import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { addSong, getState, QueueStorageUnavailableError } from "@/lib/queue";
import { publicSong } from "@/lib/types";
const headers = { "Cache-Control": "no-store, no-cache, must-revalidate" };
export async function GET() {
  try {
    const state = await getState();
    return NextResponse.json({ current: state.current ? publicSong(state.current) : null, queue: state.queue.map(publicSong) }, { headers });
  } catch (error) {
    const status = error instanceof QueueStorageUnavailableError ? 503 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo leer la cola" }, { status, headers });
  }
}
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const videoId = String(body.videoId ?? "");
    const clientId = String(body.clientId ?? "");
    const title = String(body.title ?? "").trim().slice(0, 150);
    const channel = String(body.channel ?? "").trim().slice(0, 100);
    const requestedBy = String(body.requestedBy ?? "").trim().slice(0, 30);
    if (!/^[\w-]{11}$/.test(videoId)) return NextResponse.json({ error: "El enlace de YouTube no es válido" }, { status: 400, headers });
    if (!/^[\w-]{16,100}$/.test(clientId)) return NextResponse.json({ error: "No se pudo identificar este dispositivo; recarga la página" }, { status: 400, headers });
    if (!title || !channel) return NextResponse.json({ error: "Faltan datos de la canción" }, { status: 400, headers });
    await addSong({ id: randomUUID(), videoId, title, channel, thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, requestedBy, clientId, addedAt: Date.now() });
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    const status = error instanceof QueueStorageUnavailableError ? 503 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo agregar" }, { status, headers });
  }
}

