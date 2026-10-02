import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => res.json({ id: 'user-1' }));

export default router;