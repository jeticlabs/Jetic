import { Router } from 'express';

const router = Router();

// GET /api/orders - Get orders with pagination & custom headers
router.get('/', (req, res) => {
  const page = Number(req.query.page) || 1;
  const sortBy = req.query.sortBy || 'createdAt';
  const clientVersion = req.headers['x-client-version'] || 'unknown';

  res.status(200).json({
    data: [
      { id: '100', total: 250.50, status: 'shipped' },
      { id: '101', total: 15.00, status: 'pending' }
    ],
    pagination: { page, totalPages: 5 },
    clientVersion
  });
});

// GET /api/orders/:id - Get specific order
router.get('/:id', (req, res) => {
  const orderId = req.params.id;
  
  res.status(200).json({ 
    id: orderId, 
    items: [{ productId: 'abc', quantity: 2 }],
    total: 99.99 
  });
});

// POST /api/orders - Create order with nested validation
router.post('/', (req, res) => {
  const { userId, items, shippingAddress } = req.body;
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized: Missing Authorization header' });
  }

  // Validation
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items must be a non-empty array' });
  }
  if (!shippingAddress || !shippingAddress.city || !shippingAddress.zipCode) {
    return res.status(400).json({ error: 'Complete shippingAddress (city, zipCode) is required' });
  }

  res.status(201).json({
    message: 'Order placed',
    orderId: 'ORD-' + Math.floor(Math.random() * 10000),
    summary: {
      userId,
      itemCount: items.length,
      address: shippingAddress
    }
  });
});

// PATCH /api/orders/:id/status - Partial update
router.patch('/:id/status', (req, res) => {
  const orderId = req.params.id;
  const { status } = req.body;
  const validStatuses = ['pending', 'shipped', 'delivered', 'cancelled'];

  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ 
      error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
    });
  }

  res.status(200).json({
    message: 'Order status updated',
    id: orderId,
    newStatus: status
  });
});

// DELETE /api/orders/:id
router.delete('/:id', (req, res) => {
  const reason = req.headers['x-cancellation-reason'];
  
  if (!reason) {
    return res.status(400).json({ error: 'Must provide x-cancellation-reason header to delete an order' });
  }

  res.status(200).json({ 
    message: 'Order cancelled', 
    id: req.params.id, 
    reason 
  });
});

export default router;
