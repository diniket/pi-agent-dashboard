import { BatchRenderer } from "./BatchRenderer.js";
import { ConfirmRenderer } from "./ConfirmRenderer.js";
import { EditorRenderer } from "./EditorRenderer.js";
import { GenericInteractiveRenderer } from "./GenericInteractiveRenderer.js";
import { InputRenderer } from "./InputRenderer.js";
import { MultiselectRenderer } from "./MultiselectRenderer.js";
import { NotifyRenderer } from "./NotifyRenderer.js";
import { SelectRenderer } from "./SelectRenderer.js";
import { SudoPasswordRenderer } from "./SudoPasswordRenderer.js";
import type { InteractiveRenderer } from "./types.js";

const renderers = new Map<string, InteractiveRenderer>([
  ["confirm", ConfirmRenderer],
  ["select", SelectRenderer],
  ["input", InputRenderer],
  ["editor", EditorRenderer],
  ["multiselect", MultiselectRenderer],
  ["notify", NotifyRenderer],
  ["batch", BatchRenderer],
]);

/** Register a custom interactive renderer for a method */
export function registerInteractiveRenderer(method: string, renderer: InteractiveRenderer): void {
  renderers.set(method, renderer);
}

/** Get the renderer for an interactive UI method, falling back to GenericInteractiveRenderer */
export function getInteractiveRenderer(method: string, componentType?: string): InteractiveRenderer {
  if (componentType === "pi-sudo-password") return SudoPasswordRenderer;
  return renderers.get(method) ?? GenericInteractiveRenderer;
}
