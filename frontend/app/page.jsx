'use client'

import { useState } from 'react'
import { submitTriage } from '../lib/api'
import VoiceCapture from '../components/VoiceCapture'
import TriageResult from '../components/TriageResult'
import TicketButton from '../components/TicketButton'

function fullNameToNameSurname(fullName) {
    const parts = (fullName || '').trim().split(/\s+/).filter(Boolean)
    const name = parts[0] || ''
    const surname = parts.slice(1).join(' ') || ''
    return { name, surname }
}

export default function Home() {
    const [patientData, setPatientData] = useState({ fullName: '', age: '', sex: '' })
    const [symptoms, setSymptoms] = useState('')
    const [triageResult, setTriageResult] = useState(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState(null)
    const [formKey, setFormKey] = useState(0)

    async function handleSubmit(payloadOrEmpty) {
        const isEmergency = payloadOrEmpty?.emergency === true
        if (isEmergency) {
            const { data: emergencyData, emergencyReason } = payloadOrEmpty
            setPatientData(emergencyData)
            setSymptoms(`Emergency: ${emergencyReason}. Screening: breath ${emergencyData.breath || '—'}, chest pain ${emergencyData.pain || '—'}, neurologic ${emergencyData.neurologic || '—'}, bleeding ${emergencyData.bleeding || '—'}, seizure/LOC ${emergencyData.seizure || '—'}.`)
            setTriageResult({
                level: 'CRITICAL',
                rationale: `Immediate emergency: ${emergencyReason}. Patient requires urgent assessment.`,
                instruction: 'Stay with the patient. A nurse is being notified to bring them to a room for immediate assessment.',
            })
            return
        }
        const dataFromForm = payloadOrEmpty?.patientData ?? patientData
        const symptomsToSend = payloadOrEmpty?.symptoms ?? symptoms
        setPatientData(dataFromForm)
        setSymptoms(symptomsToSend)
        setIsLoading(true)
        setError(null)
        setTriageResult(null)
        try {
            const { name, surname } = fullNameToNameSurname(dataFromForm.fullName)
            const payload = {
                name,
                surname,
                age: parseInt(dataFromForm.age, 10),
                sex: dataFromForm.sex,
                symptoms: symptomsToSend,
            }
            const result = await submitTriage(payload)
            setTriageResult(result)
        } catch (err) {
            setError(err.message)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh' }}>

            {/* ── Header ──────────────────────────────────────── */}
            <header style={{
                textAlign: 'center',
                padding: '3.5rem 1rem 2rem',
                animation: 'fadeUp 0.8s cubic-bezier(0.22,1,0.36,1) forwards',
            }}>
                {/* Status badge */}
                <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.2)',
                    borderRadius: '100px',
                    padding: '0.3rem 0.9rem',
                    fontSize: '0.65rem',
                    fontWeight: 500,
                    color: 'var(--routine)',
                    letterSpacing: '0.08em',
                    marginBottom: '1.5rem',
                }}>
                    <span style={{
                        width: '5px',
                        height: '5px',
                        borderRadius: '50%',
                        background: 'var(--routine)',
                        boxShadow: '0 0 6px var(--routine-glow)',
                    }} />
                    SYSTEM ONLINE
                </div>

                <h1 style={{
                    fontFamily: 'var(--font-head)',
                    fontSize: 'clamp(1.5rem, 5vw, 2.4rem)',
                    fontWeight: 700,
                    color: 'var(--cyan)',
                    textShadow: '0 0 30px rgba(0,212,255,0.3), 0 0 60px rgba(0,212,255,0.1)',
                    letterSpacing: '0.06em',
                    marginBottom: '0.6rem',
                    lineHeight: 1.2,
                }}>
                    MEDAI TRIAGE
                </h1>

                <p style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.9rem',
                    color: 'var(--text-secondary)',
                    fontWeight: 300,
                    letterSpacing: '0.1em',
                }}>
                    AI-Powered Emergency Room Assistant
                </p>

                {/* Gradient line */}
                <div style={{
                    width: '80px',
                    height: '2px',
                    background: 'linear-gradient(90deg, var(--cyan), var(--purple))',
                    margin: '1.25rem auto 0',
                    borderRadius: '1px',
                    boxShadow: '0 0 12px rgba(0,212,255,0.3)',
                }} />
            </header>

            {/* ── Main ────────────────────────────────────────── */}
            <main style={{
                maxWidth: '760px',
                margin: '0 auto',
                padding: '0 1.5rem 4rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem',
                position: 'relative',
            }}>

                {/* Form wizard — always mounted when no result so step is preserved during loading */}
                {!triageResult && (
                    <>
                        <VoiceCapture
                            key={`triage-form-${formKey}`}
                            onPatientData={setPatientData}
                            onTranscript={setSymptoms}
                            onComplete={handleSubmit}
                        />
                        {/* Loading overlay — covers form so it stays mounted */}
                        {isLoading && (
                            <div className="panel" style={{
                                position: 'absolute',
                                inset: 0,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '1rem',
                                padding: '2.5rem 2rem',
                                background: 'rgba(10, 15, 28, 0.92)',
                                backdropFilter: 'blur(8px)',
                                animation: 'fadeUp 0.5s ease',
                                zIndex: 10,
                            }}>
                                <div style={{
                                    fontSize: '0.8rem',
                                    fontFamily: 'var(--font-head)',
                                    color: 'var(--cyan)',
                                    letterSpacing: '0.12em',
                                    animation: 'blink 1.2s ease infinite',
                                }}>
                                    ◉ ANALYZING PATIENT DATA…
                                </div>
                                <div style={{
                                    width: '100%',
                                    maxWidth: '320px',
                                    height: '3px',
                                    background: 'rgba(0, 212, 255, 0.06)',
                                    borderRadius: '2px',
                                    overflow: 'hidden',
                                }}>
                                    <div style={{
                                        height: '100%',
                                        background: 'linear-gradient(90deg, var(--cyan), var(--purple), var(--cyan))',
                                        backgroundSize: '200% 100%',
                                        animation: 'progress 6s ease forwards, shimmer 2s linear infinite',
                                        borderRadius: '2px',
                                        boxShadow: '0 0 10px var(--cyan-glow)',
                                    }} />
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* Error */}
                {error && (
                    <div style={{
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        background: 'rgba(239, 68, 68, 0.05)',
                        backdropFilter: 'blur(8px)',
                        borderRadius: 'var(--radius-md)',
                        padding: '1rem 1.25rem',
                        fontSize: '0.85rem',
                        color: 'var(--text)',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.6rem',
                        animation: 'fadeUp 0.4s ease',
                    }}>
                        <span style={{ color: 'var(--critical)', fontSize: '1rem', flexShrink: 0 }}>⚠</span>
                        <div>
                            <div style={{ fontWeight: 600, marginBottom: '0.25rem', color: 'var(--critical)' }}>
                                Error
                            </div>
                            {error}
                        </div>
                    </div>
                )}

                {/* Results */}
                {triageResult && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <TriageResult
                            level={triageResult.level}
                            rationale={triageResult.rationale}
                            instruction={triageResult.instruction}
                        />
                        <TicketButton
                            ticketPayload={{
                                ...fullNameToNameSurname(patientData.fullName),
                                age: parseInt(patientData.age, 10),
                                sex: patientData.sex,
                                symptoms,
                                triageLevel: triageResult.level,
                                rationale: triageResult.rationale,
                                instruction: triageResult.instruction,
                            }}
                            disabled={false}
                        />

                        {/* New Assessment button */}
                        <button
                            className="btn"
                            onClick={() => {
                                setTriageResult(null)
                                setError(null)
                                setFormKey(k => k + 1)
                            }}
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                fontSize: '0.8rem',
                                letterSpacing: '0.1em',
                            }}
                        >
                            🔄 NEW ASSESSMENT
                        </button>
                    </div>
                )}
            </main>

            {/* ── Footer ──────────────────────────────────────── */}
            <footer style={{
                textAlign: 'center',
                padding: '1.5rem',
                borderTop: '1px solid rgba(0, 212, 255, 0.06)',
            }}>
                <p style={{
                    fontSize: '0.65rem',
                    color: 'var(--muted)',
                    letterSpacing: '0.08em',
                    opacity: 0.7,
                }}>
                    AI-assisted triage does not replace physician assessment · No patient data is stored
                </p>
            </footer>
        </div>
    )
}
