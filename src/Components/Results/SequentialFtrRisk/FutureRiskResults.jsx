import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Box, Typography, Button, useTheme } from '@mui/material';

const MONO = { fontFamily: 'monospace' };
const MODELS = [
    { id: 'Classical', label: 'Classical AI' },
    { id: 'Quantum', label: 'Quantum AI' },
    { id: 'Both', label: 'Comparison' },
];

const LOW = '#4fd1a1', MID = '#f5c451', HIGH = '#ff7a7a';
const CNN_C = '#5cc8f5', QML_C = '#c07ae0';

const getRiskColor = (s) => (s >= 66 ? HIGH : s >= 33 ? MID : LOW);
const riskBand = (s) => (s >= 66 ? 'High' : s >= 33 ? 'Moderate' : 'Low');

function horizonsFromYearly(yearly) {
    if (!yearly) return [];
    return Object.entries(yearly).map(([key, val]) => ({ year: key.replace('_year', ''), risk: val }));
}

function buildExamHistory(uploadedFiles, imageResults) {
    if (!uploadedFiles || uploadedFiles.length === 0) return [];
    const sorted = [...uploadedFiles].sort((a, b) => new Date(b.scanDate) - new Date(a.scanDate));
    return sorted.map((f, i) => {
        const apiResult = imageResults?.find((r) => r.filename === f.file.name);
        const contribution = apiResult?.image_contribution_percent ?? null;
        return {
            year: new Date(f.scanDate).getFullYear(),
            scanDate: f.scanDate,
            filename: f.file.name,
            weight: contribution !== null ? contribution : (100 / sorted.length),
            isCurrent: i === 0,
        };
    });
}

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

/** Risk curve. Draws in real pixel space (measured), so nothing is ever stretched. */
function RiskCurve({ series, yMax, tokens, mounted }) {
    const ref = useRef(null);
    const [size, setSize] = useState({ w: 0, h: 0 });

    useLayoutEffect(() => {
        if (!ref.current || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(([e]) => {
            const { width, height } = e.contentRect;
            setSize({ w: Math.round(width), h: Math.round(height) });
        });
        ro.observe(ref.current);
        return () => ro.disconnect();
    }, []);

    const { w, h } = size;
    const PAD = { l: 52, r: 16, t: 14, b: 28 };
    const plotW = Math.max(0, w - PAD.l - PAD.r);
    const plotH = Math.max(0, h - PAD.t - PAD.b);
    const n = series[0]?.points.length ?? 0;

    const x = (i) => PAD.l + (n <= 1 ? plotW / 2 : (i * plotW) / (n - 1));
    const y = (v) => PAD.t + plotH - (Math.max(0, Math.min(yMax, v)) / yMax) * plotH;

    const smooth = (pts) => pts.reduce((d, p, i) => {
        if (i === 0) return `M${p[0]},${p[1]}`;
        const prev = pts[i - 1];
        const cx = (prev[0] + p[0]) / 2;
        return `${d} C${cx},${prev[1]} ${cx},${p[1]} ${p[0]},${p[1]}`;
    }, '');

    const gridVals = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);

    return (
        <Box ref={ref} sx={{
            flex: 1, minHeight: 0, borderRadius: 2.5, p: 1.75,
            background: tokens.card, border: `1px solid ${tokens.line}`,
        }}>
            {w > 0 && h > 0 && (
                <svg width={w - 28} height={h - 28} style={{ display: 'block', overflow: 'visible' }}>
                    <defs>
                        {series.map((s, i) => (
                            <linearGradient key={i} id={`riskfill-${i}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={s.color} stopOpacity="0.3" />
                                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                            </linearGradient>
                        ))}
                    </defs>

                    {gridVals.map((v, i) => (
                        <g key={i}>
                            <line x1={PAD.l} y1={y(v)} x2={PAD.l + plotW} y2={y(v)} stroke={tokens.line} strokeWidth="1" />
                            <text x={PAD.l - 10} y={y(v) + 4} textAnchor="end"
                                fill={tokens.muted} fontFamily="monospace" fontSize="11">
                                {v.toFixed(0)}%
                            </text>
                        </g>
                    ))}

                    {Array.from({ length: n }, (_, i) => (
                        <text key={i} x={x(i)} y={PAD.t + plotH + 20} textAnchor="middle"
                            fill={tokens.muted} fontFamily="monospace" fontSize="11">
                            {series[0].points[i].year}
                        </text>
                    ))}

                    {series.map((s, si) => {
                        const pts = s.points.map((p, i) => [x(i), y(p.risk)]);
                        const path = smooth(pts);
                        return (
                            <g key={si} style={{
                                opacity: mounted ? 1 : 0,
                                transition: `opacity 0.7s ease ${si * 0.15}s`,
                            }}>
                                {series.length === 1 && (
                                    <path d={`${path} L${x(n - 1)},${PAD.t + plotH} L${PAD.l},${PAD.t + plotH} Z`}
                                        fill={`url(#riskfill-${si})`} />
                                )}
                                <path d={path} fill="none" stroke={s.color} strokeWidth="3" strokeLinecap="round" />
                                {pts.map(([px, py], i) => <circle key={i} cx={px} cy={py} r="5" fill={s.color} />)}
                            </g>
                        );
                    })}
                </svg>
            )}
        </Box>
    );
}


