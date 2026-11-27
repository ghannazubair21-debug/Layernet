import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { transactionService } from "@/lib/transactionService";
import { TRANSACTIONS_UPDATED_EVENT } from "@/lib/transactionStorage";
import { useStoredTransactions } from "@/lib/useStoredTransactions";

describe("useStoredTransactions", () => {
  afterEach(() => vi.restoreAllMocks());

  it("surfaces read failures and recovers after storage becomes readable", async () => {
    vi.spyOn(transactionService, "list")
      .mockRejectedValueOnce(new Error("storage parse failure"))
      .mockResolvedValueOnce([]);
    const { result } = renderHook(() => useStoredTransactions());

    await waitFor(() => expect(result.current.loadError).toContain("Existing local data was left unchanged"));
    expect(result.current.transactions).toEqual([]);
    expect(result.current.isLoading).toBe(false);

    await act(async () => {
      window.dispatchEvent(new CustomEvent(TRANSACTIONS_UPDATED_EVENT));
    });
    await waitFor(() => expect(result.current.loadError).toBeNull());
    expect(result.current.isLoading).toBe(false);
  });
});
