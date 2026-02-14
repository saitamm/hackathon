const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'

/**
 * Stream text-to-speech audio from ElevenLabs.
 * Returns the raw Response object so the caller can pipe the body stream.
 * @param {string} text - Text to speak
 * @returns {Promise<Response>} Streaming response with audio/mpeg chunks
 */
export async function streamTTS(text) {
    if (!ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY is not set')

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`

    console.log(`[elevenlabs-tts] Streaming TTS for: "${text.slice(0, 60)}…"`)
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'xi-api-key': ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
            text,
            model_id: 'eleven_turbo_v2_5',
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
    })

    if (!res.ok) {
        const body = await res.text()
        console.error(`[elevenlabs-tts] TTS failed (${res.status}): ${body}`)
        throw new Error(`ElevenLabs TTS failed (${res.status}): ${body}`)
    }

    console.log('[elevenlabs-tts] Stream started')
    return res
}

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
    form.append('model_id', 'scribe_v2')
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
