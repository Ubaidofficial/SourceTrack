# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# code-style
- Output complete files only — never use "rest unchanged" or truncated placeholders. Confidence: 0.85
- Do not invent provider URLs, model names, headers, env vars, package names, route names, tables, or PostHog properties. Use only values explicitly listed in prompts or SYSTEM.md. Confidence: 0.85
- Use console.error only inside catch blocks. Never use console.log. Confidence: 0.85
- All async code must use async/await + try/catch. No .then() chains. Confidence: 0.85

# safety
- Never expose raw internal errors (provider, parsing, PostHog) to the client. Always return sanitized error messages. Confidence: 0.85
- Never weaken or bypass security checks (auth, CSRF, CORS) unless explicitly required and justified in code comments. Confidence: 0.85

# ai
- All AI output must be deterministic: always set temperature to 0. Confidence: 0.85

# workflow
- When unsure about any detail, write `TODO: confirm` instead of guessing or inventing values. Confidence: 0.85
- Always perform a full audit at the end of each session — verify nothing broke, check all changed files against SYSTEM.md, and output a structured audit report. Do not end until the audit is complete. Confidence: 0.85
- Fix all errors before finishing a session — do not leave known broken builds, syntax errors, or runtime errors. Confidence: 0.80

