export default function AdminGuard({
  minLevel,
  profile,
  children,
  fallback = null,
}) {
  const adminLevel = profile?.admin_level;
  const hasAccess = Number.isInteger(adminLevel)
    && adminLevel >= 0
    && adminLevel <= 6
    && Number.isInteger(minLevel)
    && minLevel >= 0
    && minLevel <= 6
    && adminLevel >= minLevel;

  return hasAccess ? children : fallback;
}
