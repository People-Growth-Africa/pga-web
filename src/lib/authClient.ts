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
export type Role =
  | 'talent'
  | 'employer'
  | 'manager'
  | 'admin'
  | 'project_manager'
  | 'hr_manager'
  | 'content_manager';

/** Staff who use the administrator portal. Content managers and legacy
 * 'manager' rows are excluded; the migration maps those rows to real roles. */
export const ADMIN_PORTAL_ROLES: Role[] = ['admin', 'project_manager', 'hr_manager'];

/** The content desk is exclusively for content managers. Administrators have
 * their own oversight route under /admin. */
export const CONTENT_EDITOR_ROLES: Role[] = ['content_manager'];

/** The content desk's own sign-in and pages. */
export const CONTENT_MANAGER_ROLES: Role[] = ['content_manager'];

/** Every staff account, across both portals. */
export const STAFF_ROLES: Role[] = [...ADMIN_PORTAL_ROLES, 'content_manager'];

export function isStaffRole(role: Role | undefined): boolean {
  return role !== undefined && STAFF_ROLES.includes(role);
}

export function isAdminPortalRole(role: Role | undefined): boolean {
  return role !== undefined && ADMIN_PORTAL_ROLES.includes(role);
}

export function isContentManagerRole(role: Role | undefined): boolean {
  return role === 'content_manager';
}

export function isContentEditorRole(role: Role | undefined): boolean {
  return role !== undefined && CONTENT_EDITOR_ROLES.includes(role);
}

export function isAdminRole(role: Role | undefined): boolean {
  return role === 'admin';
}

export function roleLabel(role: Role | undefined): string {
  if (role === 'admin') return 'Administrator';
  // A legacy row still needs a readable label before the migration maps it.
  if (role === 'manager') return 'Legacy manager (migrate me)';
  if (role === 'project_manager') return 'Project manager';
  if (role === 'hr_manager') return 'HR manager';
  if (role === 'content_manager') return 'Content manager';
  if (role === 'talent') return 'Talent';
  if (role === 'employer') return 'Employer';
  return 'Staff';
}

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
  /**
   * The account's own name. Null on staff rows created before names were
   * collected (and on talent/employer accounts, whose name lives in their
   * profile), so anything that greets a person by name has to cope with its
   * absence.
   */
  name?: string | null;
  /** Present on the login response when the account must set a new password. */
  mustChangePassword?: boolean;
  profile?: TalentProfile | EmployerProfile | null;
};

export type ApiFailure = {
  error: string;
  code: string;
  /** Per field messages keyed by input name, when the server rejected a value. */
  fields?: Record<string, string>;
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; failure: ApiFailure };

/**
 * Calls that were refused because the session is over.
 *
 * A manager session ends after an hour without activity, and the request that
 * discovers it may come from a dialog or a background refetch rather than from
 * something the page thought to wrap. Reporting it here means every one of them
 * ends the visit the same way, instead of leaving a manager clicking buttons on
 * a page the server has already stopped trusting.
 *
 * Only `/api/admin/` paths report: the same codes come back from `/api/auth/me`
 * on a normal signed-out load, and that is how the page starts, not news.
 */
const sessionEndedListeners = new Set<(failure: ApiFailure) => void>();

export function onSessionEnded(listener: (failure: ApiFailure) => void): () => void {
  sessionEndedListeners.add(listener);
  return () => {
    sessionEndedListeners.delete(listener);
  };
}

function isSessionEnded(failure: ApiFailure): boolean {
  return failure.code === 'session_expired' || failure.code === 'sign_in_required';
}

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
  if (role === 'content_manager') return '/content';
  if (isAdminPortalRole(role)) return '/admin/stats';
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
  init?: { method?: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH'; body?: unknown },
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
    const result: ApiResult<T> = {
      ok: false,
      failure: {
        error: failure.error ?? missingEndpointMessage(response.status),
        code: failure.code ?? (response.status === 405 ? 'method_not_allowed' : 'error'),
        ...(failure.fields ? { fields: failure.fields } : {}),
      },
    };

    if (
      (path.startsWith('/api/admin/') || path.startsWith('/api/content/')) &&
      isSessionEnded(result.failure)
    ) {
      for (const listener of sessionEndedListeners) listener(result.failure);
    }

    return result;
  } catch {
    return { ok: false, failure: NETWORK_FAILURE };
  }
}
