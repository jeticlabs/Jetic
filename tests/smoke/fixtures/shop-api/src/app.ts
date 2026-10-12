import express from 'express';
import adminRouter from './routes/admin';
import authRouter from './routes/auth';
import flakyRouter from './routes/flaky';
import meRouter from './routes/me';
import ordersRouter from './routes/orders';
import otpRouter from './routes/otp';
import reportsRouter from './routes/reports';

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', authRouter);
  app.use('/api/me', meRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/flaky', flakyRouter);
  app.use('/api/otp', otpRouter);

  return app;
}
