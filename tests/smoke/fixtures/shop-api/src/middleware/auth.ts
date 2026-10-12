import { NextFunction, Request, Response } from 'express';
import { store, User } from '../store';

export interface AuthedRequest extends Request {
  user?: User;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  const user = store.users.get(store.tokens.get(token) ?? '');
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  req.user = user;
  next();
}

/** Same as requireAuth, except when the fixture is switched into "leaky" mode (a missing-guard bug). */
export function requireAuthUnlessLeaky(req: AuthedRequest, res: Response, next: NextFunction) {
  if (store.mode.leaky) return next();
  return requireAuth(req, res, next);
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  next();
}
