import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'NewsPrism - Global News Observatory',
  description: 'See the world through a prism, not a lens. Global news with bias transparency.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🔮</text></svg>" />
      </head>
      <body style={{ margin: 0, padding: 0, fontFamily: 'system-ui, sans-serif', background: '#f8f9fa' }}>
        {children}
      </body>
    </html>
  )
}
