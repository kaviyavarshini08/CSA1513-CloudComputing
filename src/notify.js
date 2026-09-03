// notify.js — simulates an event-driven, serverless-style (FaaS) function
// that a real deployment would run as an independent cloud function
// (e.g. AWS Lambda / Azure Function) triggered asynchronously by a
// database or message-queue event, decoupled from the main API process.
// Here it is invoked in-process to demonstrate the trigger/action pattern
// end-to-end without requiring an external cloud account.
const db = require('./db');

function onAppointmentCreated(appointment) {
  if (appointment.priority !== 'critical') return null;

  const message =
    `ALERT: Critical-priority ${appointment.mode} appointment #${appointment.id} ` +
    `booked for patient ${appointment.patient_id} with doctor ${appointment.doctor_id} ` +
    `at campus ${appointment.campus_id} (${appointment.department}). Immediate triage required.`;

  db.prepare(
    'INSERT INTO alert_log (appointment_id, event, message) VALUES (?, ?, ?)'
  ).run(appointment.id, 'appointment.critical', message);

  // In production this function would call a push-notification / SMS / pager
  // cloud service (e.g. SNS, Twilio, FCM) — logged here to stdout instead.
  console.log(`[notify-fn] ${message}`);
  return message;
}

module.exports = { onAppointmentCreated };
