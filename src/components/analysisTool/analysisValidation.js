// Input validation for both analysis modes. The upload components render feedback
// from these results, and handleAnalyse uses `isValid` as the final gate, so the
// rules live in one place.

export const VIEW_KEYS = ['L-CC', 'R-CC', 'L-MLO', 'R-MLO'];
export const MIN_SESSIONS = 2;
export const AGE_MIN = 18;
export const AGE_MAX = 100;
// Oldest accepted exam date — same floor the filename date detector uses.
export const MIN_EXAM_DATE = '1970-01-01';

// "A" · "A and B" · "A, B and C"
export const formatList = (items) =>
  items.length <= 2 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

const missingViewsOf = (views) => VIEW_KEYS.filter((k) => !views?.[k]);
// A view carries `error` when the backend reported that specific image as unusable.
const invalidViewsOf = (views) => VIEW_KEYS.filter((k) => views?.[k]?.error);

export function validateSessionAnalysis(views) {
  const missingViews = missingViewsOf(views);
  const invalidViews = invalidViewsOf(views);

  let summary = null;
  if (missingViews.length === 1) summary = `${missingViews[0]} is required before analysis can begin.`;
  else if (missingViews.length > 1) summary = `Complete all four mammogram views before analysing. Missing: ${formatList(missingViews)}.`;
  else if (invalidViews.length) summary = `Replace the image for ${formatList(invalidViews)} before analysing.`;

  return { isValid: !summary, missingViews, invalidViews, summary };
}

export function validateAge(patientAge) {
  if (patientAge === '' || patientAge == null) return 'Patient age is required.';
  const age = Number(patientAge);
  if (!Number.isFinite(age) || age < AGE_MIN || age > AGE_MAX) return `Patient age must be between ${AGE_MIN} and ${AGE_MAX}.`;
  return null;
}

export function validateFutureRisk(sessions, patientAge) {
  const ageError = validateAge(patientAge);
  const sessionCountError = sessions.length < MIN_SESSIONS
    ? 'At least two examination sessions are required for Sequential Future Risk Analysis.'
    : null;

  const today = new Date().toISOString().split('T')[0];
  const sessionErrors = sessions.map((s, index) => {
    const label = `Session ${index + 1}`;
    const missingViews = missingViewsOf(s.views);
    const invalidViews = invalidViewsOf(s.views);

    let dateError = null;
    if (!s.scanDate) {
      dateError = `${label} requires an examination date.`;
    } else if (s.scanDate < MIN_EXAM_DATE || s.scanDate > today) {
      dateError = `${label} has an invalid examination date. Choose a date between 1970 and today.`;
    } else {
      const firstWithDate = sessions.findIndex((o) => o.scanDate === s.scanDate);
      if (firstWithDate < index) dateError = `${label} has the same date as Session ${firstWithDate + 1}. Each session needs a different examination date.`;
    }

    let viewsError = null;
    if (missingViews.length) viewsError = `${label} is incomplete. Missing ${missingViews.length === 1 ? 'view' : 'views'}: ${formatList(missingViews)}.`;
    else if (invalidViews.length) viewsError = `${label}: replace the image for ${formatList(invalidViews)}.`;

    return { index, label, dateError, viewsError, missingViews, invalidViews, isValid: !dateError && !viewsError };
  });

  const invalidSessions = sessionErrors.filter((e) => !e.isValid);

  return {
    isValid: !ageError && !sessionCountError && invalidSessions.length === 0,
    ageError,
    sessionCountError,
    sessionErrors,
    invalidSessions,
  };
}
