import { NextResponse } from "next/server";
import { clearAdminCookie, isAdmin, setAdminCookie, verifyPassword } from "@/lib/auth";
export async function GET() { return NextResponse.json({ authenticated: await isAdmin() }, { headers: { "Cache-Control": "no-store" } }); }
export async function POST(request: Request) {
  const { password } = await request.json();
  if (typeof password !== "string" || !(await verifyPassword(password))) return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
  await setAdminCookie();
  return NextResponse.json({ authenticated: true });
}
export async function DELETE() { await clearAdminCookie(); return NextResponse.json({ authenticated: false }); }
