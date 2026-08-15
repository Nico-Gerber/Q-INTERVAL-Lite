import jsPDF from 'jspdf';

const DISCLAIMER = 'Research prototype · Not for clinical use';
const MARGIN = 14;
const PAGE_W = 210;
const PAGE_H = 297;
const MAX_Y = 275;

function addFooter(doc, sessionId, pageLabel) {
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.setFont(undefined, 'normal');
    doc.text(DISCLAIMER, PAGE_W / 2, PAGE_H - 10, { align: 'center' });
    doc.text(sessionId, MARGIN, PAGE_H - 10);
    doc.text(pageLabel, PAGE_W - MARGIN, PAGE_H - 10, { align: 'right' });
}

function ensureSpace(doc, y, needed, sessionId, pageRef) {
    if (y + needed <= MAX_Y) return y;
    addFooter(doc, sessionId, `Page ${pageRef.n}`);
    doc.addPage();
    pageRef.n += 1;
    return 20;
}

function sectionTitle(doc, text, y) {
    doc.setFontSize(13);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(text, MARGIN, y);
    doc.setDrawColor(210);
    doc.line(MARGIN, y + 2, PAGE_W - MARGIN, y + 2);
    doc.setFont(undefined, 'normal');
    return y + 10;
}

function subTitle(doc, text, y) {
    doc.setFontSize(10.5);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(60, 60, 60);
    doc.text(text, MARGIN, y);
    doc.setFont(undefined, 'normal');
    return y + 6;
}

function kv(doc, label, value, y, xLabel = MARGIN, xValue = MARGIN + 55) {
    doc.setFontSize(9.5);
    doc.setTextColor(110);
    doc.text(String(label), xLabel, y);
    doc.setTextColor(20);
    doc.text(String(value ?? '—'), xValue, y);
    return y + 5.5;
}

function tableHeader(doc, cols, y) {
    doc.setFontSize(9);
    doc.setTextColor(130);
    doc.setFont(undefined, 'bold');
    cols.forEach(({ label, x }) => doc.text(label, x, y));
    doc.setFont(undefined, 'normal');
    doc.setDrawColor(225);
    doc.line(MARGIN, y + 1.5, PAGE_W - MARGIN, y + 1.5);
    return y + 6;
}

function tableRow(doc, cells, y) {
    doc.setFontSize(9.5);
    doc.setTextColor(30);
    cells.forEach(({ text, x, color }) => {
        if (color) doc.setTextColor(...color); else doc.setTextColor(30);
        doc.text(String(text), x, y);
    });
    return y + 5.5;
}

const pct = (v) => (v == null ? null : Math.round((v <= 1 ? v * 100 : v) * 10) / 10);
const RESULT_COLOR = { Malignant: [200, 40, 40], Benign: [180, 130, 10], Normal: [30, 140, 90] };

function viewRows(doc, title, viewsObj, y, sessionId, pageRef) {
    y = ensureSpace(doc, y, 30, sessionId, pageRef);
    y = subTitle(doc, title, y);
    y = tableHeader(doc, [
        { label: 'VIEW', x: MARGIN }, { label: 'RESULT', x: MARGIN + 30 },
        { label: 'CONFIDENCE', x: MARGIN + 70 }, { label: 'MALIGNANT %', x: MARGIN + 110 },
    ], y);
    ['L-CC', 'L-MLO', 'R-CC', 'R-MLO'].forEach((v) => {
        const info = viewsObj?.[v];
        if (!info) return;
        y = ensureSpace(doc, y, 8, sessionId, pageRef);
        const conf = pct(info.score);
        const mal = pct(info.class_probabilities?.Malignant);
        y = tableRow(doc, [
            { text: v, x: MARGIN },
            { text: info.result ?? '—', x: MARGIN + 30, color: RESULT_COLOR[info.result] },
            { text: conf != null ? `${conf}%` : '—', x: MARGIN + 70 },
            { text: mal != null ? `${mal}%` : '—', x: MARGIN + 110 },
        ], y);
    });
    return y + 4;
}

function riskBlock(doc, title, data, y, sessionId, pageRef) {
    if (!data) return y;
    y = ensureSpace(doc, y, 40, sessionId, pageRef);
    y = subTitle(doc, title, y);
    const score = data.future_risk_score ?? data.composite_risk_score ?? null;
    const malignant = /malignant/i.test(data.status ?? '') || (typeof data.risk_level === 'string' && /not\s*applicable/i.test(data.risk_level));
    y = kv(doc, 'Composite risk score', malignant ? 'Not applicable' : (score != null ? score.toFixed(1) : '—'), y);
    y = kv(doc, 'Risk level', data.risk_level ?? '—', y);
    y = kv(doc, 'Highest density', data.highest_density_risk_score ?? data.highest_density ?? '—', y);
    y = kv(doc, 'Highest BI-RADS', data.highest_birads_risk_score ?? data.highest_birads ?? '—', y);
    if (data.feedback) {
        y += 2;
        doc.setFontSize(9);
        doc.setTextColor(80);
        const lines = doc.splitTextToSize(data.feedback, PAGE_W - MARGIN * 2);
        y = ensureSpace(doc, y, lines.length * 4.5, sessionId, pageRef);
        doc.text(lines, MARGIN, y);
        y += lines.length * 4.5;
    }
    return y + 4;
}

