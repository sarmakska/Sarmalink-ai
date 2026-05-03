import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "SarmaLink-AI — Open Source Multi-Provider AI Assistant",
  description: "An open-source AI chat assistant with automatic failover across 36 engines and 7 providers. Built by Sarma Linux.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav style={{
          position: 'fixed', top: 0, right: 0, zIndex: 100,
          padding: '10px 20px', fontSize: 12, display: 'flex', gap: 16, alignItems: 'center',
        }}>
          <a href="/docs" style={{ color: '#6b7280', textDecoration: 'none', fontFamily: 'system-ui, sans-serif' }}>
            Docs
          </a>
        </nav>
        {children}
      </body>
    </html>
  )
}
