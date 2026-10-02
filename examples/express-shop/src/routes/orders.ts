import { Router } from 'express';

const router = Router();

router.get('/:id', (_req, res) => res.json({ id: 'order-1' }));

export default router;