function embedImageGrid(doc, cnnViews, y, sessionId, pageRef) {
    const order = ['L-CC', 'R-CC', 'L-MLO', 'R-MLO'];
    const imgs = order
        .map((v) => ({ v, b64: cnnViews?.[v]?.gradcam?.base_image_base64 }))
        .filter((i) => i.b64);
    if (!imgs.length) return y;

    y = ensureSpace(doc, y, 90, sessionId, pageRef);
    y = subTitle(doc, 'Mammogram views', y);

    const cellW = (PAGE_W - MARGIN * 2 - 8) / 2;
    const cellH = 60;
    imgs.slice(0, 4).forEach((img, i) => {
        const col = i % 2, row = Math.floor(i / 2);
        const x = MARGIN + col * (cellW + 8);
        const rowY = y + row * (cellH + 10);
        try {
            doc.addImage(`data:image/png;base64,${img.b64}`, 'PNG', x, rowY, cellW, cellH, undefined, 'FAST');
        } catch { /* skip a malformed image rather than fail the whole export */ }
        doc.setFontSize(8.5);
        doc.setTextColor(100);
        doc.text(img.v, x, rowY + cellH + 5);
    });
    return y + Math.ceil(imgs.length / 2) * (cellH + 10) + 4;
}

function explanationSection(doc, summary, y, sessionId, pageRef) {
    y = ensureSpace(doc, y, 20, sessionId, pageRef);
    y = sectionTitle(doc, 'AI Explanation', y);
    if (!summary?.explanation) {
        doc.setFontSize(9.5);
        doc.setTextColor(120);
        doc.text('No AI explanation was generated for this session.', MARGIN, y);
        return y + 8;
    }
    doc.setFontSize(9.5);
    doc.setTextColor(30);
    const lines = doc.splitTextToSize(summary.explanation, PAGE_W - MARGIN * 2);
    lines.forEach((line) => {
        y = ensureSpace(doc, y, 5.5, sessionId, pageRef);
        doc.text(line, MARGIN, y);
        y += 5.5;
    });
    y += 4;
    if (summary.disclaimer) {
        doc.setFontSize(7.5);
        doc.setTextColor(150);
        const dLines = doc.splitTextToSize(summary.disclaimer, PAGE_W - MARGIN * 2);
        y = ensureSpace(doc, y, dLines.length * 4, sessionId, pageRef);
        doc.text(dLines, MARGIN, y);
        y += dLines.length * 4;
    }
    return y;
}

/**
 * Builds and downloads a session PDF: classification/risk results (or future-risk
 * results) plus the AI explanation, if one was generated for this session.
 */
export default function exportSession({ sessionId, analysisMode, currentModel, result, summary, patientAge, sessions }) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageRef = { n: 1 };
    let y = 20;

    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('MammoAnalysis — Session Report', MARGIN, y);
    y += 8;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(100);
    doc.text(`Session ${sessionId}  ·  Generated ${new Date().toLocaleString()}`, MARGIN, y);
    y += 10;

    if (analysisMode === 'classification') {
        const cnn = result?.resultFile?.cnn;
        const qml = result?.resultFile?.qml;
        const crCnn = result?.resultFile?.CRcnn;
        const crQml = result?.resultFile?.CRqml;

        y = sectionTitle(doc, 'Classification Results', y);
        y = kv(doc, 'Model in view', currentModel, y);
        y += 2;
        if (cnn?.views) y = viewRows(doc, 'Classical (CNN)', cnn.views, y, sessionId, pageRef);
        if (qml?.views) y = viewRows(doc, 'Quantum (QML)', qml.views, y, sessionId, pageRef);

        y = ensureSpace(doc, y, 15, sessionId, pageRef);
        y = sectionTitle(doc, 'Risk Assessment', y);
        y = riskBlock(doc, 'Classical (CNN)', crCnn, y, sessionId, pageRef);
        y = riskBlock(doc, 'Quantum (QML)', crQml, y, sessionId, pageRef);

        y = embedImageGrid(doc, cnn?.views, y, sessionId, pageRef);

    } else if (analysisMode === 'future-risk') {
        const cnnRaw = result?.resultFile?.cnn;
        const qmlRaw = result?.resultFile?.qml;
        const cnn = cnnRaw?.patient_summary ?? cnnRaw;
        const qml = qmlRaw?.patient_summary ?? qmlRaw;
        const numExams = (sessions ?? []).filter((s) => s.scanDate).length;

        y = sectionTitle(doc, 'Sequential Future Risk', y);
        y = kv(doc, 'Patient age', patientAge || '—', y);
        y = kv(doc, 'Exams analysed', numExams, y);
        y += 4;

        [{ label: 'Classical (CNN)', data: cnn }, { label: 'Quantum (QML)', data: qml }].forEach(({ label, data }) => {
            if (!data) return;
            y = ensureSpace(doc, y, 35, sessionId, pageRef);
            y = subTitle(doc, label, y);
            const five = data.final_patient_5_year_risk_score;
            y = kv(doc, '5-year cumulative risk', five != null ? `${five.toFixed(1)}%` : '—', y);
            const yearly = data.final_patient_yearly_future_risk;
            if (yearly) {
                y = tableHeader(doc, [{ label: 'YEAR', x: MARGIN }, { label: 'RISK', x: MARGIN + 40 }], y);
                Object.entries(yearly).forEach(([k, v]) => {
                    y = ensureSpace(doc, y, 6, sessionId, pageRef);
                    y = tableRow(doc, [
                        { text: k.replace('_year', ''), x: MARGIN },
                        { text: `${Number(v).toFixed(1)}%`, x: MARGIN + 40 },
                    ], y);
                });
            }
            y += 4;
        });
    }

    y = explanationSection(doc, summary, y, sessionId, pageRef);
    addFooter(doc, sessionId, `Page ${pageRef.n}`);

    doc.save(`MammoAnalysis-${sessionId}.pdf`);
}