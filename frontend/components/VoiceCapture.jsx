'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { transcribeAudio } from '../lib/api'

const STEPS = [
    { key: 'fullName', label: 'Full Name', prompt: 'What is the patient\'s full name?', type: 'text', placeholder: 'e.g. Sarah Chen' },
    { key: 'age', label: 'Age', prompt: 'How old is the patient?', type: 'number', placeholder: '0 — 150', min: 0, max: 150 },
    { key: 'sex', label: 'Sex', prompt: 'What is the patient\'s sex?', type: 'select', options: ['male', 'female', 'other'] },
    { key: 'breath', label: '🔴 1️⃣ Breathing', prompt: 'Are you having difficulty breathing right now?', type: 'yesno', yesIsEmergency: true, emergencyReason: 'Difficulty breathing' },
    { key: 'pain', label: '🔴 2️⃣ Chest Pain', prompt: 'Do you have chest pain or pressure?', type: 'yesno', yesIsEmergency: true, emergencyReason: 'Chest pain or pressure' },
    { key: 'neurologic', label: '🔴 3️⃣ Neurological', prompt: 'Do you have sudden weakness, trouble speaking, or facial drooping?', type: 'yesno', yesIsEmergency: true, emergencyReason: 'Possible stroke or neurological signs' },
    { key: 'bleeding', label: '🔴 4️⃣ Bleeding / Trauma', prompt: 'Are you bleeding heavily or had a serious accident?', type: 'yesno', yesIsEmergency: true, emergencyReason: 'Heavy bleeding or major trauma' },
    { key: 'seizure', label: '🔴 5️⃣ Consciousness / Seizure', prompt: 'Have you fainted, lost consciousness, or had seizures?', type: 'yesno', yesIsEmergency: true, emergencyReason: 'Loss of consciousness or seizure' },
    { key: 'painScale', label: '6️⃣ Pain Severity', prompt: 'On a scale from 0 to 10, how severe is your pain?', type: 'number', placeholder: '0 — 10', min: 0, max: 10 },
    { key: 'mainProblem', label: '7️⃣ Main Complaint', prompt: 'Briefly, what is the main problem that brought you here?', type: 'text', placeholder: 'One short sentence' },
]

const WELCOME_MESSAGE = 'Hello, welcome! Can you fill the requirements so we know how we can help you?'

