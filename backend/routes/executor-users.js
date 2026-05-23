const express = require('express');
const bcrypt = require('bcryptjs');
const supabase = require('../supabase');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

// Lista executores-login criados pelo dono atual
router.get('/', authRequired, async (req, res) => {
  const ownerId = req.user.owner_id || req.user.uid;
  const { data, error } = await supabase
    .from('users')
    .select('id, email, name, is_active, created_at')
    .eq('owner_id', ownerId)
    .eq('role', 'executor')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ executor_users: data || [] });
});

// Cria conta de executor
router.post('/', authRequired, async (req, res) => {
  const ownerId = req.user.owner_id || req.user.uid;
  const { name, password } = req.body || {};

  if (!name || !name.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Senha precisa ter ao menos 6 caracteres' });

  // Deriva o email automaticamente: nome-sem-espaço@executor.ia
  const slug = name.trim().toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '');
  const email = `${slug}@executor.ia`;

  const { data: exists } = await supabase.from('users').select('id').eq('email', email).limit(1);
  if (exists && exists.length) return res.status(409).json({ error: `Email ${email} já está em uso. Tente um nome diferente.` });

  const hash = bcrypt.hashSync(password, 10);
  const { data: created, error } = await supabase
    .from('users')
    .insert({ email, password_hash: hash, name: name.trim(), role: 'executor', owner_id: ownerId, is_active: true })
    .select('id, email, name, role, is_active, created_at')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ executor_user: created, email });
});

// Remove conta de executor
router.delete('/:id', authRequired, async (req, res) => {
  const ownerId = req.user.owner_id || req.user.uid;
  const id = parseInt(req.params.id, 10);

  const { data: u } = await supabase.from('users').select('id, owner_id').eq('id', id).single();
  if (!u || u.owner_id !== ownerId) return res.status(404).json({ error: 'Executor não encontrado' });

  const { error } = await supabase.from('users').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
