# MedAI — AI Voice Triage Assistant

Real-time voice triage system for hospital emergency rooms. Patients speak or type their symptoms, an AI (Llama 3 via Groq) classifies severity as **CRITICAL**, **URGENT**, or **ROUTINE**, and a comforting voice instruction is spoken via the browser's built-in SpeechSynthesis API. Speech-to-text transcription is powered by Groq Whisper (free). Downloadable PDF triage tickets are available on demand.

**Zero data is persisted.** Every piece of patient data exists only within a single request/response lifecycle.

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Groq API Key](https://console.groq.com) (free tier — used for both AI triage and Whisper speech-to-text)

---

## Setup

```bash
cp .env.example .env
# Edit .env — add your GROQ_API_KEY (that's all you need!)
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
