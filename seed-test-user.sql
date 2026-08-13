-- 2. Insert Damien and Travis with bcrypt hashed password for 'password123'
INSERT INTO users (email, first_name, last_name, role, password_hash) 
VALUES 
    ('damien@oriontracking.co.za', 'Damien', 'User', 'admin', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'),
    ('travis@oriontracking.co.za', 'Travis', 'User', 'admin', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW')
ON CONFLICT (email) DO UPDATE SET 
    password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role;

-- 3. Verify the records
SELECT id, email, first_name, last_name, role, password_hash FROM users 
WHERE email IN ('damien@oriontracking.co.za', 'travis@oriontracking.co.za');