export default function VoiceCapture({ onPatientData, onTranscript, onComplete }) {
    const [showWelcome, setShowWelcome] = useState(true)
    const [step, setStep] = useState(0)
    const [data, setData] = useState({
        fullName: '', age: '', sex: '',
        breath: '', pain: '', neurologic: '', bleeding: '', seizure: '',
        painScale: '', mainProblem: '',
    })
    const [symptoms, setSymptoms] = useState('')
    const [animDir, setAnimDir] = useState('forward')
    const [voiceSupported, setVoiceSupported] = useState(false)
    const [isListening, setIsListening] = useState(false)
    const [isTranscribing, setIsTranscribing] = useState(false)
    const inputRef = useRef(null)
    const mediaRecorderRef = useRef(null)
    const audioChunksRef = useRef([])
    const stepRef = useRef(0)
    const applyVoiceResultRef = useRef(() => {})
    const advanceStepRef = useRef(() => {})
    const welcomeSpokenRef = useRef(false)

    stepRef.current = step

    // Speak welcome message once when welcome screen is shown (browser only)
    useEffect(() => {
        if (!showWelcome || typeof window === 'undefined') return
        if (welcomeSpokenRef.current) return
        welcomeSpokenRef.current = true
        const speak = () => {
            const u = new SpeechSynthesisUtterance(WELCOME_MESSAGE)
            u.rate = 0.95
            u.pitch = 1
            if (window.speechSynthesis) window.speechSynthesis.speak(u)
        }
        const t = setTimeout(speak, 600)
        return () => clearTimeout(t)
    }, [showWelcome])

    const NUMBER_WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }

    function normalizeVoiceValue(transcript, stepConfig) {
        const raw = (transcript || '').trim()
        const t = raw.toLowerCase().replace(/[.,!?]/g, '').trim()
        if (!t) return undefined
        if (stepConfig.type === 'yesno') {
            if (/\b(yes|yeah|yep|yup|y|ok|okay|sure|correct|right|true|affirmative)\b/.test(t)) return 'yes'
            if (/\b(no|nope|nah|n|nay|wrong|negative|false)\b/.test(t)) return 'no'
            return undefined
        }
        if (stepConfig.key === 'sex') {
            if (/\b(male|man|boy)\b/.test(t)) return 'male'
            if (/\b(female|woman|girl)\b/.test(t)) return 'female'
            if (/\b(other|nonbinary|non-binary)\b/.test(t)) return 'other'
            return undefined
        }
        if (stepConfig.type === 'number') {
            const digits = t.replace(/\D/g, '')
            if (digits) return digits
            const n = parseInt(t, 10)
            if (!Number.isNaN(n)) return String(n)
            for (const [word, num] of Object.entries(NUMBER_WORDS)) {
                if (t.includes(word)) return String(num)
            }
            return undefined
        }
        return raw
    }

    // SSR-safe: detect mic support in the browser
    useEffect(() => {
        if (typeof window === 'undefined') return
        setVoiceSupported(!!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia))
    }, [])

    // Start recording from the microphone
    const startListening = useCallback(async () => {
        if (isListening || isTranscribing) return
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : 'audio/webm'
            const recorder = new MediaRecorder(stream, { mimeType })
            audioChunksRef.current = []
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data)
            }
            recorder.onstop = async () => {
                // Stop all mic tracks
                stream.getTracks().forEach(t => t.stop())
                const blob = new Blob(audioChunksRef.current, { type: mimeType })
                if (blob.size < 100) return // too short, ignore

                setIsTranscribing(true)
                try {
                    const text = await transcribeAudio(blob)
                    if (text) {
                        const stepIdx = stepRef.current
                        const stepConfig = STEPS[stepIdx]
                        const normalized = normalizeVoiceValue(text, stepConfig)
                        if (normalized !== undefined) {
                            applyVoiceResultRef.current(normalized)
                            const isLast = stepIdx >= STEPS.length - 1
                            if (!isLast && (stepConfig.type === 'text' || stepConfig.type === 'number')) {
                                setTimeout(() => advanceStepRef.current(), 450)
                            }
                        }
                    }
                } catch (err) {
                    console.error('ElevenLabs STT error:', err)
                } finally {
                    setIsTranscribing(false)
                }
            }
            recorder.start()
            mediaRecorderRef.current = recorder
            setIsListening(true)
        } catch (err) {
            console.error('Mic access error:', err)
        }
    }, [isListening, isTranscribing])

    // Stop recording — triggers onstop which sends to ElevenLabs
    const stopListening = useCallback(() => {
        if (!mediaRecorderRef.current || !isListening) return
        mediaRecorderRef.current.stop()
        mediaRecorderRef.current = null
        setIsListening(false)
    }, [isListening])

    // Auto-focus input on step change (when not in voice-only mode)
    useEffect(() => {
        if (!voiceSupported) setTimeout(() => inputRef.current?.focus(), 300)
    }, [step, voiceSupported])

    const current = STEPS[step]
    const totalSteps = STEPS.length
    const isLastStep = step === totalSteps - 1

    function getCurrentValue() {
        return data[current.key]
    }

    function isCurrentValid() {
        const val = getCurrentValue()
        if (current.type === 'yesno') return val === 'yes' || val === 'no'
        if (current.type === 'number') {
            const n = parseInt(val, 10)
            const min = current.min ?? 0
            const max = current.max ?? 150
            return val !== '' && !Number.isNaN(n) && n >= min && n <= max
        }
        if (current.key === 'sex') return val !== ''
        return typeof val === 'string' && val.trim().length > 0
    }

    function handleChange(value) {
        const updated = { ...data, [current.key]: value }
        setData(updated)
        onPatientData(updated)
        if (current.type === 'yesno') {
            const triggersEmergency = (current.noIsEmergency && value === 'no') || (current.yesIsEmergency && value === 'yes')
            if (triggersEmergency) {
                onComplete?.({ emergency: true, emergencyReason: current.emergencyReason, data: updated })
                return
            }
            setAnimDir('forward')
            setStep(s => s + 1)
        }
        if (current.type === 'select') {
            setAnimDir('forward')
            setStep(s => s + 1)
        }
    }
    applyVoiceResultRef.current = handleChange
    advanceStepRef.current = () => {
        setAnimDir('forward')
        setStep(s => s + 1)
    }

    function buildSymptomsString(d) {
        const parts = [
            `Breathing difficulty: ${d.breath || '—'}. Chest pain: ${d.pain || '—'}.`,
            `Neurological (weakness/speech/face): ${d.neurologic || '—'}. Bleeding/trauma: ${d.bleeding || '—'}. Seizure/loss of consciousness: ${d.seizure || '—'}.`,
            `Pain severity (0-10): ${d.painScale !== '' && d.painScale !== undefined ? d.painScale : '—'}. Main problem: ${d.mainProblem || '—'}.`,
        ]
        return parts.join(' ')
    }

    function goNext() {
        if (!isCurrentValid()) return
        if (isLastStep) {
            const builtSymptoms = buildSymptomsString(data)
            onTranscript(builtSymptoms)
            onComplete?.({ symptoms: builtSymptoms, patientData: data })
            return
        }
        setAnimDir('forward')
        setStep(s => s + 1)
    }

    function goBack() {
        if (step === 0) return
        setAnimDir('back')
        setStep(s => s - 1)
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter' && current.type !== 'symptoms') {
            e.preventDefault()
            goNext()
        }
    }

    // ── Render yes/no step with emergency labels ──
    function renderYesNo() {
        const val = data[current.key]
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                    <button
                        className={`btn ${val === 'yes' ? 'btn-primary' : ''}`}
                        onClick={() => handleChange('yes')}
                        style={{
                            padding: '0.85rem 1.5rem',
                            fontSize: '1rem',
                            flex: '1 1 120px',
                            minWidth: '100px',
                            background: val === 'yes' ? undefined : 'rgba(16, 185, 129, 0.08)',
                            borderColor: val === 'yes' ? undefined : 'rgba(16, 185, 129, 0.3)',
                        }}
                    >
                        ✓ Yes
                    </button>
                    <button
                        className={`btn ${val === 'no' ? 'btn-critical' : ''}`}
                        onClick={() => handleChange('no')}
                        style={{
                            padding: '0.85rem 1.5rem',
                            fontSize: '1rem',
                            flex: '1 1 120px',
                            minWidth: '100px',
                            background: val === 'no' ? undefined : 'rgba(239, 68, 68, 0.06)',
                            borderColor: val === 'no' ? undefined : 'rgba(239, 68, 68, 0.25)',
                        }}
                    >
                        ✗ No
                    </button>
                </div>
                {(current.noIsEmergency || current.yesIsEmergency) && (
                    <div style={{
                        fontSize: '0.7rem',
                        color: 'var(--muted)',
                        textAlign: 'center',
                        marginTop: '0.25rem',
                    }}>
                        {current.noIsEmergency && '❌ No → EMERGENCY'}
                        {current.yesIsEmergency && '✅ Yes → EMERGENCY'}
                    </div>
                )}
            </div>
        )
    }

    // ── Voice UI: mic button + listening/transcribing state ──
    function renderVoiceControl(hint) {
        if (!voiceSupported) return null
        const busy = isListening || isTranscribing
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                <button
                    type="button"
                    onClick={isListening ? stopListening : startListening}
                    disabled={isTranscribing}
                    className={isListening ? 'btn btn-critical' : 'btn btn-primary'}
                    style={{
                        width: '72px',
                        height: '72px',
                        borderRadius: '50%',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '2rem',
                        boxShadow: isListening
                            ? '0 0 24px rgba(239,68,68,0.4)'
                            : isTranscribing
                                ? '0 0 24px rgba(168,85,247,0.4)'
                                : '0 0 24px var(--cyan-glow)',
                        animation: busy ? 'pulse 1.2s ease infinite' : undefined,
                        opacity: isTranscribing ? 0.7 : 1,
                    }}
                    aria-label={isListening ? 'Stop recording' : isTranscribing ? 'Transcribing…' : 'Start voice input'}
                >
                    {isTranscribing ? '⏳' : '🎤'}
                </button>
                <div style={{
                    fontSize: '0.75rem',
                    color: isListening ? 'var(--critical)' : isTranscribing ? 'var(--purple)' : 'var(--muted)',
                    letterSpacing: '0.08em',
                    minHeight: '1.2em',
                }}>
                    {isListening
                        ? '● RECORDING… tap to stop'
                        : isTranscribing
                            ? '◉ TRANSCRIBING…'
                            : hint || 'Tap mic to speak'}
                </div>
            </div>
        )
    }

    // ── Render field based on step type (voice-only when supported, else fallback inputs) ──
    function renderInput() {
        if (current.type === 'select') {
            if (voiceSupported) {
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {renderVoiceControl('Say: Male, Female, or Other')}
                        {data[current.key] && (
                            <div style={{
                                fontSize: '1rem',
                                padding: '0.75rem',
                                textAlign: 'center',
                                color: 'var(--cyan)',
                                textTransform: 'capitalize',
                            }}>
                                ✓ {data[current.key]}
                            </div>
                        )}
                    </div>
                )
            }
            return (
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                    {current.options.map(opt => (
                        <button
                            key={opt}
                            className={`btn ${data[current.key] === opt ? 'btn-primary' : ''}`}
                            onClick={() => handleChange(opt)}
                            style={{
                                padding: '0.85rem 1.5rem',
                                fontSize: '0.95rem',
                                textTransform: 'capitalize',
                                transition: 'all 0.2s ease',
                            }}
                        >
                            {opt === 'male' ? '👨 Male' : opt === 'female' ? '👩 Female' : '⚧ Other'}
                        </button>
                    ))}
                </div>
            )
        }

        if (current.type === 'yesno') {
            if (voiceSupported) {
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {renderVoiceControl('Say: Yes or No')}
                        {(data[current.key] === 'yes' || data[current.key] === 'no') && (
                            <div style={{
                                fontSize: '1rem',
                                padding: '0.75rem',
                                textAlign: 'center',
                                color: data[current.key] === 'yes' ? 'var(--routine)' : 'var(--critical)',
                            }}>
                                ✓ {data[current.key] === 'yes' ? 'Yes' : 'No'}
                            </div>
                        )}
                    </div>
                )
            }
            return renderYesNo()
        }

        // Text and number: voice-only when supported, else text input
        if (voiceSupported) {
            return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {renderVoiceControl(current.placeholder ? `e.g. ${current.placeholder}` : 'Tap mic to speak')}
                    {getCurrentValue() && (
                        <div style={{
                            fontSize: '1.1rem',
                            padding: '0.75rem 1rem',
                            textAlign: 'center',
                            background: 'rgba(0,212,255,0.06)',
                            border: '1px solid rgba(0,212,255,0.2)',
                            borderRadius: 'var(--radius-md)',
                            color: 'var(--text)',
                            minHeight: '2.5rem',
                        }}>
                            {getCurrentValue()}
                        </div>
                    )}
                    {current.subPrompt && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--muted)', textAlign: 'center' }}>
                            {current.subPrompt}
                        </div>
                    )}
                </div>
            )
        }
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input
                    ref={inputRef}
                    className="input"
                    type={current.type}
                    value={getCurrentValue() || ''}
                    onChange={(e) => handleChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={current.placeholder}
                    min={current.type === 'number' ? String(current.min ?? 0) : undefined}
                    max={current.type === 'number' ? String(current.max ?? 150) : undefined}
                    style={{
                        fontSize: '1.2rem',
                        padding: '1rem 1.25rem',
                        textAlign: 'center',
                    }}
                    autoFocus
                />
                {current.subPrompt && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)', textAlign: 'center' }}>
                        {current.subPrompt}
                    </div>
                )}
            </div>
        )
    }

    // Welcome screen (first thing the user sees)
    if (showWelcome) {
        return (
            <div className="panel" style={{ animation: 'fadeUp 0.6s cubic-bezier(0.22,1,0.36,1) forwards' }}>
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '1.5rem',
                    padding: '1.5rem 1rem 2rem',
                    textAlign: 'center',
                }}>
                    <div style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, var(--cyan), var(--purple))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.75rem',
                        boxShadow: '0 0 20px var(--cyan-glow)',
                    }}>
                        👋
                    </div>
                    <h2 style={{
                        fontFamily: 'var(--font-head)',
                        fontSize: 'clamp(1.2rem, 4vw, 1.6rem)',
                        fontWeight: 600,
                        color: 'var(--text)',
                        lineHeight: 1.4,
                        letterSpacing: '0.02em',
                    }}>
                        {WELCOME_MESSAGE}
                    </h2>
                    <button
                        className="btn btn-primary"
                        onClick={() => setShowWelcome(false)}
                        style={{
                            padding: '0.9rem 2rem',
                            fontSize: '1rem',
                            letterSpacing: '0.08em',
                            marginTop: '0.5rem',
                        }}
                    >
                        Continue →
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="panel" style={{ animation: 'fadeUp 0.6s cubic-bezier(0.22,1,0.36,1) forwards' }}>
            {!voiceSupported && (
                <div style={{
                    fontSize: '0.7rem',
                    color: 'var(--muted)',
                    textAlign: 'center',
                    marginBottom: '1rem',
                    letterSpacing: '0.06em',
                }}>
                    Voice input unavailable in this browser — use the inputs below.
                </div>
            )}

            {/* Progress bar */}
            <div style={{
                display: 'flex',
                gap: '4px',
                marginBottom: '1.75rem',
            }}>
                {STEPS.map((s, i) => (
                    <div
                        key={s.key}
                        style={{
                            flex: 1,
                            height: '3px',
                            borderRadius: '2px',
                            background: i <= step
                                ? 'linear-gradient(90deg, var(--cyan), var(--purple))'
                                : 'rgba(255,255,255,0.06)',
                            transition: 'all 0.4s ease',
                            boxShadow: i <= step ? '0 0 6px var(--cyan-glow)' : 'none',
                        }}
                    />
                ))}
            </div>

            {/* Step counter */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '0.5rem',
            }}>
                <div style={{
                    fontSize: '0.65rem',
                    color: 'var(--muted)',
                    letterSpacing: '0.1em',
                    fontFamily: 'var(--font-mono)',
                }}>
                    STEP {step + 1} / {totalSteps}
                </div>
                <div style={{
                    fontSize: '0.65rem',
                    color: 'var(--cyan)',
                    letterSpacing: '0.08em',
                    fontWeight: 500,
                }}>
                    {current.label.toUpperCase()}
                </div>
            </div>

            {/* Question */}
            <div
                key={step}
                style={{
                    animation: `${animDir === 'forward' ? 'slideIn' : 'fadeIn'} 0.4s cubic-bezier(0.22,1,0.36,1) both`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1.25rem',
                    padding: '1rem 0',
                }}
            >
                <h2 style={{
                    fontFamily: 'var(--font-head)',
                    fontSize: 'clamp(1.1rem, 3vw, 1.5rem)',
                    fontWeight: 600,
                    color: 'var(--text)',
                    letterSpacing: '0.03em',
                    textAlign: 'center',
                    lineHeight: 1.3,
                }}>
                    {current.prompt}
                </h2>

                {renderInput()}
            </div>

            {/* Navigation */}
            <div style={{
                display: 'flex',
                gap: '0.75rem',
                marginTop: '1rem',
            }}>
                {step > 0 && (
                    <button
                        className="btn"
                        onClick={goBack}
                        style={{
                            padding: '0.75rem 1.5rem',
                            fontSize: '0.85rem',
                            flex: '0 0 auto',
                        }}
                    >
                        ← BACK
                    </button>
                )}

                {current.type !== 'select' && (
                    <button
                        className={`btn ${isCurrentValid() ? 'btn-primary' : ''}`}
                        onClick={goNext}
                        disabled={!isCurrentValid()}
                        style={{
                            padding: '0.75rem 1.5rem',
                            fontSize: '0.85rem',
                            flex: 1,
                            fontFamily: 'var(--font-head)',
                            letterSpacing: '0.08em',
                        }}
                    >
                        {isLastStep ? '⚡ SUBMIT FOR TRIAGE' : 'NEXT →'}
                    </button>
                )}
            </div>
        </div>
    )
}
