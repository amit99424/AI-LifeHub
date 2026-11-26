/**
 * Create an account — Google only.
 *
 * Same single action as signing in; Google decides whether the person is new.
 * New accounts land in onboarding, existing ones go straight to the dashboard.
 */

import { AuthShell } from '@/components/AuthShell';
import { GoogleButton } from '@/components/GoogleButton';

export default function Register() {
  return (
    <AuthShell title="Create your account" subtitle="Start with Google — setup takes about a minute.">
      <GoogleButton next="/onboarding" label="Continue with Google" />
    </AuthShell>
  );
}
