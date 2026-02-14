const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001'

export async function submitTriage(payload) {
    const res = await fetch(`${BASE}/api/triage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
}

export async function downloadTicket(payload) {
    const res = await fetch(`${BASE}/api/ticket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error('Ticket generation failed')
    return res.blob()
}

/**
 * Send recorded audio to backend for ElevenLabs Speech-to-Text transcription.
 * @param {Blob} audioBlob - Audio blob from MediaRecorder
 * @param {string} [lang='en'] - Language hint
 * @returns {Promise<string>} Transcribed text
 */
export async function transcribeAudio(audioBlob, lang = 'en') {
    const form = new FormData()
    form.append('file', audioBlob, 'recording.webm')
    form.append('language', lang)
    const res = await fetch(`${BASE}/api/transcribe`, {
        method: 'POST',
        body: form,
    })
    if (!res.ok) {
        const msg = await res.text()
        throw new Error(`Transcription failed: ${msg}`)
    }
    const data = await res.json()
    return data.text || ''
}
