// Keeper — scheduled (offchain) function, runs actAs a signer.
// Turns the flywheel with no human: periodically writes rows into the
// PERMISSIONLESS claim/distribute collections (fees don't auto-sweep) and
// records build-allowance spend. Non-trust-critical: every action it triggers
// is also permissionless, so if the keeper stalls anyone can claim/distribute
// manually. Writes go through ctx.bounded so rules + invariants still bind.
export default async function keeper(_args, ctx) {
  // 1) claim accrued fees to the treasury (55%) + split-pool (45%) PDAs
  await ctx.bounded.add('claims', { note: 'keeper' });
  // 2) atomically distribute the split-pool leg creator:Poof = 5556:4444 bps
  //    (amount = keeper-computed claimed lamports for this cycle)
  // await ctx.bounded.add('distributions', { amount });
  // 3) post-migration: claim DAMM fees + 3-way policy split
  // await ctx.bounded.add('dammClaims', { note: 'keeper' });
  // await ctx.bounded.add('distributionsPost', { amount });
  return true;
}
