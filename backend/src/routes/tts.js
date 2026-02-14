import { streamTTS } from '../services/elevenlabs.js'

export default async function ttsRoutes(fastify) {
    fastify.post('/api/tts', async (req, reply) => {
        const { text } = req.body || {}
        if (!text || typeof text !== 'string') {
            return reply.status(400).send({ error: 'Missing "text" field' })
        }

        const upstream = await streamTTS(text)

        reply.raw.writeHead(200, {
            'Content-Type': 'audio/mpeg',
            'Transfer-Encoding': 'chunked',
            'Cache-Control': 'no-cache',
        })

        // Pipe the ElevenLabs stream directly to the HTTP response
        const reader = upstream.body.getReader()
        try {
            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                reply.raw.write(value)
            }
        } finally {
            reply.raw.end()
        }
    })
}
