import { NextResponse } from "next/server";
import { lookupVideo } from "@/lib/youtube";
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams.get("q") ?? "";
    return NextResponse.json(await lookupVideo(q), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo buscar" }, { status: 400 });
  }
}
