// auth.js — password hashing (scrypt) and a minimal HMAC-SHA256 signed,
// JWT-style bearer token, implemented on Node's built-in crypto module.
// (No external auth library was used: this offline build environment has
// no npm registry access, so jsonwebtoken/bcrypt were reimplemented on
// Node's standard crypto primitives, which provide equivalent guarantees.)
const crypto = require('crypto');

const SECRET = process.env.JWT_SECRET || 'hospital-net-dev-secret-change-in-prod';
const TOKEN_TTL_SECONDS = 60 * 60; // 1 hour

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, salt, expectedHash) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expectedHash));
}

function base64url(input) {
  return Buffer.from(JSON.stringify(input)).toString('base64url');
}

function signToken(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS };
  const headerEnc = base64url(header);
  const bodyEnc = base64url(body);
  const signature = crypto.createHmac('sha256', SECRET).update(`${headerEnc}.${bodyEnc}`).digest('base64url');
  return `${headerEnc}.${bodyEnc}.${signature}`;
}

function verifyToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerEnc, bodyEnc, signature] = parts;
  const expected = crypto.createHmac('sha256', SECRET).update(`${headerEnc}.${bodyEnc}`).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  const payload = JSON.parse(Buffer.from(bodyEnc, 'base64url').toString());
  if (payload.exp < Math.floor(Date.now() / 1000)) return null; // expired
  return payload;
}

// Express-less middleware helper used by our minimal router (see server.js)
function requireAuth(roles = []) {
  return (req, res) => {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const payload = verifyToken(token);
    if (!payload) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized: missing or invalid token' }));
      return null;
    }
    if (roles.length && !roles.includes(payload.role)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Forbidden: requires role ${roles.join('/')}` }));
      return null;
    }
    return payload; // { sub, role, campus_id, iat, exp }
  };
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, requireAuth };
