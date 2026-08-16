import React, { useEffect, useState } from 'react';
import { Box, Typography, useTheme } from '@mui/material';

const MONO = { fontFamily: 'monospace' };
const LOW = '#4fd1a1', MID = '#f5c451', HIGH = '#ff7a7a';
const CNN_C = '#5cc8f5', QML_C = '#c07ae0';

const WEIGHTS = [
    { key: 'cnn', label: 'CNN score', weight: 0.6 },
    { key: 'birads', label: 'BI-RADS', weight: 0.25 },
    { key: 'density', label: 'Density', weight: 0.15 },
];

const bandColor = (s) => (s >= 66 ? HIGH : s >= 33 ? MID : LOW);
const bandName = (s) => (s >= 66 ? 'High risk' : s >= 33 ? 'Medium risk' : 'Low risk');
const severityColor = (s) => (s === 'Malignant' ? HIGH : s === 'Benign' ? MID : LOW);

function Label({ children, sx }) {
    return (
        <Typography sx={{
            ...MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
            lineHeight: 1.2, ...sx,
        }}>{children}</Typography>
    );
}

function Bar({ value, max = 100, color, track, delay = 0, height = 4 }) {
    const [w, setW] = useState(0);
    useEffect(() => {
        const id = setTimeout(() => setW(Math.max(0, Math.min(100, (value / max) * 100))), 100 + delay);
        return () => clearTimeout(id);
    }, [value, max, delay]);
    return (
        <Box sx={{ flex: 1, height, borderRadius: 99, backgroundColor: track, overflow: 'hidden' }}>
            <Box sx={{
                width: `${w}%`, height: '100%', borderRadius: 99, backgroundColor: color,
                transition: 'width 1.1s cubic-bezier(0.16,1,0.3,1)',
            }} />
        </Box>
    );
}

/** Low / Medium / High track with a marker at `score`. Hatched when score is null. */
function BandScale({ score, tokens, height = 12, mounted }) {
    const na = score === null || score === undefined;
    if (na) {
        return (
            <Box sx={{
                height, borderRadius: 1,
                background: `repeating-linear-gradient(135deg, ${tokens.track} 0 8px, ${tokens.card} 8px 16px)`,
            }} />
        );
    }
    const c = bandColor(score);
    return (
        <Box sx={{ position: 'relative', height }}>
            <Box sx={{ position: 'absolute', inset: 0, display: 'flex', gap: '3px' }}>
                <Box sx={{ flex: 33, borderRadius: '3px 0 0 3px', background: 'rgba(79,209,161,0.22)' }} />
                <Box sx={{ flex: 33, background: 'rgba(245,196,81,0.22)' }} />
                <Box sx={{ flex: 34, borderRadius: '0 3px 3px 0', background: 'rgba(255,122,122,0.22)' }} />
            </Box>
            <Box sx={{
                position: 'absolute', top: -5, bottom: -5, width: 3, borderRadius: 1,
                background: c, boxShadow: `0 0 0 4px ${c}29`,
                left: `${mounted ? Math.max(0, Math.min(100, score)) : 0}%`,
                transition: 'left 1.1s cubic-bezier(0.16,1,0.3,1)',
            }} />
        </Box>
    );
}

function pickRisk(src) {
    if (!src) return null;
    const v = src.future_risk_score ?? src.composite_risk_score ?? src.risk_score ?? null;
    return typeof v === 'number' ? v : null;
}


