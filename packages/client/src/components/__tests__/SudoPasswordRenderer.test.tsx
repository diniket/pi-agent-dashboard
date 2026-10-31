import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SudoPasswordRenderer } from "../interactive-renderers/SudoPasswordRenderer.js";

afterEach(cleanup);

const baseProps = {
  requestId: "sudo-prompt-1",
  method: "input",
  params: { title: "sudo: local password required", message: "Test requested" },
};

describe("SudoPasswordRenderer", () => {
  it("masks the field and sends the answer without displaying it after submission", () => {
    const onRespond = vi.fn();
    const { container } = render(
      <SudoPasswordRenderer {...baseProps} status="pending" onRespond={onRespond} onCancel={vi.fn()} />,
    );
    const input = container.querySelector('input[type="password"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.autocomplete).toBe("off");

    fireEvent.change(input, { target: { value: "not-a-real-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onRespond).toHaveBeenCalledWith({ value: "not-a-real-secret" });
    expect(container.textContent).not.toContain("not-a-real-secret");
    const clearedInput = container.querySelector('input[type="password"]') as HTMLInputElement | null;
    expect(clearedInput?.value).toBe("");
  });

  it("never renders a submitted password in the resolved state", () => {
    const { container } = render(
      <SudoPasswordRenderer
        {...baseProps}
        status="resolved"
        result={{ value: "not-a-real-secret" }}
        onRespond={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container.textContent).not.toContain("not-a-real-secret");
    expect(container.querySelector('input[type="password"]')).toBeNull();
  });
});
