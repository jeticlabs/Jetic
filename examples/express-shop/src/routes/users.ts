import { Router } from 'express';

const router = Router();

// GET /api/users - Read all users with query parameters
router.get('/', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 10;
  const role = req.query.role as string;
  
  // Demo response
  res.status(200).json({
    data: [
      { id: '1', name: 'Alice', role: 'admin' },
      { id: '2', name: 'Bob', role: 'user' }
    ],
    meta: { limit, role }
  });
});

// GET /api/users/:id - Read single user by ID
router.get('/:id', (req, res) => {
  const userId = req.params.id;
  const includeDetails = req.query.includeDetails === 'true';

  if (userId === '0') {
    return res.status(404).json({ error: 'User not found' });
  }

  res.status(200).json({ 
    id: userId, 
    name: 'Demo User',
    details: includeDetails ? { age: 30, location: 'NY' } : undefined
  });
});

// POST /api/users - Create a new user with validation
router.post('/', (req, res) => {
  const { name, email, age } = req.body;
  const customHeader = req.headers['x-custom-user-header'];

  // Manual validation
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Name is required and must be a string' });
  }
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  // Simulate creation
  res.status(201).json({
    message: 'User created successfully',
    user: {
      id: Math.random().toString(36).substring(7),
      name,
      email,
      age
    },
    receivedCustomHeader: customHeader
  });
});

// PUT /api/users/:id - Update an existing user
router.put('/:id', (req, res) => {
  const userId = req.params.id;
  const { name, email } = req.body;

  if (!name && !email) {
    return res.status(400).json({ error: 'At least one field (name, email) is required to update' });
  }

  res.status(200).json({
    message: 'User updated',
    updatedId: userId,
    changes: req.body
  });
});

// DELETE /api/users/:id - Delete a user
router.delete('/:id', (req, res) => {
  const userId = req.params.id;
  
  if (userId === 'admin') {
    return res.status(403).json({ error: 'Cannot delete admin user' });
  }

  res.status(200).json({ message: `User ${userId} deleted` });
});

export default router;
