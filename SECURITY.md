# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **Secrets**: the e-mail and password of the Frisquet Connect account live in the Gladys
  configuration (the password as a `secret` field). They are sent only to
  `https://fcutappli.frisquet.com`, over HTTPS, to sign in.
- **`/data/frisquet.json`** (the only writable volume, file mode 0600): the session token of
  Frisquet Connect with a SHA-256 hash of the account e-mail (never the e-mail nor the password),
  the last hot water mode of each boiler and the alarms already seen.
- **Network**: outgoing HTTPS to `fcutappli.frisquet.com` only; nothing listens, nothing on the
  local network.
- **Logs**: the token travels in the query string of the API; every logged URL is redacted
  (`token=***`), and the tests check that no e-mail, password or token reaches a log line.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and Frisquet's cloud, app, box and boilers.
