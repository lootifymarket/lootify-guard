# Security policy

Lootify Guard holds Steam passwords, Guard secrets and session tokens. A flaw in it can cost people their accounts and items, so please report one privately and not in a public issue.

## Reporting a vulnerability

Use [Report a vulnerability](https://github.com/lootifymarket/lootify-guard/security/advisories/new) on the repository's Security tab. Only the maintainers see the report, and it can become a published advisory once the fix is out.

If you can't use GitHub, write to [info@lootify.market](mailto:info@lootify.market) with "Security" in the subject.

Tell us what an attacker can do, which version and OS you tried it on, and how to reproduce it. Never send real secrets: use a test account, or replace them with placeholders.

We answer within a few days, keep you posted while we work on a fix, and credit you in the release notes unless you'd rather not be named.

## What counts

For example:

- Passwords, Guard secrets, revocation codes, tokens or cookies leaving the device, showing up in logs, or being stored unencrypted.
- A way into the vault without the master password or Touch ID.
- A request for an account that skips the account's proxy.
- A way to make the app confirm a trade or a sign-in the user didn't approve.
- An update the app installs without a valid signature.
- Code from a web page, a Steam answer or an imported file running in the app.

Not counted: problems on Steam's side, attacks that need the vault already unlocked on an unlocked computer, and the warnings macOS and Windows show because the builds aren't signed yet.

## Supported versions

Only the latest release gets fixes. The app updates itself, so make sure updates are on.
