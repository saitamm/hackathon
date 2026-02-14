import './globals.css'

export const metadata = {
    title: 'MedAI Triage System',
    description: 'AI-powered emergency room triage assistant',
}

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    )
}
