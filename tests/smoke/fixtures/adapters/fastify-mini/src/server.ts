import Fastify from 'fastify';

const fastify = Fastify();

fastify.get('/ping', async () => ({ pong: true }));
fastify.post('/echo', async (request) => request.body);

// Same-file plugin with a prefix: the adapter resolves `/api/v1` for the routes inside it.
async function usersPlugin(instance: typeof fastify) {
  instance.get('/users', async () => []);
  instance.get('/users/:id', async () => ({}));
}
fastify.register(usersPlugin, { prefix: '/api/v1' });

export default fastify;
