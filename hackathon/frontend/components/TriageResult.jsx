'use client'

export default function TriageResult({ level, rationale, instruction }) {
    const config = {
        CRITICAL: {
            className: 'badge-critical',
            emoji: '🔴',
            color: 'var(--critical)',
            glow: 'var(--critical-glow)',
            bg: 'rgba(239, 68, 68, 0.04)',
            label: 'CRITICAL — IMMEDIATE ATTENTION',
        },
        URGENT: {
            className: 'badge-urgent',
            emoji: '🟡',
            color: 'var(--urgent)',
            glow: 'var(--urgent-glow)',
            bg: 'rgba(245, 158, 11, 0.04)',
            label: 'URGENT — PRIORITY CARE',
        },
        ROUTINE: {
            className: 'badge-routine',
            emoji: '🟢',
            color: 'var(--routine)',
            glow: 'var(--routine-glow)',
            bg: 'rgba(16, 185, 129, 0.04)',
            label: 'ROUTINE — STANDARD QUEUE',
        },
    }

    const c = config[level] ?? config.ROUTINE

    return (
        <div
            className="panel"
            style={{
                animation: 'fadeUp 0.6s cubic-bezier(0.22,1,0.36,1) forwards',
                borderTop: `2px solid ${c.color}`,
                background: c.bg,
            }}
        >
            <div className="section-title">Triage Classification</div>

            {/* Level badge */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                marginBottom: '1rem',
            }}>
                {/* Pulsing dot */}
                <span style={{ position: 'relative', display: 'inline-flex' }}>
                    <span style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        background: c.color,
                        boxShadow: `0 0 12px ${c.glow}`,
                    }} />
                    {level === 'CRITICAL' && (
                        <span style={{
                            position: 'absolute',
                            inset: '-4px',
                            borderRadius: '50%',
                            border: `2px solid ${c.color}`,
                            animation: 'pulseRing 2s ease-out infinite',
                        }} />
                    )}
                </span>

                <span
                    className={c.className}
                    style={{
                        fontFamily: 'var(--font-head)',
                        fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                    }}
                >
                    {c.label}
                </span>
            </div>

            {/* Rationale */}
            <div style={{
                color: 'var(--text-secondary)',
                fontSize: '0.9rem',
                lineHeight: 1.7,
                paddingLeft: '1.6rem',
                borderLeft: `2px solid rgba(0, 212, 255, 0.1)`,
                animation: 'fadeIn 0.6s ease 0.3s both',
            }}>
                {rationale}
            </div>

            {/* Patient Instruction */}
            {instruction && (
                <div style={{
                    marginTop: '1.25rem',
                    padding: '1rem 1.25rem',
                    background: 'rgba(0, 212, 255, 0.03)',
                    border: '1px solid rgba(0, 212, 255, 0.1)',
                    borderRadius: 'var(--radius-sm)',
                    animation: 'fadeIn 0.6s ease 0.5s both',
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        marginBottom: '0.5rem',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        letterSpacing: '0.1em',
                        color: 'var(--cyan)',
                        fontFamily: 'var(--font-head)',
                    }}>
                        💬 PATIENT INSTRUCTION
                    </div>
                    <div style={{
                        color: 'var(--text)',
                        fontSize: '0.95rem',
                        lineHeight: 1.7,
                        fontStyle: 'italic',
                    }}>
                        {instruction}
                    </div>
                </div>
            )}
        </div>
    )
}
