const PROMOTION_ACTIVITY = new Set([
  'report_reviewed',
  'report_dismissed',
  'listing_closed',
  'listing_deleted',
  'member_warned',
  'member_suspended',
  'member_unsuspended',
]);

export function isPromotionCaseworkAction(action) {
  return PROMOTION_ACTIVITY.has(action);
}

export function getPromotionReviewCandidates(profiles, promotionActivity, reviewerLevel) {
  const maximumManagedLevel = reviewerLevel === 6 ? 5 : 3;
  const activityByStaff = new Map(promotionActivity.map((entry) => [entry.actor_id, Number(entry.casework_actions)]));

  return profiles
    .filter((member) => member.admin_level >= 1 && member.admin_level < maximumManagedLevel)
    .map((member) => ({
      ...member,
      promotionActivity: activityByStaff.get(member.id) || 0,
    }))
    .filter((member) => {
      const suspensionIsActive = member.is_suspended
        && (!member.suspended_until || new Date(member.suspended_until) > new Date());
      return member.promotionActivity >= 5 && !suspensionIsActive;
    });
}
