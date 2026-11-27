import type { UIMessageChunk } from "ai";

/** Chunks that mean the model has really started answering (or definitively failed/finished). */
const COMMITTING_CHUNKS = new Set<UIMessageChunk["type"]>(["text-delta", "reasoning-delta", "error", "finish"]);

/**
 * Restarts an attempt that was aborted before producing any content, which is how streamText reports its
 * `firstChunkMs` timeout (a stalled Gemini request). Chunks are held back until the attempt commits, so a
 * discarded attempt never reaches the client. Once content has streamed, nothing is retried: a partial
 * answer is never duplicated or replaced.
 */
export function withStallRetry(options: {
  startAttempt: (attempt: number) => ReadableStream<UIMessageChunk>;
  maxAttempts: number;
  /** False once the route timed out or the client cancelled; aborts then pass through unchanged. */
  canRetry: () => boolean;
  /** Called exactly once, when the combined stream ends or is cancelled. */
  onDone: () => void;
}): ReadableStream<UIMessageChunk> {
  let reader: ReadableStreamDefaultReader<UIMessageChunk> | null = null;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    options.onDone();
  };

  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      try {
        for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
          reader = options.startAttempt(attempt).getReader();
          const held: UIMessageChunk[] = [];
          let committed = false;
          let retry = false;

          for (;;) {
            const { done: ended, value } = await reader.read();
            if (ended) break;
            if (committed) {
              controller.enqueue(value);
              continue;
            }
            if (value.type === "abort" && attempt + 1 < options.maxAttempts && options.canRetry()) {
              retry = true;
              await reader.cancel().catch(() => undefined);
              break;
            }
            held.push(value);
            if (COMMITTING_CHUNKS.has(value.type) || value.type === "abort") {
              committed = true;
              held.forEach((chunk) => controller.enqueue(chunk));
            }
          }

          if (!retry) {
            // An attempt that ended without committing (e.g. only "start") still flushes what it produced.
            if (!committed) held.forEach((chunk) => controller.enqueue(chunk));
            break;
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        finish();
      }
    },
    async cancel(reason) {
      await reader?.cancel(reason).catch(() => undefined);
      finish();
    },
  });
}
