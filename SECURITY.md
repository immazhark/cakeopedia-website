# Security

## Current status

This repository currently contains project documentation only. No deployed application
or supported production release is established by these files.

## Private reporting

A private vulnerability-reporting route has not been verified for this repository.
No reporting email address or response-time commitment has been approved. Do not post
vulnerability details, credentials, customer records or private addresses in public
issues or pull requests. Do not use a business enquiry form for security reports.

Before live intake or launch, maintainers must enable and verify GitHub private
vulnerability reporting or an approved private contact route and update this document.
This is a tracked release hold, not a claim that reporting is already enabled.

## Implementation requirements

Keep secrets in approved private secret storage; use synthetic test records. Protect
all private APIs and exports, minimise logs, validate input and authorisation server-side,
and test failure/recovery. See [acceptance](docs/acceptance.md) and the
[enquiry contract](docs/enquiry-contract.md). If a credential is exposed, revoke/rotate
it promptly through the authorised provider; deleting a Git file alone is insufficient.
