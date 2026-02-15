const GROQ_API_KEY = process.env.GROQ_API_KEY

/**
 * Transcribe audio using Groq Whisper API (100% free).
 * Replaces the former ElevenLabs Scribe STT.
 * @param {Buffer} audioBuffer - Raw audio data (webm/ogg from MediaRecorder)
 * @param {string} [lang='en'] - Language code hint
 * @returns {Promise<string>} Transcribed text
 */
export async function transcribeAudio(audioBuffer, lang = 'en') {
    if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY is not set')

    const form = new FormData()
    form.append('model', 'whisper-large-v3-turbo')
    form.append('language', lang)
    form.append('response_format', 'json')
    form.append('file', new Blob([audioBuffer], { type: 'audio/webm' }), 'audio.webm')

    console.log(`[groq-stt] Sending ${(audioBuffer.length / 1024).toFixed(1)} KB to Groq Whisper (model=whisper-large-v3-turbo, lang=${lang})`)
    const startTime = Date.now()

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: form,
    })

    const elapsed = Date.now() - startTime

    if (!res.ok) {
        const body = await res.text()
        console.error(`[groq-stt] STT failed (${res.status}) after ${elapsed}ms: ${body}`)
        throw new Error(`Groq Whisper STT failed (${res.status}): ${body}`)
    }

    const data = await res.json()
    console.log(`[groq-stt] STT response in ${elapsed}ms — text: "${data.text || ''}"`)
    return data.text || ''
}
