# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# code-style
See [code-style/taste.md](code-style/taste.md)
# safety
- Never expose raw internal errors (provider, parsing, PostHog) to the client. Always return sanitized error messages. Confidence: 0.85
- Never weaken or bypass security checks (auth, CSRF, CORS) unless explicitly required and justified in code comments. Confidence: 0.85

# ai
- All AI output must be deterministic: always set temperature to 0. Confidence: 0.85

# api
- All API responses must use the shape { success, data, error }. Confidence: 0.80

# code-style
- Use SourceTrack lime/charcoal/neutral palette for UI — avoid purple/blue SaaS gradients. Confidence: 0.70

# workflow
- When unsure about any detail, write `TODO: confirm` instead of guessing or inventing values. Confidence: 0.85
- Always perform a full audit at the end of each session — verify nothing broke, check all changed files against SYSTEM.md, and output a structured audit report. Do not end until the audit is complete. Confidence: 0.85
- Fix all errors before finishing a session — do not leave known broken builds, syntax errors, or runtime errors. Confidence: 0.80
- Read SYSTEM.md, PROGRESS.md, and DEEPSEEK.md before starting any implementation work. Confidence: 0.80
- Do not claim deployment or production verification is complete without confirming actual build/deploy logs showing success. Confidence: 0.75

