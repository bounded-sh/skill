# The app's agent in your app

Your policy is the only check on what the app's own agent does inside the app.

## What the agent can do without review

- The agent acts in your app wherever a rule admits its wallet (`@const.AGENT_ADDRESS`), with no person reviewing or voting on the act, on Owned and publicly owned apps alike.
- Offchain, it writes directly through your rules.
- Onchain, the platform signs its writes with the agent's wallet through your rules, within minutes.
  Each one is recorded in the app's history, with what it wrote before and after.
- It does none of this while the app is paused.
- Review is for what needs approval: a release of new code, a change to the app's policy, and treasury money moved beyond the agent's daily limit or a standing approval.
  A policy change ships only in a release, which the creator reviews (on a publicly owned app, the holders).

## What that means for your rules

- A rule that releases money or changes state on the agent's identity alone, such as `@user.address == @const.AGENT_ADDRESS`, has the agent as its only check.
- When that is not what you want, put the extra conditions in the rule itself, for example:
  - a record another party must write first, read with `get()` (an onchain rule reads only onchain records);
  - a time window, with `@time.now` against a stored deadline, such as the expiry that lets anyone refund an [escrow](app-escrow.md);
  - bounds tied to stored fields, so a payout can only go to the record's own payee for the record's own amount;
  - a cap over time with an invariant such as `rollingSum`, whose onchain coverage depends on its type ([invariants](../../bounded-backend/docs/invariants.md)).
- `@origin` works in offchain rules only ([principals and origins](../../bounded-backend/docs/principals-and-origins.md)).
- On an Owned app, the agent can file a script for the creator's explicit approval: that is the creator's action, not the agent's, and it runs only if the creator approves it.
  Only such an approved script writes with `@origin.kind == "approved_script"`, so a rule that requires it is reachable only that way, on an Owned app.
  The agent's own scripts never carry it, and on a publicly owned app nothing does: holders approve by vote, and a vote never earns it.

## Money from the treasury to the app

- The treasury and the app are separate: the agent moves treasury money only through approved proposals, its daily limit, or a standing approval ([launch economics](launch-economics.md)).
- A standing approval, approved once by the creator (the holders on a publicly owned app), lets the agent move USDC from the treasury into one named account of the app, at most a cap per move and with a floor kept in the treasury.
- That account is one your policy creates with `@AccountPlugin.createAccount("<id>")` ([custody and PDAs](../../bounded-onchain/docs/custody-and-pdas.md)).
  Once the USDC is there, your rules decide everything about it, including what the agent may do with it.
- Money goes back to the treasury only through a rule of your app that transfers it to the treasury's address.
