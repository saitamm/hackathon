'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { transcribeAudio, speakText } from '../lib/api'

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
    const [conversationMode, setConversationMode] = useState(false)
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
    const applyVoiceResultRef = useRef(() => { })
    const advanceStepRef = useRef(() => { })
    const welcomeSpokenRef = useRef(false)

    // Conversation mode state
    const [convoPhase, setConvoPhase] = useState('idle') // idle | speaking | listening | transcribing | done
    const [convoLog, setConvoLog] = useState([]) // { role: 'ai'|'user', text: string }[]
    const convoActiveRef = useRef(false)
    const dataRef = useRef(data)
    dataRef.current = data

    stepRef.current = step

    // Speak welcome message once when welcome screen is shown
    useEffect(() => {
        if (!showWelcome || typeof window === 'undefined') return
        if (welcomeSpokenRef.current) return
        welcomeSpokenRef.current = true
        const t = setTimeout(() => speakText(WELCOME_MESSAGE).catch(() => { }), 600)
        return () => clearTimeout(t)
    }, [showWelcome])

    // Speak each step's prompt when advancing through the wizard (only in form mode)
    const lastSpokenStepRef = useRef(-1)
    useEffect(() => {
        if (showWelcome || conversationMode) return
        if (lastSpokenStepRef.current === step) return
        lastSpokenStepRef.current = step
        speakText(STEPS[step].prompt).catch(() => { })
    }, [step, showWelcome, conversationMode])

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
            if (/\b(male|mal|man|men|boy|guy|dude|gentleman|masculine|homme|garcon)\b/.test(t)) return 'male'
            if (/\b(female|fem|woman|women|girl|gal|lady|feminine|femme|fille)\b/.test(t)) return 'female'
            if (/\b(other|nonbinary|non-binary|non binary|neither|prefer not)\b/.test(t)) return 'other'
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

    // ── Recording helpers (shared by form mode and conversation mode) ──
    const silenceTimerRef = useRef(null)
    const audioCtxRef = useRef(null)

    /**
     * Record audio with automatic silence detection.
     * Stops recording automatically after ~1.5s of silence once speech is detected.
     * User can also tap the stop button manually as a fallback.
     */
    function recordAudio() {
        return new Promise(async (resolve, reject) => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
                const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                    ? 'audio/webm;codecs=opus'
                    : 'audio/webm'
                const recorder = new MediaRecorder(stream, { mimeType })
                const chunks = []

                // ── Silence detection via Web Audio API ──
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
                audioCtxRef.current = audioCtx
                const source = audioCtx.createMediaStreamSource(stream)
                const analyser = audioCtx.createAnalyser()
                analyser.fftSize = 512
                source.connect(analyser)

                const dataArray = new Uint8Array(analyser.frequencyBinCount)
                const SILENCE_THRESHOLD = 12   // avg volume below this = silence
                const SILENCE_DURATION = 1500   // ms of silence to auto-stop
                const MIN_RECORD_TIME = 800     // don't auto-stop before this
                let speechDetected = false
                let silenceStart = null
                const recordStart = Date.now()

                const silenceCheck = setInterval(() => {
                    if (recorder.state === 'inactive') {
                        clearInterval(silenceCheck)
                        return
                    }
                    analyser.getByteFrequencyData(dataArray)
                    const volume = dataArray.reduce((a, b) => a + b, 0) / dataArray.length

                    if (volume > SILENCE_THRESHOLD) {
                        // User is speaking
                        speechDetected = true
                        silenceStart = null
                    } else if (speechDetected && (Date.now() - recordStart) > MIN_RECORD_TIME) {
                        // Silence after speech — start counting
                        if (!silenceStart) silenceStart = Date.now()
                        if (Date.now() - silenceStart >= SILENCE_DURATION) {
                            // Auto-stop: enough silence detected
                            clearInterval(silenceCheck)
                            if (recorder.state !== 'inactive') {
                                recorder.stop()
                            }
                        }
                    }
                }, 100)

                silenceTimerRef.current = silenceCheck

                recorder.ondataavailable = (e) => {
                    if (e.data.size > 0) chunks.push(e.data)
                }
                recorder.onstop = () => {
                    clearInterval(silenceCheck)
                    silenceTimerRef.current = null
                    audioCtx.close().catch(() => {})
                    audioCtxRef.current = null
                    stream.getTracks().forEach(t => t.stop())
                    const blob = new Blob(chunks, { type: mimeType })
                    setIsListening(false)
                    resolve(blob)
                }
                recorder.start()
                // Store so we can stop externally
                mediaRecorderRef.current = recorder
                setIsListening(true)
            } catch (err) {
                reject(err)
            }
        })
    }

    function stopRecording() {
        if (silenceTimerRef.current) {
            clearInterval(silenceTimerRef.current)
            silenceTimerRef.current = null
        }
        if (audioCtxRef.current) {
            audioCtxRef.current.close().catch(() => {})
            audioCtxRef.current = null
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop()
            mediaRecorderRef.current = null
            setIsListening(false)
        }
    }

    // Start recording from the microphone (form mode – legacy)
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
                stream.getTracks().forEach(t => t.stop())
                const blob = new Blob(audioChunksRef.current, { type: mimeType })
                if (blob.size < 100) return

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
                    console.error('STT error:', err)
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

    const stopListening = useCallback(() => {
        if (!mediaRecorderRef.current || !isListening) return
        mediaRecorderRef.current.stop()
        mediaRecorderRef.current = null
        setIsListening(false)
    }, [isListening])

    // Auto-focus input on step change (form mode)
    useEffect(() => {
        if (conversationMode) return
        if (!voiceSupported) setTimeout(() => inputRef.current?.focus(), 300)
    }, [step, voiceSupported, conversationMode])

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

    // ════════════════════════════════════════════════════════════════
    // ██  CONVERSATION MODE — fully voice-driven triage loop       ██
    // ════════════════════════════════════════════════════════════════
    async function startConversation() {
        setShowWelcome(false)
        setConversationMode(true)
        setConvoLog([])
        setStep(0)
        convoActiveRef.current = true
        // Small delay then start the loop
        setTimeout(() => runConversationLoop(0, {}), 400)
    }

    async function runConversationLoop(stepIdx, accumulated) {
        if (!convoActiveRef.current) return
        if (stepIdx >= STEPS.length) {
            // All done — submit
            setConvoPhase('done')
            const finalData = { ...dataRef.current, ...accumulated }
            const builtSymptoms = buildSymptomsString(finalData)
            setConvoLog(prev => [...prev, { role: 'ai', text: 'Thank you! I have all the information. Analyzing your data now…' }])
            await speakText('Thank you! I have all the information. Analyzing your data now.').catch(() => { })
            onTranscript(builtSymptoms)
            onComplete?.({ symptoms: builtSymptoms, patientData: finalData })
            convoActiveRef.current = false
            return
        }

        const stepConfig = STEPS[stepIdx]
        setStep(stepIdx)

        // 1. AI speaks the question
        setConvoPhase('speaking')
        setConvoLog(prev => [...prev, { role: 'ai', text: stepConfig.prompt }])
        await speakText(stepConfig.prompt).catch(() => { })
        if (!convoActiveRef.current) return

        // 2. Auto-start recording
        setConvoPhase('listening')
        let blob
        try {
            const recordPromise = recordAudio()
            // Wait for user to tap stop — we don't auto-stop, user controls it
            blob = await recordPromise
        } catch (err) {
            console.error('Recording error:', err)
            convoActiveRef.current = false
            return
        }
        if (!convoActiveRef.current) return
        if (!blob || blob.size < 100) {
            // Re-ask if recording was too short
            await speakText("I didn't hear anything. Let me ask again.").catch(() => { })
            runConversationLoop(stepIdx, accumulated)
            return
        }

        // 3. Transcribe
        setConvoPhase('transcribing')
        setIsTranscribing(true)
        let text
        try {
            text = await transcribeAudio(blob)
        } catch (err) {
            console.error('Transcription error:', err)
            setIsTranscribing(false)
            await speakText("Sorry, I couldn't understand that. Let me ask again.").catch(() => { })
            runConversationLoop(stepIdx, accumulated)
            return
        }
        setIsTranscribing(false)
        if (!convoActiveRef.current) return

        // 4. Normalize and validate
        const normalized = normalizeVoiceValue(text, stepConfig)
        setConvoLog(prev => [...prev, { role: 'user', text: text || '(no speech detected)' }])

        if (normalized === undefined) {
            // Invalid answer — re-ask with a hint
            const hint = stepConfig.type === 'yesno'
                ? 'Please answer with yes or no.'
                : stepConfig.type === 'select'
                    ? 'Please say male, female, or other.'
                    : stepConfig.type === 'number'
                        ? 'Please say a number.'
                        : 'Could you repeat that?'
            setConvoLog(prev => [...prev, { role: 'ai', text: `I didn't catch that. ${hint}` }])
            await speakText(`I didn't catch that. ${hint}`).catch(() => { })
            runConversationLoop(stepIdx, accumulated)
            return
        }

        // 5. Apply value
        const newAccumulated = { ...accumulated, [stepConfig.key]: normalized }
        const updated = { ...dataRef.current, [stepConfig.key]: normalized }
        setData(updated)
        onPatientData(updated)

        // Check emergency
        if (stepConfig.type === 'yesno') {
            const triggersEmergency = (stepConfig.noIsEmergency && normalized === 'no') || (stepConfig.yesIsEmergency && normalized === 'yes')
            if (triggersEmergency) {
                setConvoPhase('done')
                convoActiveRef.current = false
                onComplete?.({ emergency: true, emergencyReason: stepConfig.emergencyReason, data: updated })
                return
            }
        }

        // 6. Confirm and advance
        const confirmMsg = stepConfig.type === 'yesno'
            ? `Got it, ${normalized}.`
            : `Got it, ${normalized}.`
        setConvoLog(prev => [...prev, { role: 'ai', text: confirmMsg }])
        await speakText(confirmMsg).catch(() => { })

        // Move to next step
        runConversationLoop(stepIdx + 1, newAccumulated)
    }

    // Stop conversation mode
    function cancelConversation() {
        convoActiveRef.current = false
        stopRecording()
        setConversationMode(false)
        setConvoPhase('idle')
        setShowWelcome(true)
        setStep(0)
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
                        ? '● RECORDING… auto-stops when you pause'
                        : isTranscribing
                            ? '◉ TRANSCRIBING…'
                            : hint || 'Tap mic to speak'}
                </div>
            </div>
        )
    }

    // ── Render field based on step type — always show BOTH voice + text/buttons ──
    function renderInput() {
        if (current.type === 'select') {
            return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {voiceSupported && renderVoiceControl('Say: Male, Female, or Other')}
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
                </div>
            )
        }

        if (current.type === 'yesno') {
            return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {voiceSupported && renderVoiceControl('Say: Yes or No')}
                    {renderYesNo()}
                </div>
            )
        }

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {voiceSupported && renderVoiceControl(current.placeholder ? `e.g. ${current.placeholder}` : 'Tap mic to speak')}
                {voiceSupported && getCurrentValue() && (
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
                {voiceSupported && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        margin: '0.25rem 0',
                    }}>
                        <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
                        <span style={{ fontSize: '0.65rem', color: 'var(--muted)', letterSpacing: '0.1em' }}>OR TYPE</span>
                        <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
                    </div>
                )}
                <input
                    ref={inputRef}
                    className="input"
                    type={current.type === 'number' ? 'number' : 'text'}
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
                    autoFocus={!voiceSupported}
                />
                {current.subPrompt && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)', textAlign: 'center' }}>
                        {current.subPrompt}
                    </div>
                )}
            </div>
        )
    }

    // ════════════════════════════════════════════════════════════════
    // ██  CONVERSATION MODE UI                                     ██
    // ════════════════════════════════════════════════════════════════
    if (conversationMode) {
        const phaseLabel = {
            idle: 'Starting conversation…',
            speaking: '🔊 AI is speaking…',
            listening: '🎤 Listening… speak now (auto-stops when you pause)',
            transcribing: '⏳ Processing your answer…',
            done: '✅ All done!',
        }[convoPhase] || ''

        return (
            <div className="panel" style={{ animation: 'fadeUp 0.6s cubic-bezier(0.22,1,0.36,1) forwards' }}>
                {/* Header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '1.25rem',
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                    }}>
                        <div style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: convoPhase === 'done' ? 'var(--routine)' : 'var(--cyan)',
                            boxShadow: `0 0 8px ${convoPhase === 'done' ? 'var(--routine-glow)' : 'var(--cyan-glow)'}`,
                            animation: convoPhase !== 'done' ? 'pulse 1.5s ease infinite' : undefined,
                        }} />
                        <span style={{
                            fontSize: '0.7rem',
                            fontFamily: 'var(--font-head)',
                            color: 'var(--cyan)',
                            letterSpacing: '0.1em',
                        }}>
                            CONVERSATION MODE
                        </span>
                    </div>
                    <button
                        className="btn"
                        onClick={cancelConversation}
                        style={{
                            padding: '0.3rem 0.7rem',
                            fontSize: '0.65rem',
                        }}
                    >
                        ✕ EXIT
                    </button>
                </div>

                {/* Progress bar */}
                <div style={{
                    display: 'flex',
                    gap: '4px',
                    marginBottom: '1.25rem',
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

                {/* Chat log */}
                <div style={{
                    maxHeight: '280px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.6rem',
                    marginBottom: '1.25rem',
                    padding: '0.5rem 0',
                }}>
                    {convoLog.map((msg, i) => (
                        <div
                            key={i}
                            style={{
                                display: 'flex',
                                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                animation: 'fadeUp 0.3s ease',
                            }}
                        >
                            <div style={{
                                maxWidth: '85%',
                                padding: '0.6rem 0.9rem',
                                borderRadius: msg.role === 'user'
                                    ? '12px 12px 4px 12px'
                                    : '12px 12px 12px 4px',
                                background: msg.role === 'user'
                                    ? 'rgba(168, 85, 247, 0.15)'
                                    : 'rgba(0, 212, 255, 0.08)',
                                border: `1px solid ${msg.role === 'user'
                                    ? 'rgba(168, 85, 247, 0.25)'
                                    : 'rgba(0, 212, 255, 0.15)'}`,
                                fontSize: '0.85rem',
                                color: 'var(--text)',
                                lineHeight: 1.4,
                            }}>
                                <span style={{
                                    fontSize: '0.6rem',
                                    color: msg.role === 'user' ? 'var(--purple)' : 'var(--cyan)',
                                    letterSpacing: '0.1em',
                                    display: 'block',
                                    marginBottom: '0.2rem',
                                    fontWeight: 600,
                                }}>
                                    {msg.role === 'user' ? 'YOU' : 'AI NURSE'}
                                </span>
                                {msg.text}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Central mic button (for stopping recording) */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.5rem 0',
                }}>
                    {convoPhase === 'listening' && (
                        <button
                            type="button"
                            onClick={stopRecording}
                            className="btn btn-critical"
                            style={{
                                width: '88px',
                                height: '88px',
                                borderRadius: '50%',
                                padding: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '2.5rem',
                                boxShadow: '0 0 30px rgba(239,68,68,0.5)',
                                animation: 'pulse 1.2s ease infinite',
                            }}
                            aria-label="Stop recording early"
                        >
                            🎤
                        </button>
                    )}
                    {convoPhase === 'listening' && (
                        <div style={{
                            fontSize: '0.6rem',
                            color: 'var(--muted)',
                            marginTop: '-0.5rem',
                        }}>
                            or tap to stop early
                        </div>
                    )}
                    {convoPhase === 'speaking' && (
                        <div style={{
                            width: '88px',
                            height: '88px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, rgba(0,212,255,0.15), rgba(168,85,247,0.15))',
                            border: '2px solid rgba(0,212,255,0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '2.5rem',
                            animation: 'pulse 1.5s ease infinite',
                            boxShadow: '0 0 24px var(--cyan-glow)',
                        }}>
                            🔊
                        </div>
                    )}
                    {convoPhase === 'transcribing' && (
                        <div style={{
                            width: '88px',
                            height: '88px',
                            borderRadius: '50%',
                            background: 'rgba(168,85,247,0.1)',
                            border: '2px solid rgba(168,85,247,0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '2.5rem',
                            animation: 'pulse 1.2s ease infinite',
                            boxShadow: '0 0 24px rgba(168,85,247,0.3)',
                        }}>
                            ⏳
                        </div>
                    )}

                    {/* Phase label */}
                    <div style={{
                        fontSize: '0.8rem',
                        color: convoPhase === 'listening'
                            ? 'var(--critical)'
                            : convoPhase === 'speaking'
                                ? 'var(--cyan)'
                                : convoPhase === 'transcribing'
                                    ? 'var(--purple)'
                                    : 'var(--routine)',
                        letterSpacing: '0.06em',
                        fontWeight: 500,
                        textAlign: 'center',
                    }}>
                        {phaseLabel}
                    </div>
                </div>
            </div>
        )
    }

    // ════════════════════════════════════════════════════════════════
    // ██  WELCOME SCREEN                                           ██
    // ════════════════════════════════════════════════════════════════
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

                    {/* Two mode buttons */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                        width: '100%',
                        maxWidth: '320px',
                        marginTop: '0.5rem',
                    }}>
                        <button
                            className="btn btn-primary"
                            onClick={() => setShowWelcome(false)}
                            style={{
                                padding: '0.9rem 2rem',
                                fontSize: '1rem',
                                letterSpacing: '0.08em',
                                width: '100%',
                            }}
                        >
                            📝 Fill Form
                        </button>

                        <button
                            className="btn"
                            onClick={startConversation}
                            disabled={!voiceSupported}
                            style={{
                                padding: '0.9rem 2rem',
                                fontSize: '1rem',
                                letterSpacing: '0.08em',
                                width: '100%',
                                background: voiceSupported
                                    ? 'linear-gradient(135deg, rgba(168,85,247,0.15), rgba(0,212,255,0.15))'
                                    : undefined,
                                border: voiceSupported
                                    ? '1px solid rgba(168,85,247,0.35)'
                                    : undefined,
                                boxShadow: voiceSupported
                                    ? '0 0 20px rgba(168,85,247,0.15)'
                                    : undefined,
                            }}
                        >
                            🎤 Talk to AI
                        </button>

                        {!voiceSupported && (
                            <div style={{
                                fontSize: '0.65rem',
                                color: 'var(--muted)',
                                letterSpacing: '0.06em',
                            }}>
                                Voice mode requires microphone access
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )
    }

    // ════════════════════════════════════════════════════════════════
    // ██  FORM MODE (original step-by-step wizard)                 ██
    // ════════════════════════════════════════════════════════════════
    return (
        <div className="panel" style={{ animation: 'fadeUp 0.6s cubic-bezier(0.22,1,0.36,1) forwards' }}>

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
