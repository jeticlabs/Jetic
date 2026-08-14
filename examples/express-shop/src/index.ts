import express from 'express';
import ordersRouter from './routes/orders';
import usersRouter from './routes/users';

const app = express();

app.get('/health', (req, res) => res.send('OK'));

app.use('/api/orders', ordersRouter);
app.use('/api/users', usersRouter);

app.listen(3000, () => {
  console.log('Listening on port 3000');
});
