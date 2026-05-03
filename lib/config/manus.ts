/**
 * Manus invite code surfaced in user-facing UI links.
 *
 * Defaults to the upstream maintainer's referral code so a freshly-deployed
 * fork still routes signup credit somewhere meaningful out of the box.
 *
 * Forking and want signups to credit you instead? Set
 *   NEXT_PUBLIC_MANUS_INVITE_CODE=YOUR_CODE
 * in your Vercel / .env.local. See docs/MAKE-IT-YOURS.md for the full
 * white-label checklist.
 */
export const MANUS_INVITE_CODE =
  process.env.NEXT_PUBLIC_MANUS_INVITE_CODE || 'AIRTDVWVEWKCK4R'

export const MANUS_INVITE_URL = `https://manus.im/invitation/${MANUS_INVITE_CODE}`
