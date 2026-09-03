// validate.js — simple, dependency-free input validation
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isNonEmptyString(v) { return typeof v === 'string' && v.trim().length > 0; }

function validateRegistration(body) {
  const errors = [];
  if (!isNonEmptyString(body.name)) errors.push('name is required');
  if (!isNonEmptyString(body.email) || !EMAIL_RE.test(body.email)) errors.push('a valid email is required');
  if (!isNonEmptyString(body.password) || body.password.length < 8) errors.push('password must be at least 8 characters');
  if (!['patient', 'doctor', 'admin'].includes(body.role)) errors.push('role must be patient, doctor, or admin');
  if (!isNonEmptyString(body.campus_id)) errors.push('campus_id is required');
  return errors;
}

function validateAppointment(body) {
  const errors = [];
  if (!Number.isInteger(body.doctor_id)) errors.push('doctor_id (integer) is required');
  if (!isNonEmptyString(body.campus_id)) errors.push('campus_id is required');
  if (!isNonEmptyString(body.department)) errors.push('department is required');
  if (!['teleconsultation', 'in-person'].includes(body.mode)) errors.push('mode must be teleconsultation or in-person');
  if (!isNonEmptyString(body.scheduled_at) || isNaN(Date.parse(body.scheduled_at))) errors.push('scheduled_at must be a valid ISO date-time string');
  if (body.priority && !['routine', 'urgent', 'critical'].includes(body.priority)) errors.push('priority must be routine, urgent, or critical');
  return errors;
}

module.exports = { validateRegistration, validateAppointment };
