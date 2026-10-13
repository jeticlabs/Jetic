import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { newId, store } from '../store';

const router = Router();

router.post('/', requireAuth, (req: AuthedRequest, res) => {
  const { item, quantity } = req.body ?? {};
  if (typeof item !== 'string' || !item) return res.status(400).json({ error: 'item required' });
  if (!Number.isInteger(quantity) || quantity < 1) return res.status(400).json({ error: 'quantity must be a positive integer' });

  const order = { id: newId('ord'), ownerId: req.user!.id, item, quantity };
  store.orders.set(order.id, order);
  res.status(201).json({ data: { id: order.id, item, quantity } });
});

router.get('/:id', requireAuth, (req: AuthedRequest, res) => {
  const order = store.orders.get(String(req.params.id));
  if (!order) return res.status(404).json({ error: 'order not found' });
  if (order.ownerId !== req.user!.id) return res.status(403).json({ error: 'not your order' });
  res.json({ data: order });
});

export default router;
