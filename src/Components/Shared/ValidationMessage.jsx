import React from 'react';
import { Alert, AlertTitle, Button } from '@mui/material';
import { motion } from 'framer-motion';
import { WarningAmber as WarnIcon } from '@mui/icons-material';

// Inline validation / error feedback used by the upload steps. Keeps the slot-error
// look (small Alert + warning icon, fade-in) and always carries text, so meaning
// never relies on colour alone. Errors announce assertively, warnings politely.
export default function ValidationMessage({ id, severity = 'error', title, action, onClose, dense = true, sx, children }) {
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <Alert
        id={id}
        severity={severity}
        role={severity === 'error' ? 'alert' : 'status'}
        icon={<WarnIcon sx={{ fontSize: dense ? 13 : 18 }} />}
        action={action}
        onClose={onClose}
        sx={{ py: dense ? 0.2 : 0.6, fontSize: dense ? '0.66rem' : '0.75rem', alignItems: 'center', ...sx }}
      >
        {title && <AlertTitle sx={{ fontSize: '0.8rem', fontWeight: 700, mb: 0.25 }}>{title}</AlertTitle>}
        {children}
      </Alert>
    </motion.div>
  );
}

// Failure after submission. Worded and titled differently from input validation;
// service failures offer a retry since every input is still in place.
export function AnalysisFailureMessage({ failure, onRetry, retryDisabled }) {
  const isService = failure.kind === 'service';
  return (
    <ValidationMessage
      dense={false}
      title={isService ? 'Analysis could not be completed' : 'Some inputs were not accepted'}
      action={isService ? (
        <Button color="inherit" size="small" variant="outlined" onClick={onRetry} disabled={retryDisabled} sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
          Try again
        </Button>
      ) : undefined}
    >
      {failure.message}
    </ValidationMessage>
  );
}
