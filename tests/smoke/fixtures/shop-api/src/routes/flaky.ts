import { Router } from 'express';
import { store } from '../store';

const router = Router();

/** Fails with 503 for the first `mode.flakyFailures` calls per `?key=`, then succeeds. */
router.get('/', (req, res) => {
  const key = String(req.query.key ?? 'default');
  const attempts = (store.flakyCalls.get(key) ?? 0) + 1;
  store.flakyCalls.set(key, attempts);
  if (attempts <= store.mode.flakyFailures) return res.status(503).json({ error: 'try again', attempts });
  res.json({ data: { attempts } });
});

export default router;
