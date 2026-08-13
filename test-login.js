const http = require('http');
const data = JSON.stringify({email: 'test@test.com', password: 'password123'});
const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};
const req = http.request(options, (res) => {
  console.log('Status:', res.statusCode);
  console.log('Headers:', JSON.stringify(res.headers, null, 2));
  let body = '';
  res.on('data', (chunk) => { body += chunk; });
  res.on('end', () => { console.log('Body length:', body.length); console.log('Body:', body); process.exit(0); });
});
req.on('error', (e) => { console.error('Error:', e); process.exit(1); });
req.write(data);
req.end();
setTimeout(() => { console.log('Timeout'); process.exit(1); }, 5000);
