import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet, pdf } from '@react-pdf/renderer';

const DISCLAIMER = 'Research prototype · Not for clinical use';
// Matches the live app's classification palette (ClassificationResults.jsx getColor)
const RESULT_COLOR = { Malignant: '#FF6A4D', Benign: '#E3A63C', Normal: '#2FBFA8' };
const BRAND_DARK = '#0D1B2E';
const BRAND_CYAN = '#0891B2';        // readable on a white page
const BRAND_CYAN_BRIGHT = '#22D3EE'; // matches the on-screen "Analysis" accent

const pct = (v) => (v == null ? null : Math.round((v <= 1 ? v * 100 : v) * 10) / 10);

const styles = StyleSheet.create({
    page: { fontFamily: 'Helvetica', fontSize: 9.5, color: '#1e1e1e' },
    headerBand: { backgroundColor: BRAND_DARK, paddingTop: 26, paddingBottom: 18, paddingHorizontal: 32 },
    badge: {
        alignSelf: 'flex-start', fontSize: 7, color: '#FCA5A5', letterSpacing: 0.6,
        borderWidth: 1, borderColor: '#EF444488', borderRadius: 99,
        paddingHorizontal: 8, paddingVertical: 3, marginBottom: 10,
    },
    brandRow: { flexDirection: 'row', alignItems: 'baseline' },
    brandTitle: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#F0F9FF' },
    brandAccent: { fontSize: 20, fontFamily: 'Helvetica-BoldOblique', color: BRAND_CYAN_BRIGHT },
    meta: { fontSize: 9, color: '#8BAFC4', marginTop: 8 },
    body: { padding: 32, paddingTop: 22 },
    sectionTitle: {
        fontSize: 12.5, fontFamily: 'Helvetica-Bold', color: BRAND_DARK,
        marginBottom: 8, marginTop: 4, paddingBottom: 4,
        borderBottomWidth: 1.5, borderBottomColor: BRAND_CYAN,
    },
    subTitle: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: BRAND_CYAN, marginTop: 10, marginBottom: 5 },
    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    label: { color: '#707070' },
    value: { color: '#1e1e1e' },
    tableHeaderRow: {
        flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e2e2e2',
        paddingBottom: 3, marginBottom: 3,
    },
    tableHeaderCell: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#8a8a8a' },
    tableRow: { flexDirection: 'row', paddingVertical: 2.5 },
    tableCell: { fontSize: 9.5 },
    imageGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, gap: 10 },
    imageCell: { width: '47%' },
    image: { width: '100%', height: 92, objectFit: 'contain', backgroundColor: '#000' },
    imageLabel: { fontSize: 8, color: '#707070', marginTop: 4 },
    feedbackBox: { marginTop: 5, padding: 9, backgroundColor: '#f5f5f5', borderRadius: 3 },
    feedbackText: { fontSize: 9, color: '#3c3c3c', lineHeight: 1.5 },
    explanationText: { fontSize: 9.5, color: '#1e1e1e', lineHeight: 1.6 },
    explanationEmpty: { fontSize: 9.5, color: '#8a8a8a' },
    explanationDisclaimer: { fontSize: 7.5, color: '#999999', marginTop: 10, lineHeight: 1.4 },
    footer: {
        position: 'absolute', bottom: 18, left: 32, right: 32,
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    },
    footerText: { fontSize: 7.5, color: '#999999' },
});

function Header({ sessionId, copyType }) {
    return (
        <View style={styles.headerBand}>
            <Text style={styles.badge}>RESEARCH PROTOTYPE · NOT FOR CLINICAL USE</Text>
            <View style={styles.brandRow}>
                <Text style={styles.brandTitle}>Mammo</Text>
                <Text style={styles.brandAccent}>Analysis</Text>
            </View>
            <Text style={styles.meta}>
                Session {sessionId} · {copyType === 'patient' ? 'Patient copy' : 'Clinician copy'} · Generated {new Date().toLocaleString()}
            </Text>
        </View>
    );
}

function Footer({ sessionId }) {
    return (
        <View style={styles.footer} fixed>
            <Text style={styles.footerText}>{sessionId}</Text>
            <Text style={styles.footerText}>{DISCLAIMER}</Text>
            <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
    );
}

function KV({ label, value }) {
    return (
        <View style={styles.row}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.value}>{String(value ?? '—')}</Text>
        </View>
    );
}

