# Cakeopedia website

Repository foundation for an existing Austin, Texas custom home-baking business.
The intended website presents genuine previous creations, an approved current menu
and a dependable custom-enquiry journey.

## Current stage

Local application foundation implemented: Astro/strict TypeScript static preview,
a closed Worker entry point and a D1 enquiry/replay/outbox-intent core tested with
synthetic data. This is not a production website, approved final design or live intake.
CMS, inbox authentication, bot/rate adapters, notification dispatch and cloud resources
remain unimplemented. See [local development](docs/local-development.md).

Use Node 24.22.3, then `npm ci` and `npm run verify`. `npm run dev` starts the local
preview. `npm run dev:api` starts the closed local Worker; `npm run db:local` applies
the migration locally only. There is no deployment or mail-send script.

## Start here

1. Read [AGENTS.md](AGENTS.md), then [handoff](docs/handoff.md) and
   [progress](docs/progress.md).
2. Use the [master plan](docs/master-plan.md) for product scope and milestones.
3. Take one task from the [backlog](docs/backlog.md), checking its dependencies
   and the current task's authority before implementation.
4. Record material decisions in [decisions](docs/decisions.md) and actual evidence
   in the progress/handoff records. ChatGPT Chat must retrieve current files;
   conversation memory is not automatic repository synchronisation.

## Documentation

- [Creative brief](docs/creative-brief.md)
- [Site and public content](docs/site-and-content.md)
- [Enquiry and private operations](docs/enquiry-contract.md)
- [Service and cost register](docs/service-register.md)
- [Acceptance criteria](docs/acceptance.md)
- [Content approval status](docs/content-status.md)
- [Research evidence](docs/research-evidence.md)
- [Contributing](CONTRIBUTING.md) and [security](SECURITY.md)

## Cost and publication policy

Use suitable commercially permitted free resources first. No unapproved spending,
trials with billing, cloud activation or deployment. Keep customer records, private
owner responses, home addresses, secrets and original media out of this public repo.
Publish only genuine permission-cleared media and verified facts. A public repository
does not grant a licence to reuse Cakeopedia branding or photographs; no open-source
licence has been selected for the project's own work.

## Next milestone

Compare the three creative directions with labelled wireframes, then implement the
approved gallery/form journey. Prove authentication, bot/rate controls and outbox
dispatch before enabling live intake.
