import { transcribeAudio } from '../services/elevenlabs.js'

export default async function transcribeRoutes(fastify) {
    fastify.post('/api/transcribe', async (req, reply) => {
        console.log('[transcribe] Received voice transcription request')

        const file = await req.file()
        if (!file) {
            console.log('[transcribe] No audio file in request')
            return reply.status(400).send({ error: 'No audio file provided' })
        }

        const chunks = []
        for await (const chunk of file.file) {
            chunks.push(chunk)
        }
        const audioBuffer = Buffer.concat(chunks)

        if (audioBuffer.length === 0) {
            console.log('[transcribe] Audio file is empty')
            return reply.status(400).send({ error: 'Empty audio file' })
        }

        const lang = file.fields?.language?.value || 'en'
        console.log(`[transcribe] Audio received: ${(audioBuffer.length / 1024).toFixed(1)} KB, lang=${lang}`)

        const text = await transcribeAudio(audioBuffer, lang)

        console.log(`[transcribe] Transcription result: "${text}"`)
        return reply.send({ text })
    })
}
