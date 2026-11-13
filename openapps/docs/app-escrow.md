# App escrow

An OpenApps app holds a deal's USDC in its own policy, and the app's agent settles it.

- Each escrow is its own account, funded by the funder's wallet in the hook that creates it ([escrow example](../../bounded-onchain/docs/examples/escrow.md)).
- A settlement pays the payee or refunds the funder, and marks the escrow settled in the same transaction, so a failed transfer leaves it open to settle again under a new settlement id.
- Only the agent (`@const.AGENT_ADDRESS`) settles, except that anyone may refund the funder once the escrow expires.
  Nobody reviews the agent's settlement: these rules are its only check ([the app's agent in your app](app-agent.md)).

```json
"escrows/$escrowId": {
  "onchain": true,
  "fields": { "payee": "Address!", "amount": "UInt!", "expiresAt": "UInt!", "funder": "Address?", "settled": "String?" },
  "rules": {
    "read": "true",
    "create": "@user.address != null && @newData.funder == null && @newData.settled == null && @newData.payee != @user.address && @newData.payee != @const.AGENT_ADDRESS && @newData.amount > 0 && @newData.expiresAt > @time.now",
    "update": "false",
    "delete": "false"
  },
  "hooks": { "onchain": { "create": "@AccountPlugin.createAccount($escrowId) && @TokenPlugin.transfer(@user.address, $escrowId, @TokenPlugin.USDC, @newData.amount) && @DocumentPlugin.updateField(/escrows/$escrowId, 'funder', @user.address)" } }
},
"escrows/$escrowId/settlements/$settlementId": {
  "onchain": true,
  "fields": { "kind": "String!" },
  "rules": {
    "read": "true",
    "create": "@user.address != null && get(/escrows/$escrowId) != null && get(/escrows/$escrowId).funder != null && get(/escrows/$escrowId).settled == null && @TokenPlugin.getBalance($escrowId, @TokenPlugin.USDC) >= get(/escrows/$escrowId).amount && ((@newData.kind == 'release' && @user.address == @const.AGENT_ADDRESS) || (@newData.kind == 'refund' && (@user.address == @const.AGENT_ADDRESS || @time.now >= get(/escrows/$escrowId).expiresAt)))",
    "update": "false",
    "delete": "false"
  },
  "hooks": { "onchain": { "create": "((@newData.kind == 'release' && @TokenPlugin.transfer($escrowId, get(/escrows/$escrowId).payee, @TokenPlugin.USDC, get(/escrows/$escrowId).amount)) || (@newData.kind == 'refund' && @TokenPlugin.transfer($escrowId, get(/escrows/$escrowId).funder, @TokenPlugin.USDC, get(/escrows/$escrowId).amount))) && @DocumentPlugin.updateField(/escrows/$escrowId, 'settled', @newData.kind)" } }
}
```

- The agent writes a settlement through a script the platform signs with the agent's wallet, with no review, and the app's history records it; it does not run while the app is paused.
  So the rules above are what protect the funder: the payee and amount come from the escrow itself, and the expiry lets anyone refund.
- On a mainnet app, the app must pay the network fee for the agent's transactions (gas sponsorship, a creator setting).
- The escrow holds everything its rules check (payee, amount, expiry), because an onchain rule cannot read the offchain deal; keep the deal offchain with the escrow's id.
