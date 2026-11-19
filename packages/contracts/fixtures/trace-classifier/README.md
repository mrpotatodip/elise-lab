# Trace classifier fixture

Recorded-shape output of `claude --output-format stream-json --verbose`, one JSON object per line, with every value replaced by a placeholder: no real code, path, command or secret.

`agent-stream.expected.json` lists the labels each line must give. The Runner's classifier (Rust, `apps/elise-runner-cli/core/src/trace.rs`) and the cloud's (TypeScript) read both files and must agree. The file holds an unknown line type, an unknown tool name (`calling_tool`), a cut-off line and a line that is not JSON: apart from the unknown tool, they give no label.

Labels are the values of `TRACE_LABEL_VALUES` in `packages/contracts/src/elise/enums.ts`. Tool mapping: Read and Glob give `reading_files`, Grep `searching`, Bash `running_command`, Write, Edit, MultiEdit and NotebookEdit `writing`, any other tool `calling_tool`.
