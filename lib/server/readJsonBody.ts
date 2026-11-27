export type JsonBodyFailureStatus = 400 | 408 | 413 | 415 | 499;

export const DEFAULT_JSON_BODY_TIMEOUT_MS = 10_000;

export type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; status: JsonBodyFailureStatus; error: string };

/** Read JSON while enforcing a byte limit on the actual request stream. */
export async function readBoundedJson(
  request: Request,
  maxBytes: number,
  maxDurationMs = DEFAULT_JSON_BODY_TIMEOUT_MS,
): Promise<JsonBodyResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new RangeError("maxBytes must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(maxDurationMs) || maxDurationMs < 1) {
    throw new RangeError("maxDurationMs must be a positive safe integer.");
  }

  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    return { ok: false, status: 415, error: "Content-Type must be application/json." };
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) {
      return { ok: false, status: 400, error: "Content-Length is invalid." };
    }
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length)) {
      return { ok: false, status: 400, error: "Content-Length is invalid." };
    }
    if (length > maxBytes) {
      return { ok: false, status: 413, error: "Request body exceeds the allowed size." };
    }
  }

  if (!request.body) {
    return { ok: false, status: 400, error: "Request body must contain valid JSON." };
  }

  const reader = request.body.getReader();
  if (request.signal.aborted) {
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
    return { ok: false, status: 499, error: "Request body was cancelled." };
  }

  // Keep a bounded contiguous buffer instead of retaining every stream chunk.
  // A peer can send a valid-size body as millions of one-byte chunks, which
  // would otherwise make chunk-object overhead far larger than the byte cap.
  let bytes = new Uint8Array(Math.min(maxBytes, 8_192));
  let totalBytes = 0;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  let requestAborted = false;
  let abortListener = () => undefined;

  const readBody = async (): Promise<JsonBodyResult> => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        void reader.cancel().catch(() => undefined);
        return { ok: false, status: 413, error: "Request body exceeds the allowed size." };
      }
      if (totalBytes > bytes.byteLength) {
        const capacity = Math.min(
          maxBytes,
          Math.max(totalBytes, Math.max(1, bytes.byteLength) * 2),
        );
        const expanded = new Uint8Array(capacity);
        expanded.set(bytes.subarray(0, totalBytes - value.byteLength));
        bytes = expanded;
      }
      bytes.set(value, totalBytes - value.byteLength);
    }

    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, totalBytes));
    return { ok: true, value: JSON.parse(text) as unknown };
  };

  const bodyRead = readBody();
  const deadline = new Promise<JsonBodyResult>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      reject(new Error("request body timeout"));
    }, maxDurationMs);
  });
  const aborted = new Promise<never>((_resolve, reject) => {
    abortListener = () => {
      requestAborted = true;
      reject(new Error("request body cancelled"));
    };
    request.signal.addEventListener("abort", abortListener, { once: true });
    if (request.signal.aborted) abortListener();
  });

  try {
    return await Promise.race([bodyRead, deadline, aborted]);
  } catch {
    if (timedOut || requestAborted) {
      void reader.cancel().catch(() => undefined);
      // Allow the cancelled read loop to settle before releasing its reader lock.
      await bodyRead.catch(() => undefined);
      return timedOut
        ? { ok: false, status: 408, error: "Request body was not received in time." }
        : { ok: false, status: 499, error: "Request body was cancelled." };
    }
    return { ok: false, status: 400, error: "Request body must contain valid JSON." };
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    request.signal.removeEventListener("abort", abortListener);
    reader.releaseLock();
  }
}
