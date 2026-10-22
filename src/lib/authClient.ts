/**
 * The single client for /api/auth. Every call sends cookies, parses JSON, and
 * turns both HTTP failures and network failures into one result shape so forms
 * can show the server's message without guessing what went wrong.
 */

/**
 * The three account types.
 *
 * A manager account cannot be created by signing up: the API only ever writes
 * 'talent' or 'employer', and a database trigger refuses a manager row unless
 * the promotion script is running. This type widening is so a signed in manager
 * is recognised, not so one can be made here.
 */
export type Role = 'talent' | 'employer' | 'manager';

export type TalentProfile = {
  name: string;
  field: string;
  country: string | null;
  availability: string | null;
};

export type EmployerProfile = {
  name: string;
  company: string;
  needs: string[];
};

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
  emailVerified: boolean;
  /** Present on the signup response only; the profile carries it afterwards. */
  name?: string;
  profile?: TalentProfile | EmployerProfile | null;
};

export type ApiFailure = {
  error: string;
  code: string;
  /** Per field messages keyed by input name, when the server rejected a value. */
  fields?: Record<string, string>;
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; failure: ApiFailure };

export const NETWORK_FAILURE: ApiFailure = {
  error: 'Could not reach the server. Check your connection and try again.',
  code: 'network_error',
};

export const AVAILABILITY_OPTIONS = [
  { value: 'available_now', label: 'Available now' },
  { value: 'within_30_days', label: 'Within 30 days' },
  { value: 'just_exploring', label: 'Just exploring' },
] as const;

export const NEED_OPTIONS = [
  { value: 'find_talent', label: 'Find talent' },
  { value: 'book_consultation', label: 'Book a consultation' },
] as const;

/** Where each kind of account lands after signing in. */
export function dashboardPath(role: Role): string {
  if (role === 'manager') return '/admin/content';
  return role === 'talent' ? '/talent/dashboard' : '/employer/dashboard';
}

export function availabilityLabel(value: string | null): string {
  if (!value) return 'Not set';
  return AVAILABILITY_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function needLabel(value: string): string {
  return NEED_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

/**
 * What a non JSON answer to a form submit means, in words the visitor can act
 * on. Vercel's SPA rewrite serves index.html for any path that has no function
 * behind it, and refuses to POST to that static file: a405 with an HTML body is
 * how a deployment without its API answers a form, and blaming the connection
 * for it sends people looking in the wrong place.
 */
function missingEndpointMessage(status: number): string {
  if (status === 405) {
    return 'Nothing was sent: this deployment has no endpoint for the form yet (the server answered 405). Try again after the next deploy.';
  }
  return 'Something went wrong. Try again in a moment.';
}

export async function authRequest<T>(
  path: string,
  init?: { method?: 'GET' | 'POST' | 'DELETE' | 'PUT'; body?: unknown },
): Promise<ApiResult<T>> {
  const hasBody = init?.body !== undefined;

  try {
    const response = await fetch(path, {
      method: init?.method ?? 'POST',
      credentials: 'include',
      ...(hasBody ? { headers: { 'Content-Type': 'application/json' } } : {}),
      ...(hasBody ? { body: JSON.stringify(init.body) } : {}),
    });

    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (response.ok) {
      // A proxy or error page can answer 200 with HTML. Treating that as a
      // signed in response would be wrong, so require a JSON object.
      if (!payload || typeof payload !== 'object') {
        return {
          ok: false,
          failure: {
            error: 'The server sent an unexpected response. Try again in a moment.',
            code: 'bad_response',
          },
        };
      }
      return { ok: true, data: payload as T };
    }

    const failure = (payload && typeof payload === 'object' ? payload : {}) as Partial<ApiFailure>;
    return {
      ok: false,
      failure: {
        error: failure.error ?? missingEndpointMessage(response.status),
        code: failure.code ?? (response.status === 405 ? 'method_not_allowed' : 'error'),
        ...(failure.fields ? { fields: failure.fields } : {}),
      },
    };
  } catch {
    return { ok: false, failure: NETWORK_FAILURE };
  }
}
