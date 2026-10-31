# tui-prompt-adapter.ts — index

Production PromptBus adapter for Pi's TUI. Exports `createTuiPromptAdapter`, `TuiPromptUi`. Presents select/input/confirm/editor via captured unpatched UI; forwards confirm `metadata.message`; skips tagged `pi-sudo-password` prompts (masked native custom UI owns them); no multiselect arm. → see `tui-prompt-adapter.ts.AGENTS.md`
