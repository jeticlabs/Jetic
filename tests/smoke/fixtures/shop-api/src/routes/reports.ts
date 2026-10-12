import { Router } from 'express';
import { requireAuthUnlessLeaky } from '../middleware/auth';
import { store } from '../store';

const router = Router();

router.get('/', requireAuthUnlessLeaky, (_req, res) => {
  res.json({ data: { orders: store.orders.size } });
});

export default router;
