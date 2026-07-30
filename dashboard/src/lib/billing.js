/**
 * Shared billing utilities to calculate trial info, plan labels, and tier status.
 */

export function getTrialInfo(site) {
  if (!site || site.plan !== 'trial') {
    return { isTrial: false, daysLeft: null, expired: false }
  }

  // 28 must match BOTH sites.trial_ends_at's DB default (migration 20260730000000) and
  // TRIAL_DAYS in api/middleware/auth.js. Three copies of one number, and this is the one
  // the customer reads: it drives the trial banner on Settings. Left at 14 it would have
  // under-reported days remaining by exactly two weeks for any site with a NULL
  // trial_ends_at — a real number shown to a paying-soon customer, not a cosmetic drift.
  const end = site.trial_ends_at
    ? new Date(site.trial_ends_at)
    : new Date(new Date(site.created_at).getTime() + 28 * 24 * 60 * 60 * 1000)

  const now = new Date()
  const daysLeft = end && !isNaN(end.getTime()) ? Math.ceil((end - now) / (1000 * 60 * 60 * 24)) : 0

  return {
    isTrial: true,
    daysLeft: Math.max(0, daysLeft),
    expired: daysLeft <= 0
  }
}

export function getPlanLabel(plan) {
  const labels = {
    free: 'Free',
    trial: 'Trial',
    starter: 'Starter',
    growth: 'Growth',
    scale: 'Scale',
    business: 'Scale',
    agency: 'Scale',
    pro: 'Pro',
    inactive: 'Inactive',
    archived: 'Archived'
  }
  return labels[plan] || (plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : '')
}

export function isPaidPlan(plan) {
  const normalized = plan === 'pro' ? 'growth' : plan === 'agency' ? 'scale' : plan === 'business' ? 'scale' : plan
  return ['starter', 'growth', 'scale'].includes(normalized)
}
