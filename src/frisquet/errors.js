// -----------------------------------------------------------------------------
// The failures of the Frisquet Connect cloud, sorted by what the integration
// does about them:
//   - AuthError        : the account refused (wrong e-mail or password): the
//                        user must act, logging in again would not help;
//   - UnavailableError : 5xx, 429, network error, timeout, maintenance: wait
//                        for the next cycle;
//   - ApiError         : anything else (unexpected status or payload).
// -----------------------------------------------------------------------------

export class AuthError extends Error {
  constructor(message = 'Frisquet Connect refused the e-mail or the password') {
    super(message);
    this.name = 'AuthError';
  }
}

export class UnavailableError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, maintenance?: boolean }} [details]
   */
  constructor(message, { status, maintenance = false } = {}) {
    super(message);
    this.name = 'UnavailableError';
    this.status = status;
    this.maintenance = maintenance;
  }
}

export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {number} [status]
   */
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}