// Clinician: full per-model breakdown (confidence + malignant %).
function ViewTable({ title, viewsObj }) {
    const rows = ['L-CC', 'L-MLO', 'R-CC', 'R-MLO']
        .map((v) => ({ v, info: viewsObj?.[v] }))
        .filter((r) => r.info);
    if (!rows.length) return null;

    return (
        <View>
            <Text style={styles.subTitle}>{title}</Text>
            <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderCell, { width: '20%' }]}>VIEW</Text>
                <Text style={[styles.tableHeaderCell, { width: '25%' }]}>RESULT</Text>
                <Text style={[styles.tableHeaderCell, { width: '25%' }]}>CONFIDENCE</Text>
                <Text style={[styles.tableHeaderCell, { width: '30%' }]}>MALIGNANT %</Text>
            </View>
            {rows.map(({ v, info }) => {
                const conf = pct(info.score);
                const mal = pct(info.class_probabilities?.Malignant);
                return (
                    <View style={styles.tableRow} key={v}>
                        <Text style={[styles.tableCell, { width: '20%' }]}>{v}</Text>
                        <Text style={[styles.tableCell, { width: '25%', color: RESULT_COLOR[info.result] || '#1e1e1e' }]}>
                            {info.result ?? '—'}
                        </Text>
                        <Text style={[styles.tableCell, { width: '25%' }]}>{conf != null ? `${conf}%` : '—'}</Text>
                        <Text style={[styles.tableCell, { width: '30%' }]}>{mal != null ? `${mal}%` : '—'}</Text>
                    </View>
                );
            })}
        </View>
    );
}

// Patient: same table styling as ViewTable, but just the final verified
// result per view — no confidence numbers, no Classical/Quantum split.
function VerifiedResultTable({ verifications }) {
    const rows = ['L-CC', 'L-MLO', 'R-CC', 'R-MLO'];
    return (
        <View>
            <Text style={styles.subTitle}>Final Result</Text>
            <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderCell, { width: '30%' }]}>VIEW</Text>
                <Text style={[styles.tableHeaderCell, { width: '70%' }]}>RESULT</Text>
            </View>
            {rows.map((v) => {
                const res = verifications?.[v]?.clinicianResult;
                return (
                    <View style={styles.tableRow} key={v}>
                        <Text style={[styles.tableCell, { width: '30%' }]}>{v}</Text>
                        <Text style={[styles.tableCell, { width: '70%', color: RESULT_COLOR[res] || '#1e1e1e' }]}>
                            {res ?? '—'}
                        </Text>
                    </View>
                );
            })}
        </View>
    );
}

function RiskBlock({ title, data, hideScore }) {
    if (!data) return null;
    const score = data.future_risk_score ?? data.composite_risk_score ?? null;
    const malignant = /malignant/i.test(data.status ?? '')
        || (typeof data.risk_level === 'string' && /not\s*applicable/i.test(data.risk_level));

    return (
        <View style={{ marginBottom: 8 }}>
            <Text style={styles.subTitle}>{title}</Text>
            {!hideScore && <KV label="Composite risk score" value={malignant ? 'Not applicable' : (score != null ? score.toFixed(1) : '—')} />}
            <KV label="Risk level" value={data.risk_level ?? '—'} />
            <KV label="Highest density" value={data.highest_density_risk_score ?? data.highest_density ?? '—'} />
            <KV label="Highest BI-RADS" value={data.highest_birads_risk_score ?? data.highest_birads ?? '—'} />
            {!hideScore && data.feedback && (
                <View style={styles.feedbackBox}>
                    <Text style={styles.feedbackText}>{data.feedback}</Text>
                </View>
            )}
        </View>
    );
}

// Clinician-only appendix — the AI-vs-clinician audit trail. Views still
// pending are omitted (the download is already gated on all 4 being done).
function AuditTrail({ verifications }) {
    const VIEWS = ['L-CC', 'L-MLO', 'R-CC', 'R-MLO'];
    const rows = VIEWS.map((v) => ({ v, ver: verifications?.[v] })).filter((r) => r.ver && r.ver.status !== 'pending');
    if (!rows.length) return null;

    return (
        <View>
            <Text style={styles.subTitle}>Clinician Review</Text>
            <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderCell, { width: '15%' }]}>VIEW</Text>
                <Text style={[styles.tableHeaderCell, { width: '20%' }]}>STATUS</Text>
                <Text style={[styles.tableHeaderCell, { width: '25%' }]}>VERIFIED RESULT</Text>
                <Text style={[styles.tableHeaderCell, { width: '40%' }]}>NOTE</Text>
            </View>
            {rows.map(({ v, ver }) => (
                <View style={styles.tableRow} key={v}>
                    <Text style={[styles.tableCell, { width: '15%' }]}>{v}</Text>
                    <Text style={[styles.tableCell, { width: '20%' }]}>{ver.status === 'edited' ? 'Overridden' : 'Confirmed'}</Text>
                    <Text style={[styles.tableCell, { width: '25%', color: RESULT_COLOR[ver.clinicianResult] || '#1e1e1e' }]}>
                        {ver.clinicianResult ?? '—'}
                    </Text>
                    <Text style={[styles.tableCell, { width: '40%' }]}>{ver.note || '—'}</Text>
                </View>
            ))}
        </View>
    );
}

function ImageGrid({ cnnViews }) {
    const order = ['L-CC', 'R-CC', 'L-MLO', 'R-MLO'];
    const imgs = order
        .map((v) => ({ v, b64: cnnViews?.[v]?.gradcam?.base_image_base64 }))
        .filter((i) => i.b64);
    if (!imgs.length) return null;

    return (
        <View>
            <Text style={styles.subTitle}>Mammogram views</Text>
            <View style={styles.imageGrid}>
                {imgs.map(({ v, b64 }) => (
                    <View style={styles.imageCell} key={v}>
                        <Image style={styles.image} src={`data:image/png;base64,${b64}`} />
                        <Text style={styles.imageLabel}>{v}</Text>
                    </View>
                ))}
            </View>
        </View>
    );
}

