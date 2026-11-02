import { describe, expect, it, vi } from "vitest";
import { patchUiForPromptBus } from "../bridge-handlers/ui-prompt-patch.js";
import { PromptBus } from "../prompt-bus.js";
import { makeStubInstance } from "./helpers/bridge-instance-stub.js";

const MARKER = "__piDashboardSudoPasswordPrompt";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

function makeBus() {
  const request = deferred<any>();
  const adapters: any[] = [];
  const bus = {
    requestWithId: vi.fn((_id: string, _request: unknown, _timeoutMs?: number) => request.promise),
    cancel: vi.fn((id: string) => request.resolve({ id, cancelled: true, source: "__bus__" })),
    request: vi.fn(),
    registerAdapter: vi.fn((adapter) => adapters.push(adapter)),
  };
  return { bus, request, adapters };
}

function sudoFactory(onSubmit?: (result: unknown) => void, timeoutMs = 30_000) {
  return Object.assign((_tui: unknown, _theme: unknown, _keybindings: unknown, done: (result: unknown) => void) => {
    onSubmit?.(done);
    return { render: () => [], handleInput: () => {} };
  }, {
    [MARKER]: {
      kind: "password",
      title: "sudo: local password required",
      subtitle: "Test requested",
      timeoutMs,
    },
  });
}

