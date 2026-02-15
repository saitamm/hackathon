'use client'

import { useState } from 'react'
import { downloadTicket } from '../lib/api'

export default function TicketButton({ ticketPayload, disabled }) {
    const [isGenerating, setIsGenerating] = useState(false)

    async function handleClick() {
        setIsGenerating(true)
        try {
            const blob = await downloadTicket(ticketPayload)
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'triage-ticket.pdf'
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
        } catch (err) {
            console.error('Ticket generation failed:', err)
        } finally {
            setIsGenerating(false)
        }
    }

    return (
        <div style={{ animation: 'fadeUp 0.5s cubic-bezier(0.22,1,0.36,1) 0.25s both' }}>
            <button
                className="btn btn-primary"
                disabled={disabled || isGenerating}
                onClick={handleClick}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.6rem',
                    padding: '0.85rem 2rem',
                    width: '100%',
                    fontSize: '0.9rem',
                    fontWeight: 500,
                }}
            >
                {isGenerating ? (
                    <>
                        <span style={{ animation: 'blink 1s infinite' }}>⏳</span>
                        GENERATING TICKET…
                    </>
                ) : (
                    <>
                        <span style={{ fontSize: '1.1rem' }}>📄</span>
                        DOWNLOAD TRIAGE TICKET
                    </>
                )}
            </button>
        </div>
    )
}
