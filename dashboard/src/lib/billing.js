/**
 * Shared billing utilities to calculate trial info, plan labels, and tier status.
 */

export function getTrialInfo(site) {
  if (!site || site.plan !== 'trial') {
    return { isTrial: false, daysLeft: null, expired: false }
  }

  const end = site.trial_ends_at
    ? new Date(site.trial_ends_at)
    : new Date(new Date(site.created_at).getTime() + 14 * 24 * 60 * 60 * 1000)

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
    business: 'Business',
    inactive: 'Inactive',
    archived: 'Archived'
  }
  return labels[plan] || (plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : '')
}

export function isPaidPlan(plan) {
  const normalized = plan === 'pro' ? 'growth' : plan === 'agency' ? 'business' : plan
  return ['starter', 'growth', 'business'].includes(normalized)
}
