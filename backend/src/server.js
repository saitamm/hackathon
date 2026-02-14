import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import triageRoutes from './routes/triage.js'
import ticketRoutes from './routes/ticket.js'
import transcribeRoutes from './routes/transcribe.js'

const server = Fastify({ logger: { level: 'warn' } })

await server.register(cors, {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
})

await server.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
})

await server.register(triageRoutes)
await server.register(ticketRoutes)
await server.register(transcribeRoutes)

server.setErrorHandler((error, req, reply) => {
    server.log.error({ err: error.message })
    reply.status(error.statusCode ?? 500).send({ error: error.message })
})

await server.listen({
    port: parseInt(process.env.PORT ?? '3001'),
    host: '0.0.0.0',
})
