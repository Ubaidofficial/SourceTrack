# workflow
- When unsure about any detail, write `TODO: confirm` instead of guessing or inventing values. Confidence: 0.85
- Always perform a full audit at the end of each session — verify nothing broke, check all changed files against SYSTEM.md, and output a structured audit report. Do not end until the audit is complete. Confidence: 0.85
- Fix all errors before finishing a session — do not leave known broken builds, syntax errors, or runtime errors. Confidence: 0.80
- Read SYSTEM.md, PROGRESS.md, and DEEPSEEK.md before starting any implementation work. Confidence: 0.80
- Do not claim deployment or production verification is complete without confirming actual build/deploy logs showing success. Confidence: 0.75
- In session output, explicitly separate into "Verified in code", "Inferred but not fully verified", and "Not implemented" rather than blending facts with assumptions. Confidence: 0.70
- Execute the highest-priority incomplete task and stop after one substantial task unless a second is trivially finishable. Do not offer multiple directions, replan the roadmap, or ask which task to choose. Confidence: 0.70
- Before writing any code, produce an explicit internal checkpoint: list files inspected, the chosen implementation path, and which alternative paths were rejected. Confidence: 0.70
- Stop and report a precise blocker when the repo cannot support a narrow improvement without major rewrite, or when implementation would require misleading UI/docs claims. Do not proceed with speculative or overstated work. Confidence: 0.65
