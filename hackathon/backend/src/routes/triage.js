import { triageSchema } from '../schemas/triage.js'
import { runTriage } from '../services/groq.js'

export default async function triageRoutes(fastify) {
    fastify.post('/api/triage', { schema: triageSchema }, async (req, reply) => {
        console.log('Received triage request:', req.body)
        const result = await runTriage(req.body);
        
        console.log(result);
        return reply.send(result)
    })
}
