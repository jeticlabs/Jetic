import { Router } from 'express';

const router = Router();

router.post('/', (req, res) => res.json({ id: '1' }));
router.get('/:id', (req, res) => res.json({ id: req.params.id }));
router.delete('/:id', (req, res) => res.send('deleted'));

export default router;
