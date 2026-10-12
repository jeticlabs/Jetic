import { Hono } from 'hono';

const app = new Hono();

app.get('/hello', (c) => c.text('hi'));
app.post('/items', (c) => c.json({ created: true }, 201));
app.delete('/items/:id', (c) => c.body(null, 204));

export default app;
