import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { advance, mutateQueue } from "@/lib/queue";
export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Sesión expirada" }, { status: 401 });
  try {
    const { action, id } = await request.json();
    if (action === "advance") return NextResponse.json(await advance(typeof id === "string" ? id : undefined));
    if (!["remove", "priority", "up", "down", "clear"].includes(action)) return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
    return NextResponse.json(await mutateQueue(action, id));
  } catch { return NextResponse.json({ error: "No se pudo actualizar la cola" }, { status: 400 }); }
}
