import React, { useEffect, useState } from 'react';
import { Box, Typography, Paper, Button, Container } from '@mui/material';
import { ResetTvSharp } from '@mui/icons-material';

function AnimatedBar({ value, color, delay = 0 }) {
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const t = setTimeout(() => setWidth(value), 100 + delay);
        return () => clearTimeout(t);
    }, [value, delay]);
    return (
        <Box sx={{ height: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden', mt: 1 }}>
            <Box sx={{
                width: `${width}%`,
                height: '100%',
                backgroundColor: color,
                borderRadius: 99,
                transition: 'width 1.2s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: color !== 'rgba(255,255,255,0.25)' ? `0 0 12px ${color}88` : 'none',
            }} />
        </Box>
    );
}

export default function ClassificationResults({ analyisedImage, reset, currentModel, results }) {
    const [mounted, setMounted] = useState(false);

    const cnnResult = results?.resultFile?.cnn

    const qmlResult = results?.resultFile?.qml

    const activeResult = currentModel === 'Quantum' ? qmlResult : cnnResult

    useEffect(() => {
        setMounted(false)
        if (!activeResult) return
        const t = setTimeout(() => setMounted(true), 50)
        return () => clearTimeout(t)
    }, [activeResult])

    if (!activeResult) return null


    const MalignantColor = 'rgba(255, 77, 77, 1)'
    const BenignColor = 'rgba(229, 255, 0, 1)'
    const NormalColor = 'rgba(34, 252, 27, 1)'

    const resultColor = activeResult?.result === 'Malignant'
        ? 'rgba(255, 77, 77, 0.6)'
        : activeResult?.result === 'Benign'
            ? 'rgba(229, 255, 0, 0.6)'
            : 'rgba(34, 252, 27, 0.6)'

    const verdictColor = qmlResult.result === cnnResult.result ?
        ('rgba(34, 252, 27, 0.6)') : ('rgba(255, 77, 77, 0.6)')


    const classifications = [
        { label: 'Malignant', value: (activeResult.class_probabilities.Malignant * 100).toFixed(2), color: MalignantColor },
        { label: 'Benign', value: (activeResult.class_probabilities.Benign * 100).toFixed(2), color: BenignColor },
        { label: 'Normal', value: (activeResult.class_probabilities.Normal * 100).toFixed(2), color: NormalColor },
    ];

    const comparisonClassifications = [
        { label: 'Malignant', cnnValue: (cnnResult.class_probabilities.Malignant * 100).toFixed(2), qmlValue: (qmlResult.class_probabilities.Malignant * 100).toFixed(2), color: MalignantColor },
        { label: 'Benign', cnnValue: (cnnResult.class_probabilities.Benign * 100).toFixed(2), qmlValue: (qmlResult.class_probabilities.Benign * 100).toFixed(2), color: BenignColor },
        { label: 'Normal', cnnValue: (cnnResult.class_probabilities.Normal * 100).toFixed(2), qmlValue: (qmlResult.class_probabilities.Normal * 100).toFixed(2), color: NormalColor },
    ]

    return (
        <>
            {currentModel === 'Both' ? (
                <Box sx={{
                    fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
                    width: '100%',
                    maxWidth: 1100,
                    mx: 'auto',
                    py: 4,
                    opacity: mounted ? 1 : 0,
                    transform: mounted ? 'none' : 'translateY(16px)',
                    transition: 'opacity 0.6s ease, transform 0.6s ease',
                }}>
                    <Box>

                        {/* Header label */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                            <Box sx={{
                                width: 8, height: 8, borderRadius: '50%',
                                backgroundColor: '#FF4D4D',
                                boxShadow: '0 0 8px #FF4D4Dcc',
                                animation: 'pulse 2s ease-in-out infinite',
                                '@keyframes pulse': {
                                    '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                                    '50%': { opacity: 0.5, transform: 'scale(1.4)' },
                                }
                            }} />
                            <Typography sx={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 500 }}>
                                Analysis Complete
                            </Typography>
                        </Box>

                        {/* Stat cards row */}
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, mb: 3 }}>


                            {/* Classical AI */}
                            <Box sx={{
                                p: 3,
                                borderRadius: 3,
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                textAlign: 'center',
                            }}>
                                <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, mb: 0.8 }}>
                                    Classical AI
                                </Typography>
                                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                                    <Typography sx={{ color: 'white', fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>
                                        {(activeResult.score * 100).toFixed(2)}
                                    </Typography>
                                    <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 16, fontWeight: 400 }}>%</Typography>
                                </Box>
                            </Box>

                            {/* Models Agree? */}
                            <Box sx={{
                                p: 3,
                                borderRadius: 3,
                                background: `linear-gradient(135deg,  ${verdictColor} , rgba(255,77,77,0.06) 100%)`,
                                border: `1px solid ${verdictColor}`,
                                position: 'relative',
                                overflow: 'hidden',
                                '&::before': {
                                    content: '""',
                                    position: 'absolute',
                                    top: 0, left: 0, right: 0,
                                    height: 2,
                                    background: `linear-gradient(90deg, ${verdictColor}, transparent)`,
                                    borderRadius: '3px 3px 0 0',
                                }
                            }}>
                                <Typography sx={{ color: verdictColor, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, mb: 0.8 }}>
                                    Verdict
                                </Typography>
                                <Typography sx={{ color: verdictColor, fontSize: 28, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1 }}>
                                    {qmlResult.result === cnnResult.result ? ('Models Agree') : ('Models Disagree')}
                                </Typography>
                            </Box>

                            {/* Quantum AI */}
                            <Box sx={{
                                p: 3,
                                borderRadius: 3,
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                textAlign: 'center',
                            }}>
                                <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, mb: 0.8 }}>
                                    Quantum AI
                                </Typography>
                                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                                    <Typography sx={{ color: 'white', fontSize: 28, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1 }}>
                                        {(qmlResult.score * 100).toFixed(2)}
                                    </Typography>
                                    <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 16, fontWeight: 400 }}>%</Typography>
                                </Box>
                            </Box>
                        </Box>

                        {/* Main content row */}
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>

                            {/* Image panel */}
                            <Box sx={{
                                borderRadius: 1,
                                overflow: 'hidden',
                                border: '1px solid rgba(255,255,255,0.07)',
                                position: 'relative',
                                background: '#000',
                                minHeight: 360,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}>
                                <Box
                                    component="img"
                                    src={analyisedImage}
                                    alt="Analysed mammogram"
                                    sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                                />
                                {/* Corner bracket decorations */}
                                {[
                                    { top: 10, left: 10, borderTop: '2px solid rgba(255,77,77,0.5)', borderLeft: '2px solid rgba(255,77,77,0.5)' },
                                    { top: 10, right: 10, borderTop: '2px solid rgba(255,77,77,0.5)', borderRight: '2px solid rgba(255,77,77,0.5)' },
                                    { bottom: 10, left: 10, borderBottom: '2px solid rgba(255,77,77,0.5)', borderLeft: '2px solid rgba(255,77,77,0.5)' },
                                    { bottom: 10, right: 10, borderBottom: '2px solid rgba(255,77,77,0.5)', borderRight: '2px solid rgba(255,77,77,0.5)' },
                                ].map((style, i) => (
                                    <Box key={i} sx={{ position: 'absolute', width: 16, height: 16, ...style }} />
                                ))}
                            </Box>

                            {/* Classifications panel */}
                            <Box sx={{
                                borderRadius: 3,
                                border: '1px solid rgba(255,255,255,0.07)',
                                background: 'rgba(255,255,255,0.02)',
                                p: 3.5,
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                            }}>
                                <Box>
                                    <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 30, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, mb: 3 }}>
                                        All Classifications
                                    </Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                                        <Box sx={{
                                            width: 8, height: 8, borderRadius: '50%',

                                            backgroundColor: '#4dff74ff',
                                            boxShadow: '0 0 8px #4dff74ff',
                                            animation: 'pulse 2s ease-in-out infinite',
                                            '@keyframes pulse': {
                                                '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                                                '50%': { opacity: 0.5, transform: 'scale(1.4)' },
                                            }
                                        }} />
                                        <Typography sx={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 500 }}>
                                            Classical Model
                                        </Typography>
                                        <Box sx={{
                                            width: 8, height: 8, borderRadius: '50%',
                                            backgroundColor: 'rgba(202, 77, 255, 1)',
                                            boxShadow: '0 0 8px rgba(202, 77, 255, 1)',
                                            animation: 'pulse 2s ease-in-out infinite',
                                            '@keyframes pulse': {
                                                '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                                                '50%': { opacity: 0.5, transform: 'scale(1.4)' },
                                            }
                                        }} />
                                        <Typography sx={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 500 }}>
                                            Quantum Model
                                        </Typography>
                                    </Box>
                                    {comparisonClassifications.map(({ label, qmlValue, cnnValue, color }, i) => (
                                        <Box key={label} sx={{ mb: i < comparisonClassifications.length - 1 ? 3.5 : 0 }}>

                                            {/* Label row */}
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                                <Box sx={{
                                                    width: 6, height: 6, borderRadius: '50%',
                                                    backgroundColor: color, flexShrink: 0,
                                                    boxShadow: `0 0 6px ${color}`,
                                                }} />
                                                <Typography sx={{ color: 'rgba(255,255,255,0.8)', fontSize: 16, fontWeight: 500 }}>
                                                    {label}
                                                </Typography>
                                            </Box>

                                            {/* CNN row */}
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <Typography sx={{ color: '#4dff74ff', fontSize: 12 }}>Classical</Typography>
                                                <Typography sx={{ color: '#4dff74ff', fontSize: 12, fontWeight: 700 }}>{cnnValue}%</Typography>
                                            </Box>
                                            <AnimatedBar value={cnnValue} color={'#4dff74ff'} delay={i * 150} />

                                            {/* QML row */}
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.75 }}>
                                                <Typography sx={{ color: 'rgba(202, 77, 255, 1)', fontSize: 12 }}>Quantum</Typography>
                                                <Typography sx={{ color: 'rgba(202, 77, 255, 1)', fontSize: 12, fontWeight: 700 }}>{qmlValue}%</Typography>
                                            </Box>
                                            <AnimatedBar value={qmlValue} color={'rgba(202, 77, 255, 1)'} delay={i * 150 + 75} />

                                        </Box>
                                    ))}

                                    {/* Disclaimer footer */}
                                    < Box sx={{
                                        mt: 4,
                                        pt: 3,
                                        borderTop: '1px solid rgba(255,255,255,0.06)',
                                    }}>
                                        <Typography sx={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, lineHeight: 1.6 }}>
                                            This result is intended to assist qualified medical professionals. Not a substitute for clinical diagnosis.
                                        </Typography>
                                    </Box>
                                </Box>
                            </Box>

                        </Box>

                        <Container sx={{ padding: 5 }}>
                            <Button variant="contained" onClick={() => reset()}>Reset</Button>
                        </Container>

                    </Box>
                </Box>
            ) : (


                <Box sx={{
                    fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
                    width: '100%',
                    maxWidth: 1100,
                    mx: 'auto',
                    py: 4,
                    opacity: mounted ? 1 : 0,
                    transform: mounted ? 'none' : 'translateY(16px)',
                    transition: 'opacity 0.6s ease, transform 0.6s ease',
                }}>
                    <Box>

                        {/* Header label */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                            <Box sx={{
                                width: 8, height: 8, borderRadius: '50%',
                                backgroundColor: '#FF4D4D',
                                boxShadow: '0 0 8px #FF4D4Dcc',
                                animation: 'pulse 2s ease-in-out infinite',
                                '@keyframes pulse': {
                                    '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                                    '50%': { opacity: 0.5, transform: 'scale(1.4)' },
                                }
                            }} />
                            <Typography sx={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 500 }}>
                                Analysis Complete
                            </Typography>
                        </Box>

                        {/* Stat cards row */}
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 2, mb: 3 }}>
                            {/* Result card — elevated */}
                            <Box sx={{
                                p: 3,
                                borderRadius: 3,
                                background: `linear-gradient(135deg, ${resultColor} , rgba(255,77,77,0.06) 100%)`,
                                border: `1px solid ${resultColor}`,
                                position: 'relative',
                                overflow: 'hidden',
                                '&::before': {
                                    content: '""',
                                    position: 'absolute',
                                    top: 0, left: 0, right: 0,
                                    height: 2,
                                    background: `linear-gradient(90deg, ${resultColor}, transparent)`,
                                    borderRadius: '3px 3px 0 0',
                                }
                            }}>
                                <Typography sx={{ color: resultColor, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, mb: 0.8 }}>
                                    Result
                                </Typography>
                                <Typography sx={{ color: resultColor, fontSize: 28, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1 }}>
                                    {activeResult.result}
                                </Typography>
                            </Box>

                            {/* Confidence */}
                            <Box sx={{
                                p: 3,
                                borderRadius: 3,
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                textAlign: 'center',
                            }}>
                                <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, mb: 0.8 }}>
                                    Confidence
                                </Typography>
                                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                                    <Typography sx={{ color: 'white', fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>
                                        {(activeResult.score * 100).toFixed(2)}
                                    </Typography>
                                    <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 16, fontWeight: 400 }}>%</Typography>
                                </Box>
                            </Box>

                            {/* Model */}
                            <Box sx={{
                                p: 3,
                                borderRadius: 3,
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                textAlign: 'center',
                            }}>
                                <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, mb: 0.8 }}>
                                    Model
                                </Typography>
                                <Typography sx={{ color: 'white', fontSize: 28, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1 }}>
                                    {currentModel}
                                </Typography>
                            </Box>
                        </Box>

                        {/* Main content row */}
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>

                            {/* Image panel */}
                            <Box sx={{
                                borderRadius: 1,
                                overflow: 'hidden',
                                border: '1px solid rgba(255,255,255,0.07)',
                                position: 'relative',
                                background: '#000',
                                minHeight: 360,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}>
                                <Box
                                    component="img"
                                    src={analyisedImage}
                                    alt="Analysed mammogram"
                                    sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                                />
                                {/* Corner bracket decorations */}
                                {[
                                    { top: 10, left: 10, borderTop: '2px solid rgba(255,77,77,0.5)', borderLeft: '2px solid rgba(255,77,77,0.5)' },
                                    { top: 10, right: 10, borderTop: '2px solid rgba(255,77,77,0.5)', borderRight: '2px solid rgba(255,77,77,0.5)' },
                                    { bottom: 10, left: 10, borderBottom: '2px solid rgba(255,77,77,0.5)', borderLeft: '2px solid rgba(255,77,77,0.5)' },
                                    { bottom: 10, right: 10, borderBottom: '2px solid rgba(255,77,77,0.5)', borderRight: '2px solid rgba(255,77,77,0.5)' },
                                ].map((style, i) => (
                                    <Box key={i} sx={{ position: 'absolute', width: 16, height: 16, ...style }} />
                                ))}
                            </Box>

                            {/* Classifications panel */}
                            <Box sx={{
                                borderRadius: 3,
                                border: '1px solid rgba(255,255,255,0.07)',
                                background: 'rgba(255,255,255,0.02)',
                                p: 3.5,
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                            }}>
                                <Box>
                                    <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: 30, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, mb: 3 }}>
                                        All Classifications
                                    </Typography>

                                    {classifications.map(({ label, value, color }, i) => (
                                        <Box key={label} sx={{ mb: i < classifications.length - 1 ? 3.5 : 0 }}>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <Box sx={{
                                                        width: 6, height: 6, borderRadius: '50%',
                                                        backgroundColor: color,
                                                        flexShrink: 0,
                                                        boxShadow: color !== 'rgba(255,255,255,0.25)' ? `0 0 6px ${color}` : 'none',
                                                    }} />
                                                    <Typography sx={{ color: 'rgba(255,255,255,0.8)', fontSize: 20, fontWeight: 500 }}>
                                                        {label}
                                                    </Typography>
                                                </Box>
                                                <Typography sx={{ color, fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                                    {value}%
                                                </Typography>
                                            </Box>
                                            <AnimatedBar value={value} color={color} delay={i * 150} />
                                        </Box>
                                    ))}
                                </Box>

                                {/* Disclaimer footer */}
                                <Box sx={{
                                    mt: 4,
                                    pt: 3,
                                    borderTop: '1px solid rgba(255,255,255,0.06)',
                                }}>
                                    <Typography sx={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, lineHeight: 1.6 }}>
                                        This result is intended to assist qualified medical professionals. Not a substitute for clinical diagnosis.
                                    </Typography>
                                </Box>
                            </Box>
                        </Box>

                    </Box>

                    <Container sx={{ padding: 5 }}>
                        <Button variant="contained" onClick={() => reset()}>Reset</Button>
                    </Container>

                </Box>
            )}
        </>
    );
}