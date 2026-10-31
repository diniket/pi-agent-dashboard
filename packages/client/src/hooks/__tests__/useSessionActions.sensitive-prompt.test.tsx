import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSessionActions } from "../useSessionActions.js";

describe("useSessionActions — sensitive PromptBus answers", () => {
  it("sends only the PromptBus answer and scrubs the answer from session state", () => {
    const secret = "not-a-real-secret";
    const send = vi.fn((_message: { type: string }, _options?: { queue?: boolean }) => ({ status: "handed" as const }));
    let states = new Map<string, any>([["s1", {
      interactiveRequests: [{ requestId: "p1", status: "pending" }],
      messages: [{ id: "ui-p1", args: { requestId: "p1", status: "pending" } }],
    }]]);
    const setSessionStates = (update: (current: Map<string, any>) => Map<string, any>) => { states = update(states); };
    const actions = renderHook(() => useSessionActions({
      selectedId: "s1",
      send,
      navigate: vi.fn(),
      setMobileOpen: vi.fn(),
      sessions: new Map(),
      setSessions: vi.fn(),
      setSessionStates: setSessionStates as any,
      sessionStatesRef: { current: states } as any,
      setSpawningCwds: vi.fn(),
      setTerminals: vi.fn(),
      clearSpawningCwd: vi.fn(),
      spawnTimeoutsRef: { current: new Map() },
      pendingTerminalCwdRef: { current: null },
      terminals: new Map(),
      pendingSpawnsRef: { current: new Map() },
    })).result.current;

    actions.handleRespondToUi("p1", { value: secret }, false, true);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: "prompt_response", promptId: "p1", answer: secret,
    }), { queue: false });
    expect(send.mock.calls.some(([message]) => message.type === "extension_ui_response")).toBe(false);
    const nextState = states.get("s1");
    expect(nextState.interactiveRequests[0]).toMatchObject({ status: "resolved", result: undefined });
    expect(nextState.messages[0].args).toMatchObject({ status: "resolved", result: undefined });
    expect(JSON.stringify(nextState)).not.toContain(secret);
  });
});
