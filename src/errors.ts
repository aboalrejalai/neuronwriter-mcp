// Every error a tool can hit carries a `hint`: the next step for the agent.
// Tools turn these into `isError` results (see tools/result.ts).

export class NwError extends Error {
  constructor(message: string, readonly hint: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class SessionExpiredError extends NwError {
  constructor() {
    super(
      'The NeuronWriter session is missing or has expired.',
      'Ask the user to run `npm run login` in the neuronwriter-mcp folder (a browser window opens and they sign in themselves), then retry.',
    );
  }
}

export class PlanLimitError extends NwError {
  constructor(message: string) {
    super(message, 'The monthly limit is used up. Call nw_status to see usage and the reset date. Reuse an existing analysis (nw_list_queries) instead of creating a new one.');
  }
}

export class NotSupportedError extends NwError {
  constructor(feature: string, backend: string) {
    super(`${feature} is not available on the ${backend} backend.`, 'Use the session backend (NW_BACKEND=session) for this tool.');
  }
}

export class ConfirmationRequiredError extends NwError {
  constructor(cost: string) {
    super(
      `This call spends ${cost}.`,
      'Tell the user what it costs and ask for approval. If they agree, call the tool again with confirm: true.',
    );
  }
}

/** NeuronWriter answered, but with an error of its own (message passed through verbatim). */
export class NeuronWriterError extends NwError {
  constructor(message: string, hint = 'Check the arguments and try again. If it keeps failing, call nw_status to check the session.') {
    super(message, hint);
  }
}

/** Transient failure (HTTP 429 or 5xx): the limiter retries these with backoff. */
export class RetryableError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'RetryableError';
  }
}

const PLAN_LIMIT_PATTERNS = [/exceeds the number of/i, /limit (has been )?reached/i, /not enough (ai )?credits/i, /upgrade your plan/i];

export function isPlanLimitMessage(message: string): boolean {
  return PLAN_LIMIT_PATTERNS.some((pattern) => pattern.test(message));
}
