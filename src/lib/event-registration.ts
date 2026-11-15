export type RegistrationCutoffEvent = {
  eventStart: string | null;
  registrationDeadline?: string | null;
};

export function getRegistrationCutoff(event: RegistrationCutoffEvent): number | null {
  const cutoff = event.registrationDeadline ?? event.eventStart;
  if (!cutoff) return null;

  const timestamp = Date.parse(cutoff);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function isRegistrationOpen(
  event: RegistrationCutoffEvent,
  now: Date | number | string,
): boolean {
  const cutoff = getRegistrationCutoff(event);
  const currentTime =
    now instanceof Date ? now.getTime() : typeof now === 'string' ? Date.parse(now) : now;
  return cutoff !== null && Number.isFinite(currentTime) && currentTime < cutoff;
}
