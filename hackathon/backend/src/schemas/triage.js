export const triageSchema = {
    body: {
        type: 'object',
        required: ['name', 'surname', 'age', 'sex', 'symptoms'],
        additionalProperties: false,
        properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            surname: { type: 'string', minLength: 1, maxLength: 100 },
            age: { type: 'integer', minimum: 0, maximum: 150 },
            sex: { type: 'string', enum: ['male', 'female', 'other'] },
            symptoms: { type: 'string', minLength: 1, maxLength: 2000 },
        },
    },
}

export const ticketSchema = {
    body: {
        type: 'object',
        required: ['name', 'surname', 'age', 'sex', 'symptoms', 'triageLevel', 'rationale', 'instruction'],
        additionalProperties: false,
        properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            surname: { type: 'string', minLength: 1, maxLength: 100 },
            age: { type: 'integer', minimum: 0, maximum: 150 },
            sex: { type: 'string', enum: ['male', 'female', 'other'] },
            symptoms: { type: 'string', minLength: 1, maxLength: 2000 },
            triageLevel: { type: 'string', enum: ['CRITICAL', 'URGENT', 'ROUTINE'] },
            rationale: { type: 'string', minLength: 1, maxLength: 2000 },
            instruction: { type: 'string', minLength: 1, maxLength: 2000 },
        },
    },
}
