================================================================================
TASK 5 — AI INVESTMENT DESK (paper-trade → real capital; possibly highest leverage)
================================================================================

Using the technical pack + shared business context above, design and pressure-test
this idea (our framing):

> A harness that uses **you (Fable) as a full investment desk** running a strategy;
> **paper-trade** stocks; **run many simulations**; and **graduate to trading real
> stocks.** We have $2.1M and are willing to risk a meaningful chunk and run many
> loops of you against real money. This could be our **highest-leverage** option.

## Do this

1. **Design the full system.** Data sources/market data, strategy generation &
   selection, the pipeline **backtest → paper-trade → live**, position sizing, risk
   controls (max drawdown, per-position/portfolio caps, circuit breakers), and how
   **loops of Fable** run, evaluate, and self-improve without overfitting. Note where
   our own infra (Bounded for a conserved/append-only ledger, spend caps, audit log)
   genuinely helps.
2. **Be brutally honest about edge.** Market efficiency, where a model desk could
   plausibly have an edge vs where it's a coin flip, transaction costs/slippage, and
   the failure modes (overfitting to backtests, regime change, tail risk).
3. **Constraints for a company trading its own money.** Brokerage/API options, legal/
   regulatory/tax considerations (US company, own capital), and record-keeping.
4. **Capital & compute plan.** A staged allocation from the $2.1M with a **hard
   risk cap**, and the compute/token budget for the loops, tied to expected payoff.
5. **Gating metrics.** The exact criteria (out-of-sample Sharpe, drawdown, hit rate,
   consistency over N paper months) that must be hit to move paper → small live →
   scaled live.

## End in action, with conviction

- **A verdict:** is this worth doing, and **how much capital + compute to commit
   first** — a specific number, not a range, with the guardrails.
- **A concrete build + run plan** (what to build first, how the loop runs, who owns it)
   with 30/60/90-day milestones.
- **The go/no-go gates** that trigger scaling up or shutting it down. Decide; don't hedge.
