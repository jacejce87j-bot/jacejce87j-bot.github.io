import express, { Request, Response } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'supportdesk-secret-key';

// In-memory mock DB (replace with your DB query if using Postgres/Prisma/Drizzle)
const users: Array<{ id: string; email: string; password: string; fullName?: string }> = [];

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

// Log incoming API calls
app.use((req, res, next) => {
  console.log(`[Backend] ${req.method} ${req.path}`);
  next();
});

// 1. Sign-Up Route
app.post('/api/auth/register', (req: Request, res: Response) => {
  try {
    const { email, password, fullName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if user exists
    const existing = users.find((u) => u.email === normalizedEmail);
    if (existing) {
      return res.status(400).json({ message: 'User already exists.' });
    }

    // Save user
    const newUser = { id: Date.now().toString(), email: normalizedEmail, password, fullName };
    users.push(newUser);

    // Generate JWT Token
    const token = jwt.sign({ id: newUser.id, email: newUser.email }, JWT_SECRET, {
      expiresIn: '7d',
    });

    console.log(`[Auth] User registered successfully: ${normalizedEmail}`);
    return res.status(201).json({ message: 'Registration successful', token });
  } catch (err: any) {
    console.error('[Auth] Registration error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// 2. Sign-In Route
app.post('/api/auth/login', (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email?.trim().toLowerCase();

    const user = users.find((u) => u.email === normalizedEmail && u.password === password);

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: '7d',
    });

    return res.status(200).json({ message: 'Login successful', token });
  } catch (err: any) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Express Backend listening on http://0.0.0.0:${PORT}`);
});