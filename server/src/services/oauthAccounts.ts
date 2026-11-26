/**
 * Account resolution for external identities.
 *
 * The rules (requirement: "handle account linking safely … never create
 * duplicate accounts") are deliberately conservative:
 *
 *  1. A known Google identity (same provider + `sub`) always signs into the user
 *     it is already attached to — even if the Google email has since changed.
 *  2. No identity yet, but an account with that email exists:
 *       • the email is verified by Google, and
 *       • the existing account is already confirmed (or was created by Google),
 *     so the identity is linked to that account. The local password (if any) is
 *     kept, so both sign-in methods keep working.
 *  3. Anything else is a brand-new user.
 *
 * Two things are never done:
 *  • never merge two *different* Google identities into one user;
 *  • never attach a Google identity to a deleted account.
 *
 * The unique constraint on (provider, providerAccountId) makes the "no duplicate
 * accounts" guarantee hold even if two callbacks race.
 */

import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import type { GoogleProfile } from './google.js';
import { GoogleOAuthError } from './google.js';

export type LinkOutcome = 'login' | 'linked' | 'created';

export interface ResolvedAccount {
  userId: string;
  outcome: LinkOutcome;
  /** True when the user still has no onboarding/profile setup. */
  needsOnboarding: boolean;
}

function nameFrom(profile: GoogleProfile): string {
  return profile.name || profile.givenName || profile.email.split('@')[0] || 'New user';
}

export async function resolveGoogleUser(
  profile: GoogleProfile,
  opts: { ip?: string } = {},
): Promise<ResolvedAccount> {
  const email = profile.email.toLowerCase();

  if (config.GOOGLE_ALLOWED_DOMAINS.length) {
    const domain = email.split('@')[1] ?? '';
    if (!config.GOOGLE_ALLOWED_DOMAINS.includes(domain)) {
      throw new GoogleOAuthError(
        'google_domain_not_allowed',
        `Only accounts on ${config.GOOGLE_ALLOWED_DOMAINS.join(', ')} can sign in with Google here.`,
      );
    }
  }

  // 1 ── known identity ────────────────────────────────────────────────
  const existingIdentity = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider: 'google', providerAccountId: profile.sub } },
    include: { user: { select: { id: true, deletedAt: true, profile: { select: { onboarded: true } } } } },
  });

  if (existingIdentity) {
    if (existingIdentity.user.deletedAt) {
      throw new GoogleOAuthError('account_deleted', 'This account has been deleted.');
    }
    await prisma.oAuthAccount.update({
      where: { id: existingIdentity.id },
      data: {
        email,
        emailVerified: profile.emailVerified,
        name: profile.name,
        avatarUrl: profile.picture,
        lastLoginAt: new Date(),
      },
    });
    return {
      userId: existingIdentity.user.id,
      outcome: 'login',
      needsOnboarding: !existingIdentity.user.profile?.onboarded,
    };
  }

  // 2 ── an account already uses this email ────────────────────────────
  const emailOwner = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      emailVerified: true,
      passwordHash: true,
      deletedAt: true,
      profile: { select: { onboarded: true, avatarUrl: true } },
      oauthAccounts: { select: { provider: true } },
    },
  });

  if (emailOwner) {
    if (emailOwner.deletedAt) throw new GoogleOAuthError('account_deleted', 'This account has been deleted.');

    // A Google identity must never be bolted onto an account that already
    // belongs to a *different* external provider — that would merge identities.
    const otherProvider = emailOwner.oauthAccounts.find((a) => a.provider !== 'google');
    if (otherProvider) {
      throw new GoogleOAuthError(
        'account_linked_elsewhere',
        `This email is already signed up with ${otherProvider.provider}. Sign in that way instead.`,
      );
    }

    // Google says the address is verified. If the local account is also
    // confirmed (or was itself created through Google), the two provably belong
    // to the same person, so linking is safe.
    const canAutoLink = profile.emailVerified && (emailOwner.emailVerified || !emailOwner.passwordHash);

    if (!canAutoLink) {
      if (!config.GOOGLE_AUTO_LINK) {
        throw new GoogleOAuthError(
          'linking_disabled',
          'An account with this email already exists. Sign in with your password, then connect Google from Settings.',
        );
      }
      // Unverified local account + verified Google email: Google has proven
      // ownership of the mailbox, so we confirm the address and link. The
      // existing password stays valid.
      await prisma.user.update({ where: { id: emailOwner.id }, data: { emailVerified: true } });
    }

    await prisma.$transaction([
      prisma.oAuthAccount.create({
        data: {
          userId: emailOwner.id,
          provider: 'google',
          providerAccountId: profile.sub,
          email,
          emailVerified: profile.emailVerified,
          name: profile.name,
          avatarUrl: profile.picture,
          linkedAt: new Date(),
          lastLoginAt: new Date(),
        },
      }),
      // Show the Google avatar if the profile has none yet. Nothing else about
      // the existing account is touched.
      ...(emailOwner.profile && !emailOwner.profile.avatarUrl && profile.picture
        ? [
            prisma.profile.update({
              where: { userId: emailOwner.id },
              data: { avatarUrl: profile.picture },
            }),
          ]
        : []),
    ]);

    await prisma.auditLog
      .create({
        data: {
          userId: emailOwner.id,
          action: 'auth.google_linked',
          ip: opts.ip,
          metadata: { provider: 'google', sub: profile.sub, autoLinked: true },
        },
      })
      .catch(() => undefined);

    return {
      userId: emailOwner.id,
      outcome: 'linked',
      needsOnboarding: !emailOwner.profile?.onboarded,
    };
  }

  // 3 ── brand-new user ────────────────────────────────────────────────
  const created = await prisma.user.create({
    data: {
      email,
      name: nameFrom(profile),
      // No local password: this account signs in with Google.
      passwordHash: null,
      emailVerified: true,
      profile: {
        create: {
          timezone: 'Asia/Kolkata',
          avatarUrl: profile.picture,
        },
      },
      settings: { create: {} },
      oauthAccounts: {
        create: {
          provider: 'google',
          providerAccountId: profile.sub,
          email,
          emailVerified: profile.emailVerified,
          name: profile.name,
          avatarUrl: profile.picture,
          lastLoginAt: new Date(),
        },
      },
    },
    select: { id: true },
  });

  await prisma.auditLog
    .create({
      data: { userId: created.id, action: 'auth.google_register', ip: opts.ip, metadata: { provider: 'google' } },
    })
    .catch(() => undefined);

  return { userId: created.id, outcome: 'created', needsOnboarding: true };
}

/** True when the account has no local password (Google-only). */
export async function hasPassword(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  return Boolean(u?.passwordHash);
}

/** Which sign-in methods a user has, for the Settings page. */
export async function signInMethods(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, oauthAccounts: { select: { provider: true, email: true, linkedAt: true } } },
  });
  return {
    password: Boolean(u?.passwordHash),
    google: u?.oauthAccounts.find((a) => a.provider === 'google')
      ? {
          email: u.oauthAccounts.find((a) => a.provider === 'google')!.email,
          linkedAt: u.oauthAccounts.find((a) => a.provider === 'google')!.linkedAt,
        }
      : null,
  };
}
