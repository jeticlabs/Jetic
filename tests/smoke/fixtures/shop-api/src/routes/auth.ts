import { Router } from 'express';
import { newId, store } from '../store';

const router = Router();

router.post('/register', (req, res) => {
  const { email, password, role } = req.body ?? {};
  if (typeof email !== 'string' || !email.includes('@')) return res.status(400).json({ error: 'invalid email' });
  if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'password too short' });
  if ([...store.users.values()].some((u) => u.email === email)) return res.status(409).json({ error: 'email taken' });

  const user = { id: newId('u'), email, password, role: role === 'admin' ? ('admin' as const) : ('user' as const) };
  store.users.set(user.id, user);
  res.status(201).json({ data: { user: { id: user.id, email: user.email, role: user.role } } });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body ?? {};
  const user = [...store.users.values()].find((u) => u.email === email && u.password === password);
  if (!user) return res.status(401).json({ error: 'invalid credentials' });

  const accessToken = newId('tok');
  store.tokens.set(accessToken, user.id);
  res.json({ data: { accessToken, user: { id: user.id, role: user.role } } });
});

export default router;
