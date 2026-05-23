const express = require('express');
const bcrypt = require('bcryptjs');
const supabase = require('../supabase');
const { sign, authRequired } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });

  const { data: rows, error } = await supabase
    .from('users')
    .select('id, email, name, password_hash, role, is_active')
    .eq('email', email)
    .limit(1);

  if (error) return res.status(500).json({ error: error.message });
  const u = rows && rows[0];
  if (!u) return res.status(401).json({ error: 'Credenciais inválidas' });
  if (!u.is_active) return res.status(403).json({ error: 'Conta desativada. Contacte o administrador.' });
  if (!bcrypt.compareSync(password, u.password_hash)) return res.status(401).json({ error: 'Credenciais inválidas' });

  const role = u.role || 'client';
  const tokenPayload = { uid: u.id, email: u.email, role };
  if (u.owner_id) tokenPayload.owner_id = u.owner_id;

  const token = sign(tokenPayload);
  res.json({
    user: { id: u.id, email: u.email, name: u.name, role, owner_id: u.owner_id || null },
    token,
  });
});

router.get('/me', authRequired, async (req, res) => {
  const { data: rows } = await supabase
    .from('users')
    .select('id, email, name, role, owner_id, created_at')
    .eq('id', req.user.uid)
    .limit(1);

  const u = rows && rows[0];
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.json({ user: { ...u, role: u.role || 'client' } });
});

module.exports = router;
