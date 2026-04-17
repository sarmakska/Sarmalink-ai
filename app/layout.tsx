import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Cascade AI — Open Source Multi-Provider AI Assistant",
  description: "An open-source AI chat assistant with automatic failover across 36 engines and 7 providers. Built by Sarma Linux.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
