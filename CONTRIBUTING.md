# Contributing

Read [AGENTS.md](AGENTS.md) and the [current handoff](docs/handoff.md). This is a
business website project, not an invitation to invent business facts or publish
customer material. External proposals are welcome through the issue templates;
maintainers decide scope and implementation authority.

## Task workflow

1. Inspect the latest default branch, current changes, issues and PRs.
2. Identify a task, acceptance criteria, dependencies and one primary writer.
3. For implementation after the initial bootstrap, use a short-lived branch such as
   `docs/topic`, `feat/topic`, `fix/topic` or `chore/topic` from current main.
4. Use separate worktrees/checkouts for authorised concurrent tasks; coordinate
   shared schemas, migrations, design tokens and dependencies. Preserve unrelated work.
5. Make small focused commits. Prefer `docs:`, `chore:`, `feat:` or `fix:` messages
   describing purpose. Do not mix cosmetic cleanup with unrelated behaviour changes.
6. Run checks relevant to the change, inspect the diff and open a PR with evidence.
   Do not claim unrun tests, cloud behaviour or deployment. Use `npm run verify` for application changes; see docs/local-development.md.
7. Merge only within the current task's authority and actual branch rules. Prefer
   squash merging. Never force-push main or bypass a required check.
8. Update materially affected decisions and leave an actionable handoff. Task ownership
   coordinates agents; it is not a technical lock or a permanent permission grant.

## Review expectations

Check correctness, scope, actual user flow, accessibility, recovery and cost exposure.
Screenshots help visual review once a UI exists; a build does not prove visual quality.
Use synthetic data and approved assets only. Keep PR bodies and logs public-safe.

## Reporting

Use bug/feature templates for non-sensitive reports. Do not disclose vulnerabilities,
credentials, private addresses or customer data in public issues; see [SECURITY.md](SECURITY.md).
Do not add an open-source licence or copy third-party code/assets without checking rights.
