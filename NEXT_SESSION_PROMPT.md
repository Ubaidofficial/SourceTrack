# Next Session Prompt

AI-agent workflow rules are governed by [ai_agent_workflow_rules.md](file:///Users/ubaid/Desktop/trackiq/docs/ai_agent_workflow_rules.md).
No AI-agent may commit or push before raw diff review and explicit user approval.

---

Copy and paste the prompt below into the chat to begin the next development session:

```markdown
We are starting **Session SEO-3 — Premium Interactive Demo Upgrade**.

Please perform the work for this session following the rules in docs/ai_agent_workflow_rules.md.

### Goal
Improve `MarketingInteractiveDemo.jsx` using static fixture data only. Add tabs/views for Overview, Sources, Campaigns, Journeys, AI Sources, and Conversions. Support source-row clicks, campaign drilldowns, journey timeline panel previews, a copy snippet simulation, and a mock tracking verification flow. Ensure no API calls, auth imports, Supabase, or PostHog dependencies are introduced.

### Context & Baseline
- We completed Session SEO-2: homepage copy, kicker, metadata, and comparative use cases are successfully refreshed and verified on deployed staging.
- Staging environment is green and healthy on Railway.
- Verification checks must be run before requesting review.

### Verification
- Run syntax and static launch checks (`npm run qa:static`) before requesting review.
- Provide the final pre-commit report format as defined in `docs/ai_agent_workflow_rules.md`.

Please review. I will not commit until explicitly approved.
```
