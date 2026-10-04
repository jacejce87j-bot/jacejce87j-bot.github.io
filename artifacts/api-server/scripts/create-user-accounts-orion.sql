-- Create or update a user account for accounts@oriontracking.co.za
-- Usage: set DATABASE_URL and run with psql or use your DB client.
-- This inserts a bcrypt hash for password 'password123' (example seed hash used elsewhere in the project).

INSERT INTO users (email, first_name, last_name, role, password_hash)
VALUES (
  'accounts@oriontracking.co.za',
  'Accounts',
  'Orion',
  'admin',
  '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role;

-- Verify:
SELECT id, email, first_name, last_name, role FROM users WHERE email = 'accounts@oriontracking.co.za';
