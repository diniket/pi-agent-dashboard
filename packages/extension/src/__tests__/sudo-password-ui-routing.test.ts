import { describe, expect, it, vi } from "vitest";
import { patchUiForPromptBus } from "../bridge-handlers/ui-prompt-patch.js";
import { makeStubInstance } from "./helpers/bridge-instance-stub.js";

const MARKER = "__piDashboardSudoPasswordPrompt";

describe("pi-sudo Dashboard password routing", () => {
  it("routes only the tagged password prompt through PromptBus without putting a secret in request metadata", async () => {
    const originalCustom = vi.fn();
    const requestWithId = vi.fn(async () => ({ cancelled: false, answer: "not-a-real-secret" }));
    const adapters: any[] = [];
    const bus = {
      requestWithId,
      cancel: vi.fn(),
      request: vi.fn(),
      registerAdapter: vi.fn((adapter) => adapters.push(adapter)),
    };
    const { inst } = makeStubInstance({ cachedHasUI: false } as any);
    const ctx: any = { hasUI: false, mode: "rpc", ui: { custom: originalCustom } };
    patchUiForPromptBus(inst, ctx, bus as any);

    const factory = Object.assign(() => ({}), {
      [MARKER]: {
        kind: "password",
        title: "sudo: local password required",
        subtitle: "Test requested",
        timeoutMs: 30_000,
      },
    });

    await expect(ctx.ui.custom(factory)).resolves.toEqual({ kind: "ok", password: "not-a-real-secret" });
    expect(originalCustom).not.toHaveBeenCalled();
    expect(requestWithId).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      pipeline: "command",
      type: "input",
      question: "sudo: local password required",
      metadata: expect.objectContaining({ kind: "pi-sudo-password", message: "Test requested" }),
    }), 31_000);
    expect(JSON.stringify(requestWithId.mock.calls[0])).not.toContain("not-a-real-secret");

    const adapter = adapters.find((candidate) => candidate.name === "pi-sudo-password");
    expect(adapter).toBeTruthy();
    expect(adapter.onRequest({
      id: "p1", pipeline: "command", type: "input", question: "sudo?",
      metadata: { kind: "pi-sudo-password" },
    })).toEqual({ component: { type: "pi-sudo-password", props: {} }, placement: "inline" });
    expect(adapter.onRequest({ id: "p2", pipeline: "command", type: "input", question: "ordinary" })).toBeUndefined();
  });

  it("keeps the existing custom TUI flow for ordinary Pi/Pi-Bolt TUI sessions", async () => {
    const originalCustom = vi.fn(async (factory: () => unknown) => factory());
    const bus = { request: vi.fn(), requestWithId: vi.fn(), cancel: vi.fn(), registerAdapter: vi.fn() };
    const { inst } = makeStubInstance({ cachedHasUI: true } as any);
    const ctx: any = { hasUI: true, mode: "tui", ui: { custom: originalCustom } };
    patchUiForPromptBus(inst, ctx, bus as any);
    const factory = Object.assign(() => "tui-result", { [MARKER]: { kind: "password" } });

    await expect(ctx.ui.custom(factory)).resolves.toBe("tui-result");
    expect(originalCustom).toHaveBeenCalledWith(factory, undefined);
    expect(bus.requestWithId).not.toHaveBeenCalled();
  });
});
