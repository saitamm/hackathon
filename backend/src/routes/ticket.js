import { ticketSchema } from '../schemas/triage.js'
import { generateTicket } from '../services/pdf.js'

export default async function ticketRoutes(fastify) {
    fastify.post('/api/ticket', { schema: ticketSchema }, async (req, reply) => {
        const { name, surname, age, sex, symptoms, triageLevel, rationale, instruction } = req.body
        const buffer = await generateTicket({ name, surname, age, sex, symptoms, triageLevel, rationale, instruction })

        reply
            .header('Content-Type', 'application/pdf')
            .header('Content-Disposition', 'attachment; filename="triage-ticket.pdf"')
            .send(buffer)
    })
}
