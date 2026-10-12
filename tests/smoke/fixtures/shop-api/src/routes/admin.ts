import { Router } from 'express';
import { AuthedRequest, requireAdmin, requireAuth } from '../middleware/auth';
import { store } from '../store';

const router = Router();

router.delete('/users/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
  if (!store.users.delete(String(req.params.id))) return res.status(404).json({ error: 'user not found' });
  res.status(204).end();
});

export default router;
