# code-style
- Keep UI truthful: only show fields/metrics actually returned by the API. Never imply analytics capabilities that aren't implemented. Confidence: 0.80
- Output complete files only — never use "rest unchanged" or truncated placeholders. Confidence: 0.85
- Do not invent provider URLs, model names, headers, env vars, package names, route names, tables, or PostHog properties. Use only values explicitly listed in prompts or SYSTEM.md. Confidence: 0.85
- Use console.error only inside catch blocks. Never use console.log. Confidence: 0.85
- All async code must use async/await + try/catch. No .then() chains. Confidence: 0.85
- Never hardcode secrets, keys, or credentials in source code. Always use process.env.*. Confidence: 0.70
