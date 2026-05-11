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
See [workflow/taste.md](workflow/taste.md)
