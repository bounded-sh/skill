# App escrow

An OpenApps app holds a deal's USDC in its own policy, and the app's agent settles it.

- Start from the [escrow example](../../bounded-onchain/docs/examples/escrow.md): an onchain collection with one account per escrow, funded by the funder's wallet in the hook that creates it.
  Give it an `expiresAt`, let the hook stamp `funder`, and make it `update: false`.
- Instead of the buyer releasing, the agent writes a settlement.
  Its hook pays the payee or refunds the funder, and marks the escrow `settled` in the same transaction, so a failed transfer leaves the escrow open to settle again under a new settlement id.
  After the escrow expires, anyone may refund the funder:

```json
"escrows/$escrowId/settlements/$settlementId": {
  "onchain": true,
  "fields": { "kind": "String!" },
  "rules": {
    "read": "true",
    "create": "@user.address != null && get(/escrows/$escrowId) != null && get(/escrows/$escrowId).funder != null && get(/escrows/$escrowId).settled == null && @TokenPlugin.getBalance($escrowId, @TokenPlugin.USDC) >= get(/escrows/$escrowId).amount && ((@newData.kind == 'release' && @user.address == @const.AGENT_ADDRESS) || (@newData.kind == 'refund' && (@user.address == @const.AGENT_ADDRESS || @time.now >= get(/escrows/$escrowId).expiresAt)))",
    "update": "false",
    "delete": "false"
  },
  "hooks": {
    "onchain": {
      "create": "((@newData.kind == 'release' && @TokenPlugin.transfer($escrowId, get(/escrows/$escrowId).payee, @TokenPlugin.USDC, get(/escrows/$escrowId).amount)) || (@newData.kind == 'refund' && @TokenPlugin.transfer($escrowId, get(/escrows/$escrowId).funder, @TokenPlugin.USDC, get(/escrows/$escrowId).amount))) && @DocumentPlugin.updateField(/escrows/$escrowId, 'settled', @newData.kind)"
    }
  }
}
```

- The agent writes a settlement only through a data script its owner reviews (its holders, once the app is Open).
  When the script is approved, or its review window lapses, the platform signs the script's onchain writes with the agent's wallet: exactly the writes that were reviewed.
- Keep the deal itself offchain with the escrow's id: an onchain rule cannot read offchain records.