function ExplanationSection({ summary }) {
    return (
        <View>
            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>AI Explanation</Text>
            {summary?.explanation ? (
                <>
                    <Text style={styles.explanationText}>{summary.explanation}</Text>
                    {summary.disclaimer && (
                        <Text style={styles.explanationDisclaimer}>{summary.disclaimer}</Text>
                    )}
                </>
            ) : (
                <Text style={styles.explanationEmpty}>No AI explanation was generated for this session.</Text>
            )}
        </View>
    );
}

function ClassificationDoc({ sessionId, currentModel, result, summary, copyType, verifications }) {
    const cnn = result?.resultFile?.cnn;
    const qml = result?.resultFile?.qml;
    const crCnn = result?.resultFile?.CRcnn;
    const crQml = result?.resultFile?.CRqml;
    const isPatient = copyType === 'patient';

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <Header sessionId={sessionId} copyType={copyType} />

                <View style={styles.body}>
                    <Text style={styles.sectionTitle}>Classification Results</Text>
                    {isPatient ? (
                        <VerifiedResultTable verifications={verifications} />
                    ) : (
                        <>
                            <KV label="Model in view" value={currentModel} />
                            {cnn?.views && <ViewTable title="Classical (CNN)" viewsObj={cnn.views} />}
                            {qml?.views && <ViewTable title="Quantum (QML)" viewsObj={qml.views} />}
                            <AuditTrail verifications={verifications} />
                        </>
                    )}

                    <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Risk Assessment</Text>
                    {isPatient ? (
                        <RiskBlock title="Risk Assessment" data={crCnn} hideScore />
                    ) : (
                        <>
                            <RiskBlock title="Classical (CNN)" data={crCnn} />
                            <RiskBlock title="Quantum (QML)" data={crQml} />
                        </>
                    )}

                    <ImageGrid cnnViews={cnn?.views} />

                    <ExplanationSection summary={summary} />

                    {isPatient && (
                        <Text style={styles.explanationDisclaimer}>
                            These results have been reviewed and confirmed by a clinician. Please discuss them with your healthcare provider.
                        </Text>
                    )}
                </View>

                <Footer sessionId={sessionId} />
            </Page>
        </Document>
    );
}

function FutureRiskDoc({ sessionId, patientAge, sessions, result, summary }) {
    const cnnRaw = result?.resultFile?.cnn;
    const qmlRaw = result?.resultFile?.qml;
    const cnn = cnnRaw?.patient_summary ?? cnnRaw;
    const qml = qmlRaw?.patient_summary ?? qmlRaw;
    const numExams = (sessions ?? []).filter((s) => s.scanDate).length;

    const YearlyBlock = ({ label, data }) => {
        if (!data) return null;
        const five = data.final_patient_5_year_risk_score;
        const yearly = data.final_patient_yearly_future_risk;
        return (
            <View style={{ marginBottom: 10 }}>
                <Text style={styles.subTitle}>{label}</Text>
                <KV label="5-year cumulative risk" value={five != null ? `${five.toFixed(1)}%` : '—'} />
                {yearly && (
                    <View style={{ marginTop: 4 }}>
                        <View style={styles.tableHeaderRow}>
                            <Text style={[styles.tableHeaderCell, { width: '50%' }]}>YEAR</Text>
                            <Text style={[styles.tableHeaderCell, { width: '50%' }]}>RISK</Text>
                        </View>
                        {Object.entries(yearly).map(([k, v]) => (
                            <View style={styles.tableRow} key={k}>
                                <Text style={[styles.tableCell, { width: '50%' }]}>{k.replace('_year', '')}</Text>
                                <Text style={[styles.tableCell, { width: '50%' }]}>{Number(v).toFixed(1)}%</Text>
                            </View>
                        ))}
                    </View>
                )}
            </View>
        );
    };

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <Header sessionId={sessionId} />

                <View style={styles.body}>
                    <Text style={styles.sectionTitle}>Sequential Future Risk</Text>
                    <KV label="Patient age" value={patientAge || '—'} />
                    <KV label="Exams analysed" value={numExams} />

                    <YearlyBlock label="Classical (CNN)" data={cnn} />
                    <YearlyBlock label="Quantum (QML)" data={qml} />

                    <ExplanationSection summary={summary} />
                </View>

                <Footer sessionId={sessionId} />
            </Page>
        </Document>
    );
}

export default async function exportSession({ sessionId, analysisMode, currentModel, result, summary, patientAge, sessions, verifications, copyType }) {
    const doc = analysisMode === 'future-risk'
        ? <FutureRiskDoc sessionId={sessionId} patientAge={patientAge} sessions={sessions} result={result} summary={summary} />
        : <ClassificationDoc sessionId={sessionId} currentModel={currentModel} result={result} summary={summary} copyType={copyType} verifications={verifications} />;

    const blob = await pdf(doc).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MammoAnalysis-${sessionId}${copyType === 'patient' ? '-patient' : ''}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
