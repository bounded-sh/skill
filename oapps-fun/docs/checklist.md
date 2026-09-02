# Checklist before Open and Commence

**What's in here:** the full pre-Open and pre-Commence checklist. Part of the **oapps-fun** skill; the compact rules and the router are in [../SKILL.md](../SKILL.md).

## Practical checklist before Open and Commence

- The app uses the human owner's normal Bounded web account (`bounded init` opens login when needed; confirm with `bounded whoami`).
  Open is owner-only and needs an email-backed account.
  If this is an intentionally legacy key-owned app, use the advanced deploy account-recovery reference before Open rather than inventing a new owner.
- Boundaries were written early and cover the app's money and state rules as
  proven invariants, not ad-hoc checks. They are the trust artifact buyers
  read alongside your source.
- `policy.json` contains **no** rule, function, or egress that depends on a
  user-held credential; `bounded verify` passes.
- Functions use `ctx.ai` / `ctx.services` / `ctx.bounded` only — no fetches to
  key-authenticated endpoints.
- Every external egress is declared and either credential-free, native, or
  relay-eligible.
- Keep the creator site private (`sitePrivate`) while you build.
  Do not flip it public yourself.
  Completed Open publishes the separate governed workload at the exact workload app-id host.
- Make source ride the deploy with `sourcePush: true` in `bounded.json` or `--with-source` on the last deploy.
  After Open, verify the synchronized tree at `https://<workloadAppId>.bounded.page/__bounded/source`.
- The slug is the name the token should live at (`<slug>.openapps.xyz`), so rename it before Commence if it is wrong.
  Open already created the venue-owned root and workload; Commence claims the requested slug for that opening.
- This app has NOT already commenced an oApp.
  A creator app launches exactly once, so a second Open is refused with `oapp_creator_already_launched`; start a different app instead.
- Save `/l/<rootAppId>` as the canonical venue page.
  Do not replace it with a slug-derived venue route after Commence.
- The synced tree is the real, complete project and every `init({ appId })`
  literal names this app (see "What shape the app can take").
  If the app has a frontend, the deployed site was built from THIS tree.
  A stale dist that no longer embeds the app id refuses at Open (`clone_app_id_not_rewritten`).
- If the app has NO web frontend, the user knows its home page will be the
  public repo view at the direct workload host, not a web app.
- Running costs (AI spend, service calls, relayed calls + surcharge) are
  sane against the app's expected build-fund inflow — out of budget means
  frozen, and you should be able to say at what usage level that happens.
- Anything you had to rule out is in your handoff to the user, with the
  reasoning, not silently dropped.
