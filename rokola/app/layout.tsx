import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Rokola · pide tu canción", description: "Elige la música que suena en el bar." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="es"><body>{children}</body></html>; }