describe("pi-sudo Dashboard password routing", () => {
  it("routes the tagged headless password prompt through PromptBus without secret metadata", async () => {
    const originalCustom = vi.fn();
    const { bus, request, adapters } = makeBus();
    const { inst } = makeStubInstance({ cachedHasUI: false } as any);
    const ctx: any = { hasUI: false, mode: "rpc", ui: { custom: originalCustom } };
    patchUiForPromptBus(inst, ctx, bus as any);

    const factory = sudoFactory();
    const prompt = ctx.ui.custom(factory);
    request.resolve({ cancelled: false, answer: "dashboard-test-secret", source: "dashboard" });

    await expect(prompt).resolves.toEqual({ kind: "ok", password: "dashboard-test-secret" });
    expect(originalCustom).not.toHaveBeenCalled();
    expect(bus.requestWithId).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      pipeline: "command",
      type: "input",
      question: "sudo: local password required",
      metadata: expect.objectContaining({ kind: "pi-sudo-password", message: "Test requested" }),
    }), 31_000);
    expect(JSON.stringify(bus.requestWithId.mock.calls[0])).not.toContain("dashboard-test-secret");

    const adapter = adapters.find((candidate) => candidate.name === "pi-sudo-password");
    expect(adapter).toBeTruthy();
    expect(adapter.onRequest({
      id: "p1", pipeline: "command", type: "input", question: "sudo?",
      metadata: { kind: "pi-sudo-password" },
    })).toEqual({ component: { type: "pi-sudo-password", props: {} }, placement: "inline" });
    expect(adapter.onRequest({ id: "p2", pipeline: "command", type: "input", question: "ordinary" })).toBeUndefined();
  });

  it("shows the tagged prompt in TUI and Dashboard, and dismisses TUI when Dashboard wins", async () => {
    const native = deferred<unknown>();
    let submitTui!: (result: unknown) => void;
    const originalCustom = vi.fn((wrappedFactory: any) => {
      wrappedFactory({}, {}, {}, native.resolve);
      return native.promise;
    });
    const { bus, request } = makeBus();
    const { inst } = makeStubInstance({ cachedHasUI: true } as any);
    const ctx: any = { hasUI: true, mode: "tui", ui: { custom: originalCustom } };
    patchUiForPromptBus(inst, ctx, bus as any);

    const prompt = ctx.ui.custom(sudoFactory((done) => { submitTui = done as typeof submitTui; }));
    expect(originalCustom).toHaveBeenCalledOnce();
    expect(bus.requestWithId).toHaveBeenCalledOnce();

    request.resolve({ cancelled: false, answer: "dashboard-test-secret", source: "dashboard" });
    await expect(prompt).resolves.toEqual({ kind: "ok", password: "dashboard-test-secret" });
    await expect(native.promise).resolves.toEqual({ kind: "cancelled" });
    expect(JSON.stringify(bus.requestWithId.mock.calls[0])).not.toContain("dashboard-test-secret");
    expect(submitTui).toBeTypeOf("function");
  });

  it("uses the TUI answer when it wins and cancels the Dashboard prompt", async () => {
    const native = deferred<unknown>();
    let submitTui!: (result: unknown) => void;
    const originalCustom = vi.fn((wrappedFactory: any) => {
      wrappedFactory({}, {}, {}, native.resolve);
      return native.promise;
    });
    const { bus, request } = makeBus();
    const { inst } = makeStubInstance({ cachedHasUI: true } as any);
    const ctx: any = { hasUI: true, mode: "tui", ui: { custom: originalCustom } };
    patchUiForPromptBus(inst, ctx, bus as any);

    const prompt = ctx.ui.custom(sudoFactory((done) => { submitTui = done as typeof submitTui; }));
    submitTui({ kind: "ok", password: "tui-test-secret" });

    await expect(prompt).resolves.toEqual({ kind: "ok", password: "tui-test-secret" });
    await expect(native.promise).resolves.toEqual({ kind: "ok", password: "tui-test-secret" });
    expect(bus.cancel).toHaveBeenCalledWith(bus.requestWithId.mock.calls[0][0]);
    await expect(request.promise).resolves.toMatchObject({ cancelled: true, source: "__bus__" });
    expect(JSON.stringify(bus.requestWithId.mock.calls[0])).not.toContain("tui-test-secret");
  });

  it("lets the native TUI resolve its own timeout", async () => {
    const native = deferred<unknown>();
    let submitTui!: (result: unknown) => void;
    const originalCustom = vi.fn((wrappedFactory: any) => {
      wrappedFactory({}, {}, {}, native.resolve);
      return native.promise;
    });
    const { bus, request } = makeBus();
    const { inst } = makeStubInstance({ cachedHasUI: true } as any);
    const ctx: any = { hasUI: true, mode: "tui", ui: { custom: originalCustom } };
    patchUiForPromptBus(inst, ctx, bus as any);

    const prompt = ctx.ui.custom(sudoFactory((done) => { submitTui = done as typeof submitTui; }, 10));
    await new Promise((resolve) => setTimeout(resolve, 20));
    submitTui({ kind: "timeout" });

    await expect(prompt).resolves.toEqual({ kind: "timeout" });
    await expect(native.promise).resolves.toEqual({ kind: "timeout" });
    await expect(request.promise).resolves.toMatchObject({ cancelled: true, source: "__bus__" });
  });

  it("never opens an unmasked native input for a mirrored password prompt", async () => {
    const native = deferred<unknown>();
    const input = vi.fn(() => new Promise<string>(() => {}));
    const originalCustom = vi.fn((wrappedFactory: any) => {
      wrappedFactory({}, {}, {}, native.resolve);
      return native.promise;
    });
    const onDashboardRequest = vi.fn();
    const bus = new PromptBus({ onDashboardRequest });
    const { inst } = makeStubInstance({ cachedHasUI: true } as any);
    const ctx: any = { hasUI: true, mode: "tui", ui: { custom: originalCustom, input } };
    patchUiForPromptBus(inst, ctx, bus);

    const prompt = ctx.ui.custom(sudoFactory());
    const [{ request }] = bus.getPendingRequests();
    bus.respond({ id: request.id, answer: "dashboard-test-secret", source: "dashboard" });

    await expect(prompt).resolves.toEqual({ kind: "ok", password: "dashboard-test-secret" });
    await expect(native.promise).resolves.toEqual({ kind: "cancelled" });
    expect(input).not.toHaveBeenCalled();
    expect(onDashboardRequest).toHaveBeenCalledWith(
      expect.anything(), { type: "pi-sudo-password", props: {} }, "inline",
    );
    expect(bus.pendingCount).toBe(0);
  });

  it.each([
    { kind: "ok", password: "tui-test-secret" },
    { kind: "cancelled" },
    { kind: "timeout" },
  ])("settles the real bus when the TUI returns $kind", async (result) => {
    const native = deferred<unknown>();
    let submitTui!: (result: unknown) => void;
    const originalCustom = vi.fn((wrappedFactory: any) => {
      wrappedFactory({}, {}, {}, native.resolve);
      return native.promise;
    });
    const onDashboardCancel = vi.fn();
    const bus = new PromptBus({ onDashboardCancel });
    const { inst } = makeStubInstance({ cachedHasUI: true } as any);
    const ctx: any = { hasUI: true, mode: "tui", ui: { custom: originalCustom } };
    patchUiForPromptBus(inst, ctx, bus);

    const prompt = ctx.ui.custom(sudoFactory((done) => { submitTui = done as typeof submitTui; }));
    const [{ request }] = bus.getPendingRequests();
    submitTui(result);
    // A late Dashboard answer must not replace the native result.
    bus.respond({ id: request.id, answer: "late-test-secret", source: "dashboard" });

    await expect(prompt).resolves.toEqual(result);
    await expect(native.promise).resolves.toEqual(result);
    expect(onDashboardCancel).toHaveBeenCalledExactlyOnceWith(request.id);
    expect(bus.pendingCount).toBe(0);
  });

  it("dismisses both native and Dashboard prompts on abort", async () => {
    const native = deferred<unknown>();
    const originalCustom = vi.fn((wrappedFactory: any) => {
      wrappedFactory({}, {}, {}, native.resolve);
      return native.promise;
    });
    const onDashboardCancel = vi.fn();
    const bus = new PromptBus({ onDashboardCancel });
    const { inst } = makeStubInstance({ cachedHasUI: true } as any);
    const ctx: any = { hasUI: true, mode: "tui", ui: { custom: originalCustom } };
    patchUiForPromptBus(inst, ctx, bus);
    const controller = new AbortController();
    const factory = sudoFactory();
    Object.assign(factory[MARKER], { signal: controller.signal });

    const prompt = ctx.ui.custom(factory);
    const [{ request }] = bus.getPendingRequests();
    controller.abort();

    await expect(prompt).resolves.toEqual({ kind: "cancelled" });
    await expect(native.promise).resolves.toEqual({ kind: "cancelled" });
    expect(onDashboardCancel).toHaveBeenCalledExactlyOnceWith(request.id);
    expect(bus.pendingCount).toBe(0);
  });

  // Regression: a Dashboard-spawned session runs pi in RPC mode, where `ctx.hasUI`
  // is TRUE (pi documents `hasUI` as "true in TUI and RPC modes") but the native
  // `ctx.ui.custom` primitive is a no-op returning `undefined` (pi rpc-mode.js:
  // `async custom() { return undefined; }`). The mirror arm keyed only on
  // `cachedHasUI === true`, so it treated RPC as a real terminal: the no-op
  // resolved `undefined`, won the race, cancelled the Dashboard request and the
  // caller read `.kind` off `undefined` ->
  // "TypeError: Cannot read properties of undefined (reading 'kind')".
  // Terminal-only UI must be guarded on `ctx.mode === "tui"`, per the pi type docs.
  describe("RPC session (dialog-capable UI, no terminal)", () => {
    // Faithful stand-in for pi's RPC implementation.
    const rpcNoopCustom = () => vi.fn(async () => undefined);

    it("routes the tagged password prompt through the bus, never the native no-op", async () => {
      const originalCustom = rpcNoopCustom();
      const onDashboardRequest = vi.fn();
      const bus = new PromptBus({ onDashboardRequest });
      const { inst } = makeStubInstance({ cachedHasUI: true } as any);
      const ctx: any = { hasUI: true, mode: "rpc", ui: { custom: originalCustom } };
      patchUiForPromptBus(inst, ctx, bus);

      const prompt = ctx.ui.custom(sudoFactory());

      expect(originalCustom).not.toHaveBeenCalled();
      const [{ request }] = bus.getPendingRequests();
      expect(request.metadata).toMatchObject({ kind: "pi-sudo-password" });
      expect(onDashboardRequest).toHaveBeenCalledWith(
        expect.anything(), { type: "pi-sudo-password", props: {} }, "inline",
      );

      bus.respond({ id: request.id, answer: "dashboard-test-secret", source: "dashboard" });
      await expect(prompt).resolves.toEqual({ kind: "ok", password: "dashboard-test-secret" });
      expect(bus.pendingCount).toBe(0);
    });

    it("does not let the native no-op settle or cancel the Dashboard request", async () => {
      const originalCustom = rpcNoopCustom();
      const onDashboardCancel = vi.fn();
      const bus = new PromptBus({ onDashboardCancel });
      const { inst } = makeStubInstance({ cachedHasUI: true } as any);
      const ctx: any = { hasUI: true, mode: "rpc", ui: { custom: originalCustom } };
      patchUiForPromptBus(inst, ctx, bus);

      const prompt = ctx.ui.custom(sudoFactory());
      // Let the native no-op resolve: a `undefined` result must NOT be able to
      // close the request, otherwise the Dashboard dialog vanishes in one tick.
      for (let i = 0; i < 8; i++) await Promise.resolve();

      expect(onDashboardCancel).not.toHaveBeenCalled();
      expect(bus.pendingCount).toBe(1);

      const [{ request }] = bus.getPendingRequests();
      bus.respond({ id: request.id, answer: "dashboard-test-secret", source: "dashboard" });
      await expect(prompt).resolves.toEqual({ kind: "ok", password: "dashboard-test-secret" });
      expect(bus.pendingCount).toBe(0);
    });

    it("resolves a tagged RPC prompt with a `kind`, never with undefined", async () => {
      const originalCustom = rpcNoopCustom();
      const bus = new PromptBus({});
      const { inst } = makeStubInstance({ cachedHasUI: true } as any);
      const ctx: any = { hasUI: true, mode: "rpc", ui: { custom: originalCustom } };
      patchUiForPromptBus(inst, ctx, bus);

      const prompt = ctx.ui.custom(sudoFactory());
      const [{ request }] = bus.getPendingRequests();
      bus.respond({ id: request.id, cancelled: true, source: "dashboard" });

      // The caller does `result.kind`; a settled `undefined` is the crash.
      const result = await prompt;
      expect(result).toBeDefined();
      expect(result).toEqual({ kind: "cancelled" });
    });

    it("keeps ordinary untagged custom prompts on the native path", async () => {
      const originalCustom = rpcNoopCustom();
      const bus = new PromptBus({});
      const { inst } = makeStubInstance({ cachedHasUI: true } as any);
      const ctx: any = { hasUI: true, mode: "rpc", ui: { custom: originalCustom } };
      patchUiForPromptBus(inst, ctx, bus);

      await ctx.ui.custom(() => "untagged-result");
      expect(originalCustom).toHaveBeenCalledOnce();
      expect(bus.pendingCount).toBe(0);
    });
  });

  it("keeps ordinary custom TUI prompts native", async () => {
    const originalCustom = vi.fn(async (factory: () => unknown) => factory());
    const { bus } = makeBus();
    const { inst } = makeStubInstance({ cachedHasUI: true } as any);
    const ctx: any = { hasUI: true, mode: "tui", ui: { custom: originalCustom } };
    patchUiForPromptBus(inst, ctx, bus as any);
    const factory = () => "tui-result";

    await expect(ctx.ui.custom(factory)).resolves.toBe("tui-result");
    expect(originalCustom).toHaveBeenCalledWith(factory, undefined);
    expect(bus.requestWithId).not.toHaveBeenCalled();
  });
});
