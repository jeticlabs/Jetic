import express from 'express';
import ordersRouter from './routes/orders';
import usersRouter from './routes/users';

const app = express();

// Middleware to parse JSON request bodies
app.use(express.json());

// Example global middleware to check for a custom header
app.use((req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey && req.path !== '/health') {
    // For demo purposes, we log it but don't strictly block it everywhere
    console.log('Missing x-api-key header');
  }
  next();
});

app.get('/health', (req, res) => res.status(200).json({ status: 'OK' }));

app.use('/api/orders', ordersRouter);
app.use('/api/users', usersRouter);

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(3000, () => {
  console.log('Listening on port 3000');
});
