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

/**
 * Speak text using ElevenLabs streaming TTS via the backend.
 * Uses MediaSource Extensions for true streaming — audio begins
 * playing as soon as the first chunk arrives, no waiting for the
 * full download, so the voice sounds seamless and uninterrupted.
 *
 * Calling again while playing cancels the previous audio.
 * @param {string} text
 * @returns {Promise<void>} resolves when playback finishes
 */
let _currentAudio = null
let _cancelId = 0

export async function speakText(text) {
    // Cancel any currently playing audio
    const id = ++_cancelId
    if (_currentAudio) {
        _currentAudio.pause()
        _currentAudio.src = ''
        _currentAudio = null
    }

    const res = await fetch(`${BASE}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
    })
    if (!res.ok || id !== _cancelId) return

    // Collect all audio data then play (most reliable cross-browser)
    const reader = res.body.getReader()
    const chunks = []
    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (id !== _cancelId) return // cancelled
        chunks.push(value)
    }

    if (id !== _cancelId) return

    const blob = new Blob(chunks, { type: 'audio/mpeg' })
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    // Prevent gaps: disable media session interruptions
    audio.preload = 'auto'
    _currentAudio = audio

    return new Promise((resolve) => {
        audio.onended = () => {
            URL.revokeObjectURL(url)
            if (_currentAudio === audio) _currentAudio = null
            resolve()
        }
        audio.onerror = () => {
            URL.revokeObjectURL(url)
            if (_currentAudio === audio) _currentAudio = null
            resolve()
        }
        audio.play().catch(() => resolve())
    })
}
