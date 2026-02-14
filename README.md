# MedAI — AI Voice Triage Assistant

Real-time voice triage system for hospital emergency rooms. Patients speak or type their symptoms, an AI (Llama 3 via Groq) classifies severity as **CRITICAL**, **URGENT**, or **ROUTINE**, and a comforting voice instruction is generated via ElevenLabs. Downloadable PDF triage tickets are available on demand.

**Zero data is persisted.** Every piece of patient data exists only within a single request/response lifecycle.

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Groq API Key](https://console.groq.com) (free tier available)
- [ElevenLabs API Key](https://elevenlabs.io) + a Voice ID

---

## Setup

```bash
cp .env.example .env
# Edit .env — add your GROQ_API_KEY, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID
```

---

## Run

```bash
docker compose up --build
```

---

## Endpoints

| Service   | URL                                    |
|-----------|----------------------------------------|
| Frontend  | http://localhost:3000                   |
| Triage    | `POST http://localhost:3001/api/triage` |
| Audio     | `POST http://localhost:3001/api/audio`  |
| Ticket    | `POST http://localhost:3001/api/ticket` |

> **Note:** `NEXT_PUBLIC_BACKEND_URL` is consumed by the user's browser, so it must be `http://localhost:3001`, not an internal Docker hostname.
