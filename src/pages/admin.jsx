import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Container, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Button, Chip, Autocomplete, TextField, Select, MenuItem, FormControl, InputLabel, Dialog, DialogTitle, DialogContent,
  DialogContentText, DialogActions, Snackbar, Alert, CircularProgress, Stack,
} from '@mui/material';
import { listUsers, approveUser, rejectUser, changeUserRole, deleteUser, listAssignments, assignPatients, unassignPatient } from '../supabase/adminApi';

const ROLE_LABELS = { clinician: 'Clinician', patient: 'Patient', admin: 'Admin' };
const STATUS_LABELS = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };
const ASSIGNABLE = ['clinician', 'patient'];

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

function Section({ title, count, children }) {
  return (
    <Box sx={{ mb: 5 }}>
      <Typography variant="h6" sx={{ mb: 1.5 }}>
        {title} <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>({count})</Box>
      </Typography>
      {children}
    </Box>
  );
}

function UserTable({ users, empty, columns, renderActions }) {
  if (!users.length) {
    return <Paper sx={{ p: 3 }}><Typography color="text.secondary">{empty}</Typography></Paper>;
  }
  return (
    <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            {columns.map((c) => <TableCell key={c.key} sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{c.label}</TableCell>)}
            <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id} hover>
              {columns.map((c) => (
                <TableCell key={c.key} sx={{ verticalAlign: 'top', ...(c.sx || {}) }}>{c.render(u)}</TableCell>
              ))}
              <TableCell align="right" sx={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>{renderActions(u)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [assignTarget, setAssignTarget] = useState(null); // clinician | null
  const [assignSelection, setAssignSelection] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null); // { severity, message }
  const [approveTarget, setApproveTarget] = useState(null);
  const [approveRole, setApproveRole] = useState('');
  const [rejectTarget, setRejectTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    try {
      const [data, assigned] = await Promise.all([listUsers(), listAssignments()]);
      setUsers(data.users);
      setAssignments(assigned.assignments);
      setCurrentUserId(data.current_user_id);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pending = useMemo(() => users.filter((u) => u.status === 'pending'), [users]);
  const approved = useMemo(() => users.filter((u) => u.status === 'approved'), [users]);
  const clinicians = useMemo(() => approved.filter((u) => u.role === 'clinician'), [approved]);
  const patients = useMemo(() => approved.filter((u) => u.role === 'patient'), [approved]);
  const userById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
  const patientsOf = (clinicianId) => assignments.filter((a) => a.clinician_id === clinicianId).map((a) => userById[a.patient_id]).filter(Boolean);
  const rejected = useMemo(() => users.filter((u) => u.status === 'rejected'), [users]);

  // Runs an admin action, reports the outcome, then reloads from the server.
  const run = async (id, action, successMessage) => {
    setBusyId(id);
    try {
      await action();
      setToast({ severity: 'success', message: successMessage });
    } catch (err) {
      setToast({ severity: 'error', message: err.message });
    } finally {
      setBusyId(null);
      await load();
    }
  };

  const confirmApprove = async () => {
    const { id, full_name } = approveTarget;
    const role = approveRole;
    setApproveTarget(null);
    await run(id, () => approveUser(id, role), `${full_name || 'User'} approved as ${ROLE_LABELS[role]}.`);
  };

  const confirmReject = async () => {
    const { id, full_name } = rejectTarget;
    setRejectTarget(null);
    await run(id, () => rejectUser(id), `${full_name || 'User'} rejected.`);
  };

  const openAssign = (clinician) => { setAssignSelection([]); setAssignTarget(clinician); };

  const confirmAssign = async () => {
    const clinician = assignTarget;
    const ids = assignSelection.map((p) => p.id);
    setAssignTarget(null);
    await run(clinician.id, () => assignPatients(clinician.id, ids),
      `${ids.length} patient${ids.length === 1 ? '' : 's'} assigned to ${clinician.full_name || clinician.email}.`);
  };

  const removeAssignment = (clinician, patient) =>
    run(clinician.id, () => unassignPatient(clinician.id, patient.id),
      `${patient.full_name || patient.email} unassigned from ${clinician.full_name || clinician.email}.`);

  const confirmDelete = async () => {
    const { id, full_name, email } = deleteTarget;
    setDeleteTarget(null);
    await run(id, () => deleteUser(id), `${full_name || email || 'User'} deleted.`);
  };

  // Admins (including the caller) can't be deleted; the backend enforces this too.
  const deleteButton = (u) => (u.role === 'admin' || u.id === currentUserId ? null : (
    <Button size="small" variant="outlined" color="error" disabled={busyId === u.id} onClick={() => setDeleteTarget(u)}>Delete</Button>
  ));

  const nameCol = { key: 'name', label: 'Name', render: (u) => u.full_name || '—' };
  const emailCol = { key: 'email', label: 'Email', render: (u) => u.email || '—' };
  const dateCol = { key: 'created', label: 'Requested', render: (u) => fmtDate(u.created_at), sx: { whiteSpace: 'nowrap' } };
  const statusCol = {
    key: 'status', label: 'Status',
    render: (u) => <Chip size="small" label={STATUS_LABELS[u.status]} color={u.status === 'pending' ? 'warning' : u.status === 'rejected' ? 'error' : 'primary'} variant="outlined" />,
  };
  const reasonCol = { key: 'reason', label: 'Reason for access', render: (u) => u.access_reason || '—', sx: { minWidth: 200, maxWidth: 360, whiteSpace: 'pre-wrap', wordBreak: 'break-word' } };

  const openApprove = (u) => { setApproveRole(''); setApproveTarget(u); };

  return (
    <Box sx={{
      minHeight: '100vh', position: 'relative', overflow: 'clip',
      background: (theme) => theme.palette.background.hero,
    }}>
      <Box sx={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: (theme) =>
          `linear-gradient(${theme.palette.primary.main}${theme.palette.mode === 'dark' ? '07' : '14'} 1px, transparent 1px),
           linear-gradient(90deg, ${theme.palette.primary.main}${theme.palette.mode === 'dark' ? '07' : '14'} 1px, transparent 1px)`,
        backgroundSize: '60px 60px',
      }} />
    <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1, py: 8 }}>
      <Typography variant="h4" sx={{ mb: 0.5 }}>User Management</Typography>
      <Typography color="text.secondary" sx={{ mb: 4 }}>Review access requests and manage roles.</Typography>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
      ) : loadError ? (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => { setLoading(true); load(); }}>Retry</Button>}>
          {loadError}
        </Alert>
      ) : (
        <>
          <Section title="Pending Users" count={pending.length}>
            <UserTable
              users={pending}
              empty="No pending access requests."
              columns={[nameCol, emailCol, reasonCol, dateCol, statusCol]}
              renderActions={(u) => (
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  <Button size="small" variant="contained" disabled={busyId === u.id} onClick={() => openApprove(u)}>Approve</Button>
                  <Button size="small" variant="outlined" color="error" disabled={busyId === u.id} onClick={() => setRejectTarget(u)}>Reject</Button>
                  {deleteButton(u)}
                </Stack>
              )}
            />
          </Section>

          <Section title="Approved Users" count={approved.length}>
            <UserTable
              users={approved}
              empty="No approved users yet."
              columns={[
                nameCol, emailCol,
                { key: 'role', label: 'Role', render: (u) => ROLE_LABELS[u.role] ?? u.role },
                statusCol,
                { ...dateCol, label: 'Created' },
              ]}
              renderActions={(u) =>
                // Admins (including the caller) are not editable here, so nobody can demote themselves.
                u.role === 'admin' || u.id === currentUserId ? (
                  <Typography variant="body2" color="text.secondary">—</Typography>
                ) : (
                  <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center">
                  <Select
                    size="small" value={u.role} disabled={busyId === u.id}
                    onChange={(e) => run(u.id, () => changeUserRole(u.id, e.target.value), `${u.full_name || 'User'} is now ${ROLE_LABELS[e.target.value]}.`)}
                    inputProps={{ 'aria-label': `Role for ${u.full_name || u.email}` }}
                    sx={{ minWidth: 130 }}
                  >
                    {ASSIGNABLE.map((r) => <MenuItem key={r} value={r}>{ROLE_LABELS[r]}</MenuItem>)}
                  </Select>
                  {deleteButton(u)}
                  </Stack>
                )}
            />
          </Section>

          <Section title="Clinician Assignments" count={clinicians.length}>
            <UserTable
              users={clinicians}
              empty="No approved clinicians yet. Approve a user as a Clinician to assign patients."
              columns={[
                nameCol, emailCol,
                {
                  key: 'patients', label: 'Assigned patients',
                  sx: { minWidth: 220 },
                  render: (u) => {
                    const assigned = patientsOf(u.id);
                    return assigned.length ? (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                        {assigned.map((p) => (
                          <Chip key={p.id} size="small" label={p.full_name || p.email}
                            disabled={busyId === u.id} onDelete={() => removeAssignment(u, p)} />
                        ))}
                      </Box>
                    ) : <Typography variant="body2" color="text.secondary">No patients assigned</Typography>;
                  },
                },
              ]}
              renderActions={(u) => (
                <Button size="small" variant="outlined" disabled={busyId === u.id} onClick={() => openAssign(u)}>Assign patients</Button>
              )}
            />
          </Section>

          {rejected.length > 0 && (
            <Section title="Rejected Users" count={rejected.length}>
              <UserTable
                users={rejected}
                columns={[nameCol, emailCol, reasonCol, dateCol, statusCol]}
                renderActions={(u) => (
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Button size="small" variant="outlined" disabled={busyId === u.id} onClick={() => openApprove(u)}>Approve</Button>
                    {deleteButton(u)}
                  </Stack>
                )}
              />
            </Section>
          )}
        </>
      )}

      <Dialog open={!!assignTarget} onClose={() => setAssignTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>Assign patients</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Choose patients for {assignTarget?.full_name || assignTarget?.email}. They will only be able to access patients assigned to them.
          </DialogContentText>
          <Autocomplete
            multiple
            options={patients.filter((p) => !patientsOf(assignTarget?.id).some((a) => a.id === p.id))}
            getOptionLabel={(p) => (p.full_name ? `${p.full_name} (${p.email})` : p.email || '')}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            value={assignSelection}
            onChange={(_, v) => setAssignSelection(v)}
            noOptionsText="No unassigned approved patients"
            renderInput={(params) => <TextField {...params} label="Patients" size="small" />}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAssignTarget(null)}>Cancel</Button>
          <Button variant="contained" disabled={!assignSelection.length} onClick={confirmAssign}>Assign</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!approveTarget} onClose={() => setApproveTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>Approve user</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Choose the role for {approveTarget?.full_name || approveTarget?.email}.
          </DialogContentText>
          <FormControl fullWidth size="small">
            <InputLabel id="approve-role-label">Role</InputLabel>
            <Select labelId="approve-role-label" label="Role" value={approveRole} onChange={(e) => setApproveRole(e.target.value)}>
              {ASSIGNABLE.map((r) => <MenuItem key={r} value={r}>{ROLE_LABELS[r]}</MenuItem>)}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setApproveTarget(null)}>Cancel</Button>
          <Button variant="contained" disabled={!approveRole} onClick={confirmApprove}>Confirm approval</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!rejectTarget} onClose={() => setRejectTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>Reject access request?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {rejectTarget?.full_name || rejectTarget?.email} will be told their request was not approved and will not be able to use Q-INTERVAL.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRejectTarget(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={confirmReject}>Reject</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>Delete user?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This permanently deletes the account for {deleteTarget?.full_name || deleteTarget?.email} and cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={confirmDelete}>Delete</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={5000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {toast ? <Alert severity={toast.severity} variant="filled" onClose={() => setToast(null)}>{toast.message}</Alert> : undefined}
      </Snackbar>
    </Container>
    </Box>
  );
}
