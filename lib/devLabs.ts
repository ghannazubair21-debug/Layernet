/**
 * Component-lab routes (/micro-interactions, /playground) are development aids, not product features.
 * /micro-interactions simulates a random "analysis" outcome, which would mislead users of a fraud tool.
 * They are hidden from navigation and return 404 in production builds; the pages themselves are kept.
 */
export const DEV_LABS_ENABLED = process.env.NODE_ENV !== "production";
