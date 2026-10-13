# Security policy

Finance Cockpit stores personal financial data. Please report vulnerabilities **privately**.

## Reporting

Use GitHub's **"Report a vulnerability"** button (Security tab → Advisories) on this repository.
Do not open a public issue for a security problem.

Include: affected version / commit, steps to reproduce, impact, and a suggested fix if you have
one. You will get an acknowledgement within a week.

## Scope

In scope: authentication (Cloudflare Access JWT verification in `apps/api/src/auth.ts` and
`apps/agent/src/copilot/auth.py`), the internal service token, data exposure through the API or
agents, prompt injection leading to writes without approval, backup encryption, container
isolation (`infra/`).

Out of scope: tax-rule mistakes (open a **Rate correction** issue instead), vulnerabilities in a
deployment that does not follow `infra/README.md` (e.g. `AUTH_MODE=none` exposed to the network).

## Hardening reminders for deployers

- Never expose the stack with `AUTH_MODE=none`.
- Keep `infra/.env` out of git (`chmod 600`) and the backup private key off the server.
- Rotate `AGENT_API_TOKEN` and `OPENAI_API_KEY` if they may have leaked.
