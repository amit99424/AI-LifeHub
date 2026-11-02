import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface AccessPayload {
  sub: string;
  sid: string;
  type: 'access';
}

export function signAccessToken(userId: string, sessionId: string): string {
  const payload: AccessPayload = { sub: userId, sid: sessionId, type: 'access' };
  return jwt.sign(payload, config.JWT_ACCESS_SECRET, {
    expiresIn: config.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
    issuer: 'ai-lifehub',
    audience: 'ai-lifehub-web',
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET, {
    issuer: 'ai-lifehub',
    audience: 'ai-lifehub-web',
  }) as AccessPayload;
  if (decoded.type !== 'access') throw new Error('Wrong token type');
  return decoded;
}

/** Opaque refresh token: random secret returned to the client, hash stored in DB. */
export function createRefreshToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(48).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(`${token}:${config.JWT_REFRESH_SECRET}`).digest('hex');
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function safeCompare(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
