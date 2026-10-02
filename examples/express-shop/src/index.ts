import express from 'express';
import ordersRouter from './routes/orders';
import usersRouter from './routes/users';

const app = express();

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/orders', ordersRouter);
app.use('/api/users', usersRouter);

export default app;