import { generateTTS } from '../services/tts.js'

export default async function ttsRoutes(fastify) {
    fastify.post('/api/tts', async (req, reply) => {
        const { text } = req.body || {}
        if (!text || typeof text !== 'string') {
            return reply.status(400).send({ error: 'Missing "text" field' })
        }

        try {
            const audioBuffer = await generateTTS(text)

            return reply
                .header('Content-Type', 'audio/mpeg')
                .header('Content-Length', audioBuffer.length)
                .header('Cache-Control', 'no-cache')
                .send(audioBuffer)
        } catch (err) {
            console.error('[tts-route] TTS generation failed:', err.message)
            return reply.status(500).send({ error: 'TTS generation failed' })
        }
    })
}
