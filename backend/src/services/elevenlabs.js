const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY

/**
 * Transcribe audio using ElevenLabs Scribe STT API.
 * @param {Buffer} audioBuffer - Raw audio data (webm/ogg from MediaRecorder)
 * @param {string} [lang='en'] - Language code hint
 * @returns {Promise<string>} Transcribed text
 */
export async function transcribeAudio(audioBuffer, lang = 'en') {
    if (!ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY is not set')

    // Build multipart form data manually using native fetch + FormData
    const { FormData, Blob } = await import('node:buffer')
        .then(() => globalThis)
        .catch(() => globalThis)

    const form = new FormData()
    form.append('model_id', 'scribe_v1')
    form.append('language_code', lang)
    form.append('file', new Blob([audioBuffer], { type: 'audio/webm' }), 'audio.webm')

    console.log(`[elevenlabs] Sending ${(audioBuffer.length / 1024).toFixed(1)} KB to ElevenLabs STT (model=scribe_v1, lang=${lang})`)
    const startTime = Date.now()

    const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: {
            'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: form,
    })

    const elapsed = Date.now() - startTime

    if (!res.ok) {
        const body = await res.text()
        console.error(`[elevenlabs] STT failed (${res.status}) after ${elapsed}ms: ${body}`)
        throw new Error(`ElevenLabs STT failed (${res.status}): ${body}`)
    }

    const data = await res.json()
    console.log(`[elevenlabs] STT response in ${elapsed}ms — text: "${data.text || ''}" (lang: ${data.language_code || '?'}, confidence: ${data.language_probability ?? '?'})`)
    return data.text || ''
}
