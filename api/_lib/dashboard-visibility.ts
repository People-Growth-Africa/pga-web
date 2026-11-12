import type { Role } from './db.js';

/**
 * What each dashboard role may see.
 *
 * These rules are applied on the server before a response is written, not in
 * the browser. A key that a role may not see is absent from the JSON, so a
 * someone reading the network response cannot find it either.
 *
 * Deliberately independent of the access-grant system: a grant for
 * `consultation.update` does not reveal the consultation pipeline. The pipeline
 * is for HR managers and the super administrator only; bot analytics and the
 * traffic breakdown are for administrators (the super administrator is an
 * administrator) only.
 */
export type DashboardViewer = {
  role: Role;
  isSuperAdmin: boolean;
};

export function canViewConsultationPipeline(viewer: DashboardViewer): boolean {
  return viewer.role === 'hr_manager' || (viewer.role === 'admin' && viewer.isSuperAdmin);
}

/** Administrators and super administrators. A super administrator is an admin. */
export function canViewBotAnalytics(viewer: DashboardViewer): boolean {
  return viewer.role === 'admin';
}

/** Top pages, referrers, devices and countries follow the bot rule. */
export function canViewTrafficDimensions(viewer: DashboardViewer): boolean {
  return canViewBotAnalytics(viewer);
}

type StatsBody = { consultationPipeline?: unknown } & Record<string, unknown>;

export function filterStatsForViewer<T extends StatsBody>(body: T, viewer: DashboardViewer): T {
  if (canViewConsultationPipeline(viewer)) return body;
  const { consultationPipeline: _omitted, ...rest } = body;
  return rest as T;
}

type TrafficBody = {
  suspectedBots?: unknown;
  pages?: unknown;
  referrers?: unknown;
  countries?: unknown;
  devices?: unknown;
} & Record<string, unknown>;

export function filterTrafficForViewer<T extends TrafficBody>(
  body: T,
  viewer: DashboardViewer,
): T {
  if (canViewBotAnalytics(viewer)) return body;
  const {
    suspectedBots: _suspectedBots,
    pages: _pages,
    referrers: _referrers,
    countries: _countries,
    devices: _devices,
    ...rest
  } = body;
  return rest as T;
}
