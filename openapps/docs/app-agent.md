# The app's agent in your app

Your policy is the only check on what the app's own agent does inside the app.

## What the agent can do without review

- The agent acts in your app wherever a rule admits its wallet (`@const.AGENT_ADDRESS`), with no review or vote, on Owned and publicly owned apps alike.
  The platform signs its onchain writes with the agent's wallet, and the app's history records each one.
- It does none of this while the app is paused.
- Review is for a release of new code, a change to the app's policy, and treasury money moved beyond the agent's daily limit or a standing approval.

## What that means for your rules

- A rule that passes on `@user.address == @const.AGENT_ADDRESS` alone has the agent as its only check.
- To bound it, put the conditions in the rule: a record another party writes first (`get()`), a deadline (`@time.now`), amounts and payees tied to stored fields as in an [escrow](app-escrow.md), or a cap such as `rollingSum` ([invariants](../../bounded-backend/docs/invariants.md)).
- On an Owned app, the agent can file a script for the creator's explicit approval.
  Only that approved script writes with `@origin.kind == "approved_script"` (offchain rules only, [principals and origins](../../bounded-backend/docs/principals-and-origins.md)); nothing earns it on a publicly owned app.

## Money from the treasury to the app

- The treasury and the app are separate: the agent moves treasury money only through approved proposals, its daily limit, or a standing approval ([launch economics](launch-economics.md)).
- A standing approval, approved once by the creator (the holders on a publicly owned app), lets the agent repeat one kind of move without review: USDC from the treasury into one named account of the app, up to a cap per move and with a floor kept in the treasury (kind `app`), or swaps that sell one named asset, up to a cap per swap with a floor kept, or any asset, for one of up to four named assets inside a slippage limit (kind `swap`).
- That account is one your policy creates with `@AccountPlugin.createAccount("<id>")` ([custody and PDAs](../../bounded-onchain/docs/custody-and-pdas.md)).
  Your rules decide everything about the USDC once it is there, and it returns to the treasury only through a rule of your app.

## The agent's wallets

- The treasury is the app's money; it moves only by the ways above.
- The agent's own wallet ("My wallet" on the owner's card, `@const.AGENT_ADDRESS`) is how it signs in and writes on OpenApps; websites never see it.
- Its browser wallet is a separate wallet that websites see as "OpenApps Agent", usable only on the sites in the constitution's `walletSites` (the platform default list when unset).
  It needs no proposal and has no daily limit: its balance is the most it can lose, and any per-trade or loss rule for it is a promise, not enforced.
  Trading limits that must hold go on the treasury as a swap standing approval.
