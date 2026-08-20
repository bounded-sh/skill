#!/usr/bin/env node
import assert from "node:assert/strict";

const floor = (n, d) => n / d;

// Prediction-market duplicate-sell proof. All amounts are integer base units.
const seed = 10_000_000n;
const buyIn = seed;
const bought = floor(buyIn * seed, seed + buyIn);
const reserveAfterBuy = seed + buyIn;
const supplyAfterBuy = seed - bought;
const sellQuote = floor(reserveAfterBuy * bought, supplyAfterBuy + bought);
const twoPhysicalPayouts = sellQuote * 2n;
const oneStagedReserveValue = reserveAfterBuy - sellQuote;

assert.equal(bought, 5_000_000n);
assert.equal(sellQuote, 10_000_000n);
assert.equal(twoPhysicalPayouts, reserveAfterBuy);
assert.equal(oneStagedReserveValue, 10_000_000n);
assert.equal(reserveAfterBuy - twoPhysicalPayouts, 0n);

// The documentation's proposed overflow rewrite is not equivalent.
const spent = 1n;
const scale = 100n;
const tokens = 50n;
const price = 1n;
const intended = spent * scale <= tokens * price;
const documentedRewrite = spent / (tokens / scale + 1n) <= price;
assert.equal(intended, false);
assert.equal(documentedRewrite, true);

// transferWholeTokens multiplies its argument by mint decimals. Passing a
// base-unit cap as instructed magnifies the transfer by the decimal factor.
const documentedBaseUnitCap = 1_000_000n;
const sixDecimalFactor = 1_000_000n;
const actualTransferBaseUnits = documentedBaseUnitCap * sixDecimalFactor;
assert.equal(actualTransferBaseUnits, 1_000_000_000_000n);

// Pump buy slippage is calculated from execution-time reserves rather than
// being bound into the user's signed intent. A price move before execution
// therefore lowers both the quote and the supposedly protective minimum.
const pumpQuote = (virtualSol, virtualToken, solIn) => {
  const newVirtualToken = (virtualSol * virtualToken) / (virtualSol + solIn) + 1n;
  return virtualToken - newVirtualToken;
};
const applyFivePercentSlippage = (tokensOut) => tokensOut * 9500n / 10000n;
const signingTimeQuote = pumpQuote(100n, 1000n, 10n);
const signingTimeMinimum = applyFivePercentSlippage(signingTimeQuote);
const executionTimeQuoteAfterPriceMove = pumpQuote(200n, 501n, 10n);
const executionTimeMinimum = applyFivePercentSlippage(executionTimeQuoteAfterPriceMove);
assert.equal(signingTimeQuote, 90n);
assert.equal(signingTimeMinimum, 85n);
assert.equal(executionTimeQuoteAfterPriceMove, 23n);
assert.equal(executionTimeMinimum, 21n);
assert(executionTimeQuoteAfterPriceMove < signingTimeMinimum);

console.log(JSON.stringify({
  predictionMarket: {
    seed: seed.toString(),
    boughtYes: bought.toString(),
    eachSellQuote: sellQuote.toString(),
    physicalPayoutAcrossTwoDistinctSellPaths: twoPhysicalPayouts.toString(),
    physicalPotAfterBoth: "0",
    lastWriteWinsRecordedReserve: oneStagedReserveValue.toString()
  },
  arithmeticRewrite: { intended, documentedRewrite },
  transferWholeTokens: {
    callerValueFollowingBaseUnitGuidance: documentedBaseUnitCap.toString(),
    actualBaseUnitsAtSixDecimals: actualTransferBaseUnits.toString()
  },
  pumpBuySlippage: {
    signingTimeQuote: signingTimeQuote.toString(),
    signingTimeMinimum: signingTimeMinimum.toString(),
    executionTimeQuoteAfterPriceMove: executionTimeQuoteAfterPriceMove.toString(),
    executionTimeMinimumAcceptedByCurrentRuntime: executionTimeMinimum.toString()
  }
}, null, 2));
