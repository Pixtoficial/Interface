const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'pixt-secret-change-me';

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token ausente' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

function adminRequired(req, res, next) {
  authRequired(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso restrito a administradores' });
    next();
  });
}

function sign(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}

module.exports = { authRequired, adminRequired, sign };
