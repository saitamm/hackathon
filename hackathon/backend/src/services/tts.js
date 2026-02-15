import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

let ttsInstance = null

/**
 * Get or create a reusable Edge TTS instance.
 */
async function getTTS() {
    if (!ttsInstance) {
        ttsInstance = new MsEdgeTTS()
        await ttsInstance.setMetadata('en-US-AriaNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
    }
    return ttsInstance
}

/**
 * Generate text-to-speech audio using Microsoft Edge's neural voices (100% free).
 * No API key needed — uses the same high-quality voices as Edge's Read Aloud.
 *
 * Returns a complete audio Buffer (MP3) for reliable playback.
 * @param {string} text - Text to speak
 * @returns {Promise<Buffer>} Complete MP3 audio buffer
 */
export async function generateTTS(text) {
    console.log(`[edge-tts] Generating TTS for: "${text.slice(0, 60)}…"`)
    const startTime = Date.now()

    let tts
    try {
        tts = await getTTS()
    } catch (err) {
        // Reset and retry once if the cached instance is stale
        console.warn('[edge-tts] Cached instance failed, creating new one…')
        ttsInstance = null
        tts = await getTTS()
    }

    return new Promise((resolve, reject) => {
        try {
            const { audioStream } = tts.toStream(text)
            const chunks = []

            audioStream.on('data', (chunk) => {
                chunks.push(chunk)
            })

            audioStream.on('end', () => {
                const buffer = Buffer.concat(chunks)
                const elapsed = Date.now() - startTime
                console.log(`[edge-tts] Generated ${(buffer.length / 1024).toFixed(1)} KB in ${elapsed}ms`)
                resolve(buffer)
            })

            audioStream.on('error', (err) => {
                console.error(`[edge-tts] Stream error:`, err)
                // Reset the instance so next call creates a fresh one
                ttsInstance = null
                reject(err)
            })
        } catch (err) {
            ttsInstance = null
            reject(err)
        }
    })
}
