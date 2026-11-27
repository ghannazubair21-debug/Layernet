// Process-local only: this gate does not provide distributed rate limiting.
let benchmarkSlotInUse = false;

export function acquireBenchmarkSlot(): (() => void) | null {
  if (benchmarkSlotInUse) return null;
  benchmarkSlotInUse = true;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    benchmarkSlotInUse = false;
  };
}