export default function FutureRiskResults({
    reset,
    currentModel,
    onModelSelect,
    results,
    uploadedFiles,
    height = 820,
}) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const [mounted, setMounted] = useState(false);

    const t = isDark ? {
        shell: '#0a1728', panel: '#08131f', card: '#0c1c2e', line: '#17304d',
        selLine: '#2f7fb8', selBg: '#0f2740', text: '#eaf4ff', body: '#c3d8ec',
        muted: '#5f7fa6', dim: '#8fabc9', track: '#132840', footer: '#3f5d7d',
    } : {
        shell: theme.palette.background.paper, panel: theme.palette.background.default,
        card: theme.palette.background.paper, line: theme.palette.divider,
        selLine: '#2f7fb8', selBg: 'rgba(92,200,245,0.10)',
        text: theme.palette.text.primary, body: theme.palette.text.primary,
        muted: theme.palette.text.secondary, dim: theme.palette.text.secondary,
        track: 'rgba(0,0,0,0.08)', footer: theme.palette.text.disabled,
    };

    const qmlData = results?.resultFile?.qml;
    const cnnData = results?.resultFile?.cnn;
    const qmlSource = qmlData?.patient_summary ?? qmlData;
    const cnnSource = cnnData?.patient_summary ?? cnnData;

    const qmlYearly = qmlSource?.final_patient_yearly_future_risk ?? qmlSource?.yearly_future_risk;
    const cnnYearly = cnnSource?.final_patient_yearly_future_risk ?? cnnSource?.yearly_future_risk;
    const qmlRisk5y = qmlSource?.final_patient_5_year_risk_score ?? qmlSource?.final_5_year_risk_score ?? qmlSource?.['5_year_risk_score'] ?? 0;
    const cnnRisk5y = cnnSource?.final_patient_5_year_risk_score ?? cnnSource?.final_5_year_risk_score ?? cnnSource?.['5_year_risk_score'] ?? 0;

    const isBoth = currentModel === 'Both';
    const cnnHorizons = useMemo(() => horizonsFromYearly(cnnYearly), [cnnYearly]);
    const qmlHorizons = useMemo(() => horizonsFromYearly(qmlYearly), [qmlYearly]);
    const activeHorizons = currentModel === 'Quantum' ? qmlHorizons : cnnHorizons;
    const activeRisk = currentModel === 'Quantum' ? qmlRisk5y : cnnRisk5y;

    const cnnImageResults = cnnData?.image_level_results ?? [];
    const qmlImageResults = qmlData?.image_level_results ?? [];
    const examHistory = useMemo(
        () => buildExamHistory(uploadedFiles, currentModel === 'Quantum' ? qmlImageResults : cnnImageResults),
        [uploadedFiles, currentModel, cnnData, qmlData],
    );
    const qmlExamHistory = useMemo(() => buildExamHistory(uploadedFiles, qmlImageResults), [uploadedFiles, qmlData]);

    const riskDiff = Math.abs(cnnRisk5y - qmlRisk5y);
    const verdictText = riskDiff < 2 ? 'Models agree' : riskDiff < 5 ? 'Models partially agree' : 'Models disagree';
    const verdictColor = riskDiff < 2 ? LOW : riskDiff < 5 ? MID : HIGH;

    useEffect(() => {
        setMounted(false);
        const id = setTimeout(() => setMounted(true), 50);
        return () => clearTimeout(id);
    }, [currentModel]);

    if (!qmlData && !cnnData) {
        return (
            <Box sx={{ mt: 8, textAlign: 'center' }}>
                <Typography sx={{ ...MONO, color: t.muted, fontSize: 13, fontWeight: 600 }}>
                    No results available.
                </Typography>
            </Box>
        );
    }

    const yearlyMax = Math.max(
        1,
        ...(isBoth ? [...cnnHorizons, ...qmlHorizons] : activeHorizons).map((d) => d.risk),
    );
    const axisMax = Math.ceil((yearlyMax * 1.15) / 5) * 5;

    const series = isBoth
        ? [
            { color: CNN_C, points: cnnHorizons },
            { color: QML_C, points: qmlHorizons },
        ]
        : [{ color: getRiskColor(activeRisk), points: activeHorizons }];

    const span = examHistory.length
        ? `${Math.max(1, examHistory[0].year - examHistory[examHistory.length - 1].year)} years · ${examHistory.length} exams`
        : '—';

    /* first year the two models pull apart by >5 points */
    const divergeIdx = cnnHorizons.findIndex((d, i) => Math.abs(d.risk - (qmlHorizons[i]?.risk ?? d.risk)) > 5);

    return (
        <Box sx={{
            width: '100%', my: 2,
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'none' : 'translateY(12px)',
            transition: 'opacity 0.45s ease, transform 0.45s ease',
        }}>
            <Box sx={{
                height, maxHeight: '86vh', display: 'flex', flexDirection: 'column',
                borderRadius: 3.5, overflow: 'hidden',
                background: t.shell, border: `1px solid ${t.line}`,
            }}>
                {/* ── top bar ── */}
                <Box sx={{
                    flex: 'none', minHeight: 58, px: 2.75, py: 1,
                    display: 'flex', alignItems: 'center', gap: 2.75, flexWrap: 'wrap',
                    background: t.panel, borderBottom: `1px solid ${t.line}`,
                }}>
                    <Typography sx={{ fontSize: 16, fontWeight: 700, color: t.text, whiteSpace: 'nowrap' }}>
                        Sequential Future Risk
                    </Typography>
                    <Label sx={{ color: t.muted, whiteSpace: 'nowrap' }}>
                        {isBoth ? 'Both models' : `${currentModel} model`}
                        {examHistory.length ? ` · ${examHistory.length} exams · ${examHistory[examHistory.length - 1].year}—${examHistory[0].year}` : ''}
                    </Label>
                    {isBoth && (
                        <Typography sx={{ ...MONO, fontSize: 12, color: verdictColor, whiteSpace: 'nowrap' }}>
                            {verdictText}
                        </Typography>
                    )}

                    {onModelSelect && (
                        <Box sx={{
                            ml: 'auto', flexShrink: 0, display: 'flex', gap: 0.4, p: 0.4,
                            background: t.card, border: `1px solid ${t.line}`, borderRadius: 2.25,
                        }}>
                            {MODELS.map(({ id, label }) => {
                                const sel = currentModel === id;
                                return (
                                    <Box key={id} onClick={() => onModelSelect(id)} sx={{
                                        px: 1.9, py: 0.9, borderRadius: 1.5, cursor: 'pointer',
                                        background: sel ? '#144063' : 'transparent',
                                        transition: 'background 0.15s ease',
                                        '&:hover': { background: sel ? '#144063' : 'rgba(92,200,245,0.08)' },
                                    }}>
                                        <Typography sx={{
                                            fontSize: 13, lineHeight: 1, whiteSpace: 'nowrap',
                                            fontWeight: sel ? 600 : 400, color: sel ? t.text : t.dim,
                                        }}>{label}</Typography>
                                    </Box>
                                );
                            })}
                        </Box>
                    )}
                </Box>

                {/* ── body ── */}
                <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>

                    {/* exam rail */}
                    <Box sx={{
                        width: 172, flex: 'none', p: '16px 14px', borderRight: `1px solid ${t.line}`,
                        display: 'flex', flexDirection: 'column', gap: 1.5, overflowY: 'auto',
                    }}>
                        <Label sx={{ color: t.muted }}>Exam history</Label>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {examHistory.map((e, i) => {
                                const q = qmlExamHistory.find((x) => x.filename === e.filename);
                                return (
                                    <Box key={e.filename} sx={{
                                        p: '11px 12px', borderRadius: 2.25,
                                        display: 'flex', flexDirection: 'column', gap: 0.75,
                                        background: e.isCurrent ? t.selBg : t.card,
                                        border: `1px solid ${e.isCurrent ? t.selLine : t.line}`,
                                    }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1 }}>
                                            <Typography sx={{ ...MONO, fontSize: 14, color: e.isCurrent ? t.text : t.body }}>
                                                {e.year}
                                            </Typography>
                                            <Label sx={{ color: e.isCurrent ? CNN_C : t.muted }}>
                                                {e.isCurrent ? 'Current' : 'Prior'}
                                            </Label>
                                        </Box>

                                        {isBoth ? (
                                            [{ tag: 'C', v: e.weight, c: CNN_C }, { tag: 'Q', v: q?.weight ?? e.weight, c: QML_C }].map(({ tag, v, c }) => (
                                                <Box key={tag} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                                    <Typography sx={{ ...MONO, fontSize: 10, color: c, width: 10 }}>{tag}</Typography>
                                                    <Bar value={v} color={c} track={t.track} delay={i * 90} height={3} />
                                                </Box>
                                            ))
                                        ) : (
                                            <>
                                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                    <Bar value={e.weight} color={e.isCurrent ? HIGH : t.dim} track={t.track} delay={i * 90} height={3} />
                                                </Box>
                                                <Typography sx={{ ...MONO, fontSize: 11, color: t.dim }}>
                                                    {e.weight.toFixed(0)}% weight
                                                </Typography>
                                            </>
                                        )}
                                    </Box>
                                );
                            })}
                        </Box>
                        <Box sx={{ mt: 'auto', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            <Label sx={{ color: t.muted }}>Span</Label>
                            <Typography sx={{ ...MONO, fontSize: 13, color: t.body }}>{span}</Typography>
                        </Box>
                    </Box>

                    {/* chart */}
                    <Box sx={{ flex: 1, minWidth: 0, p: 2.25, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                            <Label sx={{ color: CNN_C, letterSpacing: '0.12em', fontSize: 11 }}>
                                {isBoth ? 'Risk over time · both models' : 'Cumulative risk over time'}
                            </Label>
                            {isBoth ? (
                                <Box sx={{ display: 'flex', gap: 2 }}>
                                    {[{ l: 'Classical', c: CNN_C }, { l: 'Quantum', c: QML_C }].map(({ l, c }) => (
                                        <Box key={l} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                            <Box sx={{ width: 14, height: 3, borderRadius: 99, background: c }} />
                                            <Label sx={{ color: t.muted }}>{l}</Label>
                                        </Box>
                                    ))}
                                </Box>
                            ) : (
                                <Typography sx={{ ...MONO, fontSize: 11, color: t.dim }}>
                                    5-year {activeRisk.toFixed(2)}%
                                </Typography>
                            )}
                        </Box>

                        {activeHorizons.length > 0 || isBoth ? (
                            <RiskCurve series={series} yMax={axisMax} tokens={t} mounted={mounted} />
                        ) : (
                            <Box sx={{
                                flex: 1, borderRadius: 2.5, background: t.card, border: `1px solid ${t.line}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Typography sx={{ ...MONO, fontSize: 13, color: t.muted }}>No horizon data available</Typography>
                            </Box>
                        )}

                        <Box sx={{
                            flex: 'none', display: 'flex', alignItems: 'center', gap: 2,
                            px: 2, py: 1.5, borderRadius: 2.5,
                            background: t.card, border: `1px solid ${t.line}`,
                        }}>
                            <Label sx={{ color: t.muted }}>Horizon · {activeHorizons.length || 5} years</Label>
                            <Typography sx={{ ...MONO, ml: 'auto', fontSize: 11, color: t.muted }}>
                                {isBoth
                                    ? (divergeIdx >= 0 ? `Divergence begins year ${cnnHorizons[divergeIdx].year}` : 'Models track together')
                                    : 'Research prototype · Not for clinical use'}
                            </Typography>
                            <Button size="small" onClick={() => reset()} sx={{
                                ...MONO, fontSize: 11, letterSpacing: '0.1em', color: t.dim, minWidth: 0,
                                px: 1.5, borderRadius: 1.5, border: `1px solid ${t.line}`,
                                '&:hover': { color: t.text, borderColor: t.selLine, background: 'transparent' },
                            }}>RESET</Button>
                        </Box>
                    </Box>

                    {/* breakdown */}
                    <Box sx={{
                        width: 352, flex: 'none', p: 2.25, borderLeft: `1px solid ${t.line}`,
                        background: t.panel, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto',
                    }}>
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                            {(isBoth
                                ? [
                                    { k: 'Classical', v: `${cnnRisk5y.toFixed(2)}%`, c: getRiskColor(cnnRisk5y) },
                                    { k: 'Quantum', v: `${qmlRisk5y.toFixed(2)}%`, c: getRiskColor(qmlRisk5y) },
                                ]
                                : [
                                    { k: '5-year risk', v: `${activeRisk.toFixed(2)}%`, c: getRiskColor(activeRisk) },
                                    { k: 'Band', v: riskBand(activeRisk), c: t.text },
                                ]
                            ).map(({ k, v, c }) => (
                                <Box key={k} sx={{ display: 'flex', flexDirection: 'column', gap: 0.4 }}>
                                    <Label sx={{ color: t.muted }}>{k}</Label>
                                    <Typography sx={{ ...MONO, fontSize: 18, color: c }}>{v}</Typography>
                                </Box>
                            ))}
                        </Box>

                        <Box sx={{ height: '1px', background: t.line }} />

                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.75 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Label sx={{ color: t.muted }}>Risk by year</Label>

                            </Box>

                            {(isBoth ? cnnHorizons : activeHorizons).map((d, i) => {
                                const qv = qmlHorizons[i]?.risk ?? 0;
                                const delta = d.risk - qv;
                                return (
                                    <Box key={d.year} sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                            <Typography sx={{ fontSize: 13, color: t.body }}>Year {d.year}</Typography>
                                            <Typography sx={{
                                                ...MONO, fontSize: 12,
                                                color: isBoth ? (delta >= 0 ? CNN_C : QML_C) : getRiskColor(d.risk),
                                            }}>
                                                {isBoth
                                                    ? `${delta >= 0 ? 'C +' : 'Q +'}${Math.abs(delta).toFixed(1)}`
                                                    : `${d.risk.toFixed(2)}%`}
                                            </Typography>
                                        </Box>

                                        {isBoth ? (
                                            [{ tag: 'C', v: d.risk, c: CNN_C }, { tag: 'Q', v: qv, c: QML_C }].map(({ tag, v, c }) => (
                                                <Box key={tag} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <Typography sx={{ ...MONO, fontSize: 10, color: c, width: 16 }}>{tag}</Typography>
                                                    <Bar value={v} max={axisMax} color={c} track={t.track} delay={i * 110} />
                                                    <Typography sx={{ ...MONO, fontSize: 11, color: c, width: 44, textAlign: 'right' }}>
                                                        {v.toFixed(2)}
                                                    </Typography>
                                                </Box>
                                            ))
                                        ) : (
                                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                <Bar value={d.risk} max={axisMax} color={getRiskColor(d.risk)} track={t.track} delay={i * 110} />
                                            </Box>
                                        )}
                                    </Box>
                                );
                            })}
                        </Box>

                        <Box sx={{ height: '1px', background: t.line }} />

                        {isBoth ? (
                            <Box>
                            </Box>
                        ) : (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                                <Label sx={{ color: t.muted }}>Exam contribution</Label>
                                {examHistory.map((e) => (
                                    <Box key={e.filename} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                                        <Typography sx={{ ...MONO, fontSize: 13, color: t.dim }}>
                                            {e.year} · {e.isCurrent ? 'current' : 'prior'}
                                        </Typography>
                                        <Typography sx={{ fontSize: 13, color: e.isCurrent ? HIGH : t.body }}>
                                            {e.weight.toFixed(0)}%
                                        </Typography>
                                    </Box>
                                ))}
                            </Box>
                        )}

                        <Label sx={{ mt: 'auto', color: t.footer, letterSpacing: '0.1em' }}>
                            {isBoth
                                ? 'Research prototype · Not for clinical use'
                                : examHistory.length ? `Most weight on ${examHistory[0].year} exam` : 'Research prototype'}
                        </Label>
                    </Box>
                </Box>
            </Box>
        </Box>
    );
}
