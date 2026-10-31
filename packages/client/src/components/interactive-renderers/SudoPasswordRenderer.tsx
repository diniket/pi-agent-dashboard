import { useRef, useState } from "react";
import { t as i18nT } from "../../lib/i18n/i18n.js";
import { InlineMarkdown } from "./InlineMarkdown.js";
import type { InteractiveRendererProps } from "./types.js";

/** Ephemeral, masked input for the pi-sudo PromptBus component. */
export function SudoPasswordRenderer({ params, status, onRespond, onCancel }: InteractiveRendererProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const title = typeof params.title === "string" ? params.title : "sudo password required";
  const message = typeof params.message === "string" ? params.message : undefined;

  const submit = () => {
    if (status !== "pending") return;
    const password = value;
    setValue("");
    if (inputRef.current) inputRef.current.value = "";
    onRespond({ value: password });
  };

  if (status !== "pending") {
    return (
      <div className="mx-4 my-1 p-2 bg-[var(--bg-hover)] rounded text-xs">
        <span className="text-[var(--text-secondary)]"><InlineMarkdown content={title} /></span>
        <span className="ml-2 text-[var(--text-tertiary)]">
          {status === "resolved" ? "Password submitted" : status === "cancelled" ? "Cancelled" : "Dismissed"}
        </span>
      </div>
    );
  }

  return (
    <div className="mx-4 my-2 p-3 bg-[var(--bg-hover)] border border-[var(--border-secondary)] rounded-lg">
      <div className="text-sm font-medium text-[var(--text-primary)]"><InlineMarkdown content={title} /></div>
      {message && <div className="mt-1 mb-3 text-xs text-[var(--text-secondary)]"><InlineMarkdown content={message} /></div>}
      <input
        ref={inputRef}
        type="password"
        value={value}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        autoFocus
        aria-label="sudo password"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setValue("");
            if (inputRef.current) inputRef.current.value = "";
            onCancel();
          }
        }}
        className="w-full px-2.5 py-2 text-sm rounded bg-[var(--bg-primary)] border border-[var(--border-secondary)] text-[var(--text-primary)] outline-none focus:border-[var(--focus-ring)]"
      />
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={submit} className="px-3 py-1 text-xs rounded bg-[var(--accent-primary)] hover:opacity-90 text-white">
          {i18nT("common.submit", undefined, "Submit")}
        </button>
        <button type="button" onClick={() => { setValue(""); if (inputRef.current) inputRef.current.value = ""; onCancel(); }} className="px-3 py-1 text-xs rounded border border-[var(--border-secondary)] text-[var(--text-secondary)]">
          {i18nT("common.cancel", undefined, "Cancel")}
        </button>
      </div>
    </div>
  );
}
