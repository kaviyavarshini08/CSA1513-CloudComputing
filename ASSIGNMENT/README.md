# Hospital Appointment Booking & Critical-Alert Microservice

Prototype cloud-native REST API for the CSA15 Cloud Computing & Big Data
Analytics common assignment: *Design and Critical Analysis of a
Cloud-Based Service Architecture for a Multi-Campus Telemedicine and
Hospital Network*.

## What this is

A containerizable Appointment Booking & Teleconsultation microservice with:
- Role-based accounts (patient / doctor / admin) with hashed passwords (scrypt)
- Bearer-token authentication using a minimal HMAC-SHA256 signed, JWT-style token
- REST endpoints for registration, login, and appointment CRUD + status workflow
- Server-side input validation
- Persistent storage via SQLite (Node's built-in `node:sqlite`)
- An event-driven, serverless-style (FaaS) function that fires automatically
  when a `critical`-priority appointment is created, logging a triage alert —
  demonstrating the XaaS / event-driven-integration concept from the assignment

No external npm packages are required — everything runs on Node's built-in
`http`, `crypto`, and `node:sqlite` modules (Node >= 22.5), so the service
is fully portable and has no install step, which also makes it trivial to
containerize (see `Dockerfile`).

## Run locally

```bash
node src/server.js
# Appointment Booking API listening on port 3000
```

## Run in a container

```bash
docker build -t hospital-appointment-api .
docker run -p 3000:3000 hospital-appointment-api
```

## API summary

| Method | Path                              | Auth           | Purpose                              |
|--------|-----------------------------------|----------------|---------------------------------------|
| GET    | /health                           | none           | Liveness check                        |
| POST   | /api/register                     | none           | Create a user account                 |
| POST   | /api/login                        | none           | Obtain a bearer token                 |
| POST   | /api/appointments                 | patient, admin | Book an appointment                   |
| GET    | /api/appointments                 | any            | List appointments (role-scoped)       |
| GET    | /api/appointments/:id             | any            | Get one appointment (role-scoped)     |
| PATCH  | /api/appointments/:id/status      | doctor, admin  | Update appointment status             |
| DELETE | /api/appointments/:id             | admin          | Delete an appointment                 |
| GET    | /api/alerts                       | doctor, admin  | View the critical-alert log           |

See `/test/api_test_output.txt` for a full recorded end-to-end test run.

## Project structure

```
hospital-api/
├── Dockerfile
├── package.json
├── README.md
├── src/
│   ├── server.js      # HTTP server & router
│   ├── db.js          # SQLite schema & connection
│   ├── auth.js        # password hashing + token sign/verify
│   ├── validate.js     # input validation
│   └── notify.js       # event-driven critical-alert function
└── test/
    └── api_test_output.txt   # recorded end-to-end test run
```

## Note on GitHub / cloud deployment

This prototype was built and tested inside an offline sandbox with no
outbound network access, so it could not be pushed to GitHub or deployed
to a live cloud account from within that environment. The repository is
fully git-initialized and ready to push — see the "Deployment & GitHub"
section of the assignment report for the exact commands to run from a
machine with GitHub access.
