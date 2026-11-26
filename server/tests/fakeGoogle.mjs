// Simulates Google's role: signs an ID token with a throwaway RSA key, then
// points the app's JWKS lookup at that key. Proves the real callback path
// (exchange → verify → link/create → JWT session) end to end, offline.
import crypto from 'node:crypto';
import http from 'node:http';

const CLIENT_ID = '123456-test.apps.googleusercontent.com';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
const KID = 'sim-kid';

export function signIdToken(claims) {
  const now = Math.floor(Date.now() / 1000);
  const body = { iss: 'https://accounts.google.com', aud: CLIENT_ID, iat: now - 5, exp: now + 3600, ...claims };
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const input = `${enc({ alg: 'RS256', kid: KID, typ: 'JWT' })}.${enc(body)}`;
  return `${input}.${crypto.sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`;
}

// Local stand-in for Google's token + JWKS endpoints.
export function startFakeGoogle(port, tokenFor) {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/jwks')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ keys: [{ kid: KID, ...jwk, kty: 'RSA', alg: 'RS256', use: 'sig' }] }));
    }
    if (req.url.startsWith('/token')) {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const params = new URLSearchParams(body);
        const code = params.get('code');
        const entry = tokenFor(code);
        if (!entry) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'invalid_grant' }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id_token: signIdToken(entry), access_token: 'at', scope: 'openid email profile', expires_in: 3599 }));
      });
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise((r) => server.listen(port, () => r(server)));
}
