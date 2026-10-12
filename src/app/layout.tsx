import type { ReactNode } from 'react'

export const metadata = {
  title: 'The Persona Index',
  description: 'Three daily questions. Real community results.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
