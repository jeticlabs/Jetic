import { Router } from 'express';

const router = Router();

export const VALID_OTP = '424242';

router.post('/verify', (req, res) => {
  if (req.body?.otp !== VALID_OTP) return res.status(401).json({ error: 'invalid otp' });
  res.json({ data: { verified: true } });
});

export default router;
