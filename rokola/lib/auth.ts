import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
const COOKIE = "rokola_admin";
const token = () => createHmac("sha256", process.env.AUTH_SECRET ?? "").update(`admin:${process.env.ADMIN_PASSWORD ?? ""}`).digest("hex");
export async function isAdmin() {
  const jar = await cookies();
  const supplied = jar.get(COOKIE)?.value ?? "";
  const expected = token();
  return supplied.length === expected.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}
export async function setAdminCookie() {
  (await cookies()).set(COOKIE, token(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 60 * 60 * 24 * 30 });
}
export async function clearAdminCookie() { (await cookies()).delete(COOKIE); }
export async function verifyPassword(candidate: string) {
  const expected = process.env.ADMIN_PASSWORD ?? "";
  const digest = (value: string) => createHmac("sha256", process.env.AUTH_SECRET ?? "").update(value).digest();
  return Boolean(expected) && timingSafeEqual(digest(candidate), digest(expected));
}
