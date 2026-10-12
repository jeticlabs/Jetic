import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, (req: AuthedRequest, res) => {
  const { id, email, role } = req.user!;
  res.json({ data: { id, email, role } });
});

export default router;
