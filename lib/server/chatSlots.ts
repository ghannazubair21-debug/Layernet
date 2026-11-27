// Process-local only. This bounds concurrent provider calls in one server
// process; a shared limiter is still required for multi-instance deployments.
const MAX_CONCURRENT_CHAT_REQUESTS = 2;
let activeChatRequests = 0;

export function acquireChatSlot(): (() => void) | null {
  if (activeChatRequests >= MAX_CONCURRENT_CHAT_REQUESTS) return null;

  activeChatRequests += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeChatRequests -= 1;
  };
}
