// server.js — Appointment Booking & Teleconsultation microservice
// Built on Node's built-in http module (no external web framework was
// available offline); routes, JSON parsing, and error handling are
// implemented explicitly to keep the service dependency-free and portable
// across any Node 22+ container image (see Dockerfile).
const http = require('http');
const { URL } = require('url');
const db = require('./db');
const { hashPassword, verifyPassword, signToken, requireAuth } = require('./auth');
const { validateRegistration, validateAppointment } = require('./validate');
const { onAppointmentCreated } = require('./notify');

const PORT = process.env.PORT || 3000;

function sendJSON(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

// ---- Route handlers ----

async function handleRegister(req, res) {
  const body = await readBody(req);
  const errors = validateRegistration(body);
  if (errors.length) return sendJSON(res, 400, { error: 'Validation failed', details: errors });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(body.email);
  if (existing) return sendJSON(res, 409, { error: 'Email already registered' });

  const { hash, salt } = hashPassword(body.password);
  const info = db.prepare(
    'INSERT INTO users (name, email, role, campus_id, password_hash, password_salt) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(body.name, body.email, body.role, body.campus_id, hash, salt);

  sendJSON(res, 201, { id: Number(info.lastInsertRowid), name: body.name, email: body.email, role: body.role, campus_id: body.campus_id });
}

async function handleLogin(req, res) {
  const body = await readBody(req);
  if (!body.email || !body.password) return sendJSON(res, 400, { error: 'email and password are required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(body.email);
  if (!user || !verifyPassword(body.password, user.password_salt, user.password_hash)) {
    return sendJSON(res, 401, { error: 'Invalid credentials' });
  }
  const token = signToken({ sub: user.id, role: user.role, campus_id: user.campus_id, name: user.name });
  sendJSON(res, 200, { token, expires_in: 3600, role: user.role });
}

async function handleCreateAppointment(req, res) {
  const auth = requireAuth(['patient', 'admin'])(req, res);
  if (!auth) return;

  const body = await readBody(req);
  const errors = validateAppointment(body);
  if (errors.length) return sendJSON(res, 400, { error: 'Validation failed', details: errors });

  const doctor = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'doctor'").get(body.doctor_id);
  if (!doctor) return sendJSON(res, 404, { error: 'doctor_id does not refer to a valid doctor' });

  const patientId = auth.role === 'patient' ? auth.sub : body.patient_id;
  if (!Number.isInteger(patientId)) return sendJSON(res, 400, { error: 'patient_id is required when booking as admin' });

  const info = db.prepare(
    `INSERT INTO appointments (patient_id, doctor_id, campus_id, department, mode, scheduled_at, priority, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(patientId, body.doctor_id, body.campus_id, body.department, body.mode, body.scheduled_at, body.priority || 'routine', body.notes || null);

  const appointment = db.prepare('SELECT * FROM appointments WHERE id = ?').get(Number(info.lastInsertRowid));
  onAppointmentCreated(appointment); // fire the simulated serverless alert function

  sendJSON(res, 201, appointment);
}

async function handleListAppointments(req, res, query) {
  const auth = requireAuth([])(req, res);
  if (!auth) return;

  let rows;
  if (auth.role === 'patient') {
    rows = db.prepare('SELECT * FROM appointments WHERE patient_id = ? ORDER BY scheduled_at').all(auth.sub);
  } else if (auth.role === 'doctor') {
    rows = db.prepare('SELECT * FROM appointments WHERE doctor_id = ? ORDER BY scheduled_at').all(auth.sub);
  } else {
    const campus = query.get('campus_id');
    rows = campus
      ? db.prepare('SELECT * FROM appointments WHERE campus_id = ? ORDER BY scheduled_at').all(campus)
      : db.prepare('SELECT * FROM appointments ORDER BY scheduled_at').all();
  }
  sendJSON(res, 200, rows);
}

async function handleGetAppointment(req, res, id) {
  const auth = requireAuth([])(req, res);
  if (!auth) return;
  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
  if (!appt) return sendJSON(res, 404, { error: 'Appointment not found' });
  if (auth.role === 'patient' && appt.patient_id !== auth.sub) return sendJSON(res, 403, { error: 'Forbidden' });
  if (auth.role === 'doctor' && appt.doctor_id !== auth.sub) return sendJSON(res, 403, { error: 'Forbidden' });
  sendJSON(res, 200, appt);
}

async function handleUpdateStatus(req, res, id) {
  const auth = requireAuth(['doctor', 'admin'])(req, res);
  if (!auth) return;
  const body = await readBody(req);
  if (!['confirmed', 'completed', 'cancelled'].includes(body.status)) {
    return sendJSON(res, 400, { error: 'status must be confirmed, completed, or cancelled' });
  }
  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
  if (!appt) return sendJSON(res, 404, { error: 'Appointment not found' });
  if (auth.role === 'doctor' && appt.doctor_id !== auth.sub) return sendJSON(res, 403, { error: 'Forbidden' });

  db.prepare('UPDATE appointments SET status = ? WHERE id = ?').run(body.status, id);
  sendJSON(res, 200, db.prepare('SELECT * FROM appointments WHERE id = ?').get(id));
}

async function handleDeleteAppointment(req, res, id) {
  const auth = requireAuth(['admin'])(req, res);
  if (!auth) return;
  const result = db.prepare('DELETE FROM appointments WHERE id = ?').run(id);
  if (result.changes === 0) return sendJSON(res, 404, { error: 'Appointment not found' });
  sendJSON(res, 204, null);
}

async function handleAlerts(req, res) {
  const auth = requireAuth(['doctor', 'admin'])(req, res);
  if (!auth) return;
  const rows = db.prepare('SELECT * FROM alert_log ORDER BY created_at DESC').all();
  sendJSON(res, 200, rows);
}

// ---- Minimal router ----
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const parts = url.pathname.split('/').filter(Boolean); // e.g. ['api','appointments','3']

    if (url.pathname === '/health') return sendJSON(res, 200, { status: 'ok', service: 'appointment-booking', time: new Date().toISOString() });

    if (parts[0] === 'api' && parts[1] === 'register' && req.method === 'POST') return handleRegister(req, res);
    if (parts[0] === 'api' && parts[1] === 'login' && req.method === 'POST') return handleLogin(req, res);

    if (parts[0] === 'api' && parts[1] === 'appointments' && parts.length === 2 && req.method === 'POST') return handleCreateAppointment(req, res);
    if (parts[0] === 'api' && parts[1] === 'appointments' && parts.length === 2 && req.method === 'GET') return handleListAppointments(req, res, url.searchParams);
    if (parts[0] === 'api' && parts[1] === 'appointments' && parts.length === 3 && req.method === 'GET') return handleGetAppointment(req, res, Number(parts[2]));
    if (parts[0] === 'api' && parts[1] === 'appointments' && parts.length === 4 && parts[3] === 'status' && req.method === 'PATCH') return handleUpdateStatus(req, res, Number(parts[2]));
    if (parts[0] === 'api' && parts[1] === 'appointments' && parts.length === 3 && req.method === 'DELETE') return handleDeleteAppointment(req, res, Number(parts[2]));

    if (parts[0] === 'api' && parts[1] === 'alerts' && req.method === 'GET') return handleAlerts(req, res);

    sendJSON(res, 404, { error: 'Route not found' });
  } catch (err) {
    sendJSON(res, 500, { error: 'Internal server error', message: err.message });
  }
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`Appointment Booking API listening on port ${PORT}`));
}

module.exports = server;
