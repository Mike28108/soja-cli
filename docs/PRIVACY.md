# SOJA privacy notice

Last updated: 2026-09-25

SOJA Local stores workspace data on the device. SOJA Online sends account and
workspace data to the SOJA server so members of the selected workspace can
collaborate. Workspace access is limited by membership enforced by the server.

When you sign in, SOJA receives your GitHub account ID, username, profile name,
email (if GitHub provides it), and avatar URL. An access request also collects
your display name, date of birth, country code, and a letter of up to 100
characters. This information is used for account identity, access review, and
profile display. The CEO reviewer can see pending requests and their submitted
profile data.

Online workspace data can include workspace membership, projects, tasks,
comments, activity, and chat messages. These records are shared with members
of their workspace. Do not submit passwords, access tokens, or sensitive
personal information in task or chat content.

SOJA uses GitHub for sign-in, Railway to host the API, the configured database
provider to store Online data, and REST Countries to retrieve country choices.
Local mode does not enable chat or shared Online workspace access. The CLI may
also contact the npm registry to check for and install published updates. The
package is distributed through npm with provenance from its public source
repository.

You may request account deletion using `soja account delete`. Deletion revokes
sessions, removes direct profile and access-request data, removes workspace
memberships, and anonymizes your identity on shared tasks, comments, activity,
and chat messages so collaborative records remain available. Tasks assigned to
you become unassigned. A workspace with no other owner must be transferred
before account deletion. Backups may retain data until their normal rotation or
removal.

For privacy requests or questions, contact the project maintainer through the
SOJA repository. This notice describes current product behavior and should be
reviewed for legal requirements in the jurisdictions where SOJA is offered.
