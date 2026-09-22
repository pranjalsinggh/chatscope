/**
 * Maps backend/axios failures to calm, human-readable messages without
 * touching backend error behavior. Backend-provided messages are already
 * user-facing ("Only .txt files are allowed.", rate-limit notices...),
 * so they pass through; transport and generic errors get friendly copy.
 */
export function friendlyError(err: unknown, fallback: string): string {
  const anyErr = err as {
    response?: { status?: number; data?: { message?: unknown; error?: unknown } };
    message?: string;
  };

  const backendMessage = anyErr?.response?.data?.message;
  const backendError = anyErr?.response?.data?.error;

  if (typeof backendMessage === "string" && backendMessage.trim()) {
    return backendMessage;
  }

  if (typeof backendError === "string" && backendError.trim()) {
    return backendError;
  }

  // No HTTP response at all → network/transport failure
  if (anyErr?.response === undefined) {
    return "Can't reach the ChatScope server. Make sure the backend is running, then try again.";
  }

  const status = anyErr?.response?.status;

  if (status === 429) {
    return "Too many requests in a short time. Take a short break and try again in a few minutes.";
  }

  if (status === 413) {
    return "That file is too large. The maximum size is 10 MB.";
  }

  if (status === 502 || status === 503 || status === 504) {
    return "The service is momentarily unavailable. Please try again in a moment.";
  }

  if (typeof status === "number" && status >= 500) {
    return "Something went wrong on our side while processing that. Please try again.";
  }

  return fallback;
}