export default function MammoRiskResults({ currentModel, results, sessionId }) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const [mounted, setMounted] = useState(false);

    const t = isDark ? {
        shell: '#0a1728', panel: '#08131f', card: '#0c1c2e', line: '#17304d',
        text: '#eaf4ff', body: '#c3d8ec', muted: '#5f7fa6', dim: '#8fabc9',
        track: '#132840', footer: '#3f5d7d',
    } : {
        shell: theme.palette.background.paper, panel: theme.palette.background.default,
        card: theme.palette.background.paper, line: theme.palette.divider,
        text: theme.palette.text.primary, body: theme.palette.text.primary,
        muted: theme.palette.text.secondary, dim: theme.palette.text.secondary,
        track: 'rgba(0,0,0,0.08)', footer: theme.palette.text.disabled,
    };

    const cnn = results?.resultFile?.CRcnn;
    const qml = results?.resultFile?.CRqml;
    const isBoth = currentModel === 'Both';
    const active = currentModel === 'Quantum' ? qml : cnn;

    useEffect(() => {
        setMounted(false);
        const id = setTimeout(() => setMounted(true), 60);
        return () => clearTimeout(id);
    }, [currentModel, results]);

    if (!cnn && !qml) return null;

    const SEVERITY_RANK = { Malignant: 3, Benign: 2, Normal: 1 };

    const readModel = (src) => {
        const images = src?.image_level_results ?? [];

        /* worst finding across the four views */
        const severity = src?.highest_severity_classification
            ?? src?.overall_classification
            ?? images.reduce((worst, im) => {
                const c = im?.predicted_cancer_class;
                return (SEVERITY_RANK[c] ?? 0) > (SEVERITY_RANK[worst] ?? 0) ? c : worst;
            }, null)
            ?? '—';

        const densityLetters = images.map((im) => im?.predicted_density).filter(Boolean).sort();
        const density = densityLetters.length ? densityLetters[densityLetters.length - 1]
            : (src?.highest_density ?? '—');

        const biradsVals = images.map((im) => Number(im?.predicted_birads)).filter((n) => !Number.isNaN(n) && n > 0);
        const birads = biradsVals.length ? Math.max(...biradsVals) : (src?.highest_birads ?? '—');

        const level = src?.risk_level ?? null;
        const notApplicable = typeof level === 'string' && /not\s*applicable|n\/a/i.test(level);
        const flagged = /malignant/i.test(src?.status ?? '');
        const malignant = severity === 'Malignant' || notApplicable || flagged;

        const score = pickRisk(src);

        return {
            score: malignant ? null : score,
            severity,
            malignant,
            level: malignant ? 'N/A' : (level ?? (score !== null ? bandName(score) : '—')),
            density,
            birads: birads === 0 ? '—' : birads,
            images: src?.number_of_images ?? images.length ?? 4,
            feedback: src?.feedback ?? null,
        };
    };

    const C = readModel(cnn);
    const Q = readModel(qml);
    const A = currentModel === 'Quantum' ? Q : C;
    const disagree = C.severity !== Q.severity;

    const cardSx = {
        width: '100%', my: 2, borderRadius: 1.5, overflow: 'hidden',
        background: t.shell, border: `1px solid ${t.line}`,
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'none' : 'translateY(12px)',
        transition: 'opacity 0.45s ease, transform 0.45s ease',
    };

    const TopBar = () => {
        const badgeColor = isBoth ? (disagree ? HIGH : LOW) : (A.malignant ? HIGH : LOW);
        const badgeText = isBoth
            ? (disagree ? 'Models Disagree' : 'Models Agree')
            : (A.malignant ? 'Malignant detected' : 'No malignancy detected');

        return (
            <Box sx={{
                minHeight: 58, position: 'relative', pl: 3.5, pr: 2.5, py: 1.5,
                display: 'flex', alignItems: 'baseline', gap: 2.75, flexWrap: 'wrap',
                background: t.panel, borderBottom: `1px solid ${t.line}`,
            }}>
                <Typography sx={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em', color: t.text, whiteSpace: 'nowrap' }}>
                    Mammo
                    <Box component="span" sx={{ color: theme.palette.primary.main, fontStyle: 'italic' }}>
                        Analysis
                    </Box>
                </Typography>

                <Box sx={{ width: '1px', alignSelf: 'stretch', background: t.line, flexShrink: 0 }} />

                <Typography sx={{ fontSize: 15, fontWeight: 700, color: t.text, whiteSpace: 'nowrap' }}>
                    Risk Assessment
                </Typography>


                <Box sx={{
                    position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                    display: 'flex', alignItems: 'center', gap: 1.25,
                }}>
                    <Label sx={{ color: t.muted, whiteSpace: 'nowrap' }}>
                        {isBoth ? 'Comparison' : `${currentModel} model`}
                    </Label>
                    <Box sx={{
                        display: 'inline-flex', alignItems: 'center', gap: 0.6,
                        px: 1, py: 0.35, borderRadius: 999,
                        border: `1px solid ${badgeColor}55`, background: `${badgeColor}1a`,
                    }}>
                        <Box sx={{ width: 5, height: 5, borderRadius: '50%', background: badgeColor, flexShrink: 0 }} />
                        <Typography sx={{ ...MONO, fontSize: 9.5, fontWeight: 700, color: badgeColor, whiteSpace: 'nowrap' }}>
                            {badgeText}
                        </Typography>
                    </Box>
                </Box>

                {sessionId && (
                    <Label sx={{ ml: 'auto', color: t.dim, whiteSpace: 'nowrap' }}>
                        ID: {sessionId}
                    </Label>
                )}
            </Box>
        );
    };

    /* ── Comparison ───────────────────────────────────────── */
    if (isBoth) {
        const rows = [
            { k: 'Highest severity', c: C.severity, q: Q.severity, cc: severityColor(C.severity), qc: severityColor(Q.severity) },
            { k: 'Risk level', c: C.level, q: Q.level, cc: C.malignant ? t.dim : bandColor(C.score ?? 0), qc: Q.malignant ? t.dim : bandColor(Q.score ?? 0) },
            { k: 'Highest density', c: C.density, q: Q.density, cc: t.text, qc: t.text },
            { k: 'Highest BI-RADS', c: C.birads, q: Q.birads, cc: t.text, qc: t.text },
        ];
        const disagree = C.severity !== Q.severity;

        return (
            <Box sx={cardSx}>
                <TopBar />
                <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                    <Box sx={{ flex: 1, minWidth: 380, p: '28px', display: 'flex', flexDirection: 'column', gap: 1.75 }}>
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 2, px: 0.5 }}>
                            <Label sx={{ color: t.muted }}>Metric</Label>
                            <Label sx={{ color: CNN_C }}>Classical</Label>
                            <Label sx={{ color: QML_C }}>Quantum</Label>
                        </Box>
                        {rows.map(({ k, c, q, cc, qc }) => (
                            <Box key={k} sx={{
                                display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 2, alignItems: 'center',
                                p: '12px 14px', borderRadius: 2.5, background: t.card, border: `1px solid ${t.line}`,
                            }}>
                                <Typography sx={{ fontSize: 13, color: t.body }}>{k}</Typography>
                                <Typography sx={{ ...MONO, fontSize: 14, color: cc }}>{c}</Typography>
                                <Typography sx={{ ...MONO, fontSize: 14, color: qc }}>{q}</Typography>
                            </Box>
                        ))}
                    </Box>

                    <Box sx={{
                        width: 520, flexGrow: 1, borderLeft: `1px solid ${t.line}`, background: t.panel,
                        p: 3, display: 'flex', flexDirection: 'column', gap: 2.25,
                    }}>
                        {[{ m: C, name: 'Classical', c: CNN_C }, { m: Q, name: 'Quantum', c: QML_C }].map(({ m, name, c }, i) => (
                            <React.Fragment key={name}>
                                {i === 1 && <Box sx={{ height: '1px', background: t.line }} />}
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 2 }}>
                                        <Label sx={{ color: c }}>{name} risk index</Label>
                                        <Typography sx={{ ...MONO, fontSize: 22, color: m.score === null ? t.dim : bandColor(m.score) }}>
                                            {m.score === null ? 'N/A' : m.score.toFixed(2)}
                                        </Typography>
                                    </Box>
                                    <BandScale score={m.score} tokens={t} height={10} mounted={mounted} />
                                    {m.score === null ? (
                                        <Box sx={{
                                            display: 'flex', alignItems: 'flex-start', gap: 1.25,
                                            p: '13px 15px', borderRadius: 2.5,
                                            background: 'rgba(255,122,122,0.10)', border: `1px solid ${HIGH}55`,
                                        }}>
                                            <Typography sx={{ ...MONO, fontSize: 13, color: HIGH }}>!</Typography>
                                            <Typography sx={{ fontSize: 13, color: t.body, lineHeight: 1.55 }}>
                                                {m.feedback ?? 'A malignant finding was detected in at least one image. Future cancer risk estimation is not applicable because the case is already classified as cancer-suspicious. Please seek medical review.'}
                                            </Typography>
                                        </Box>
                                    ) : (
                                        <Label sx={{ color: bandColor(m.score) }}>{bandName(m.score)}</Label>
                                    )}
                                </Box>
                            </React.Fragment>
                        ))}
                        <Label sx={{ mt: 'auto', color: HIGH, letterSpacing: '0.08em', fontWeight: 700, fontSize: 9.5, whiteSpace: 'nowrap' }}>
                            Research prototype · Not for clinical use
                        </Label>
                    </Box>
                </Box>
            </Box>
        );
    }

    /* ── Single model ─────────────────────────────────────── */
    const score = A.score;
    const c = score === null ? t.dim : bandColor(score);

    return (
        <Box sx={cardSx}>
            <TopBar />

            <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                {/* inputs */}
                <Box sx={{
                    width: 232, flex: 'none', p: '28px 20px', borderRight: `1px solid ${t.line}`,
                    display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                    <Label sx={{ color: t.muted }}>Inputs</Label>
                    {[
                        { k: 'Highest severity', v: A.severity, c: severityColor(A.severity) },
                        { k: 'Highest density', v: A.density, c: t.text },
                        { k: 'Highest BI-RADS', v: A.birads, c: t.text },
                    ].map(({ k, v, c: vc }) => (
                        <Box key={k} sx={{ display: 'flex', flexDirection: 'column', gap: 0.4 }}>
                            <Label sx={{ color: t.muted }}>{k}</Label>
                            <Typography sx={{ ...MONO, fontSize: 18, color: vc }}>{v}</Typography>
                        </Box>
                    ))}
                    <Box sx={{ mt: 'auto', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <Label sx={{ color: t.muted }}>Images used</Label>
                        <Typography sx={{ ...MONO, fontSize: 13, color: t.body }}>
                            {A.images} views · L/R CC + MLO
                        </Typography>
                    </Box>
                </Box>

                {/* index + band */}
                <Box sx={{ flex: 1, minWidth: 800, p: '28px', display: 'flex', flexDirection: 'column', gap: 2.75 }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2.5 }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6 }}>
                            <Label sx={{ color: t.muted }}>Composite risk index</Label>
                            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2.5, flexWrap: 'wrap' }}>
                                <Typography sx={{ ...MONO, fontSize: 48, lineHeight: 1, color: c }}>
                                    {score === null ? 'N/A' : score.toFixed(1)}
                                </Typography>
                                {score !== null && (
                                    <Typography sx={{ ...MONO, fontSize: 18, color: c }}>{A.level}</Typography>
                                )}
                            </Box>
                        </Box>
                        <Label sx={{ color: t.muted }}>Scale 0—100</Label>
                    </Box>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                        <BandScale score={score} tokens={t} mounted={mounted} />
                        <Box sx={{ display: 'flex' }}>
                            <Label sx={{ flex: 33, color: score !== null && score < 33 ? LOW : t.muted }}>Low 0—33</Label>
                            <Label sx={{ flex: 33, color: score !== null && score >= 33 && score < 66 ? MID : t.muted }}>Medium 33—66</Label>
                            <Label sx={{ flex: 34, textAlign: 'right', color: score !== null && score >= 66 ? HIGH : t.muted }}>High 66—100</Label>
                        </Box>
                    </Box>

                    <Box sx={{
                        display: 'flex', alignItems: 'flex-start', gap: 1.25, p: '14px 16px', borderRadius: 2.5,
                        background: A.malignant ? 'rgba(255,122,122,0.10)' : t.card,
                        border: `1px solid ${A.malignant ? `${HIGH}55` : t.line}`,
                    }}>
                        <Typography sx={{ ...MONO, fontSize: 13, color: A.malignant ? HIGH : c }}>!</Typography>
                        <Typography sx={{ fontSize: 13, color: t.body, lineHeight: 1.55 }}>
                            {A.feedback
                                ? A.feedback
                                : A.malignant
                                    ? 'A malignant finding was detected in at least one image. Future cancer risk estimation is not applicable because the case is already classified as cancer-suspicious. Please seek medical review.'
                                    : score !== null && score >= 33
                                        ? 'Some areas may need further review. A follow-up consultation with a healthcare professional is recommended.'
                                        : 'No areas of concern were flagged across the four views. Continue routine screening.'}
                        </Typography>
                    </Box>
                </Box>

                {/* composition */}
                <Box sx={{
                    width: 352, flexGrow: 1, p: 3, borderLeft: `1px solid ${t.line}`, background: t.panel,
                    display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                    <Label sx={{ color: t.muted }}>How the score is built</Label>
                    {WEIGHTS.map(({ key, label, weight }, i) => (
                        <Box key={key} sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <Typography sx={{ fontSize: 13, color: t.body }}>{label}</Typography>
                                <Typography sx={{ ...MONO, fontSize: 12, color: CNN_C }}>×{weight.toFixed(2)}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Bar value={weight * 100} color={CNN_C} track={t.track} delay={i * 110} />
                                <Typography sx={{ ...MONO, fontSize: 11, color: t.dim, width: 44, textAlign: 'right' }}>
                                    {score === null ? '—' : (score * weight).toFixed(1)}
                                </Typography>
                            </Box>
                        </Box>
                    ))}
                    <Box sx={{ height: '1px', background: t.line }} />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <Label sx={{ color: t.muted }}>Total</Label>
                        <Typography sx={{ ...MONO, fontSize: 16, color: c }}>
                            {score === null ? 'N/A' : score.toFixed(2)}
                        </Typography>
                    </Box>
                    <Label sx={{ mt: 'auto', color: HIGH, letterSpacing: '0.08em', fontWeight: 700, fontSize: 9.5, whiteSpace: 'nowrap' }}>
                        Research prototype · Not for clinical use
                    </Label>
                </Box>
            </Box>
        </Box>
    );
}