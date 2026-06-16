# Next Session Prompt

AI-agent workflow rules are governed by [ai_agent_workflow_rules.md](file:///Users/ubaid/Desktop/trackiq/docs/ai_agent_workflow_rules.md).
No AI-agent may commit or push before raw diff review and explicit user approval.

---

Copy and paste the prompt below into the chat to begin the next development session:

```markdown
We are starting **Session 139K-H3 — Branded Supabase Auth Domain + Google OAuth Trust Polish**.

Please perform the work for this session following the rules in docs/ai_agent_workflow_rules.md.

### Problem Statement
During Google login/signup, users currently see the raw production Supabase project domain (`zxjjjsipafojhzkkumvh.supabase.co`) in the Google account chooser. This looks unpolished and hurts signup trust. We need a branded Supabase Auth custom domain, preferably `auth.sourcetrack.ai`, plus matching Google OAuth provider configuration.

### Goal
Audit current Supabase Auth, Google OAuth, frontend redirect, and domain configuration. Produce a safe implementation plan and manual operator checklist for moving production OAuth to a branded auth domain (`auth.sourcetrack.ai`) without exposing secrets or breaking login/signup. Do not mutate production Supabase, DNS, or Google OAuth settings without explicit approval.

### Hard Production Safety Rules
- Do not print OAuth client secrets.
- Do not print Supabase service keys.
- Do not print provider secrets.
- Do not mutate production Supabase Auth settings without explicit approval.
- Do not mutate DNS without explicit approval.
- Do not mutate Google Cloud OAuth settings without explicit approval.
- No localhost as final QA evidence.
- Production user-facing QA must use:
  - https://app.sourcetrack.ai
  - https://sourcetrack.ai
  - https://www.sourcetrack.ai

### Required Audit Targets
- current Supabase Auth Site URL
- current allowed redirect URLs
- current Google OAuth callback URL
- current frontend `signInWithOAuth` usage
- current `redirectTo` behavior
- current staging vs production Supabase URLs
- current app domain root behavior
- current Google OAuth app branding/domain verification requirements

### Expected Target Configuration
- Supabase Auth custom domain: `auth.sourcetrack.ai` (Note: `app.sourcetrack.ai` is reserved for the React app domain)
- Supabase Site URL: `https://app.sourcetrack.ai`
- Google OAuth callback to add: `https://auth.sourcetrack.ai/auth/v1/callback` (Keep existing Supabase callback temporarily during migration if needed)
- Allowed production redirect URLs should include: `https://app.sourcetrack.ai/*`
- Staging must remain isolated from production.

### Required Output Report
Create `docs/qa/branded_auth_domain_google_oauth_139K-H3.md` with:
- current problem screenshot description
- current observed OAuth domain
- target branded auth domain
- current auth config audit
- frontend auth call-site audit
- Google OAuth config checklist
- Supabase custom domain checklist
- DNS checklist
- staging/prod separation risks
- manual operator steps
- rollout plan
- rollback plan
- verification checklist
- exact production QA routes to verify later
- validation output
- git status

### Validation Commands
Run and include the output of:
```bash
git status --short --untracked-files=all
git diff --check
npm run qa:env-safety
npm run qa:static
git diff --stat
git diff
```

Do not commit until approved.
```
