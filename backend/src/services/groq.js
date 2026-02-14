import Groq from 'groq-sdk'

let client = null
function getClient() {
  if (!client) {
    const apiKey = process.env.GROQ_API_KEY?.trim()
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is not set. Add it to your .env file.')
    }
    client = new Groq({ apiKey })
  }
  return client
}

const SYSTEM_PROMPT = `You are an emergency department triage nurse. The patient is
already in the ER. Your job is to classify severity and give a short,
calm instruction as a nurse would at the triage desk — e.g. where to wait,
that a nurse will call them, or that they will be taken to a room. Do NOT
suggest calling 911, ambulance, or emergency services; they are already in
the hospital.

Respond ONLY with a valid JSON object in this exact format:
{
  "level": "CRITICAL" | "URGENT" | "ROUTINE",
  "rationale": "One sentence clinical rationale for the triage level.",
  "instruction": "One to two sentence calm, in-facility instruction as a nurse
    would say: e.g. 'Please have a seat in the waiting area, we will call you
    shortly' or 'Stay here with us, we are taking you to a room now.' Address
    the patient by first name. Never mention 911 or calling for help — they
    are already in the emergency department."
}

Rules:
- The patient report includes: breathing difficulty, chest pain, neurological
  signs, bleeding/trauma, seizure/loss of consciousness, pain severity (0-10),
  and main complaint. Higher pain score (7-10) suggests more urgency.
- CRITICAL: Life-threatening (chest pain, stroke signs, severe breathing
  difficulty, loss of consciousness, major trauma). Instruction: e.g. stay
  here, we are bringing you to a room now / a nurse is coming.
- URGENT: Serious but not immediately life-threatening. Instruction: e.g.
  please wait in the priority area, a nurse will call you soon.
- ROUTINE: Non-urgent. Instruction: e.g. please take a seat in the waiting
  area, we will call your name when it is your turn.
- Never output any text outside the JSON object.
- Never ask for more information.`

export async function runTriage({ name, surname, age, sex, symptoms }) {
  const completion = await getClient().chat.completions.create({
    model: 'openai/gpt-oss-120b',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'user', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Patient: ${age}-year-old ${sex} named ${name} ${surname}.
        Reported symptoms: ${symptoms}`,
      },
    ],
  })

  console.log(completion);
  const raw = completion.choices[0].message.content
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`Groq returned invalid JSON: ${raw}`)
  }
}
