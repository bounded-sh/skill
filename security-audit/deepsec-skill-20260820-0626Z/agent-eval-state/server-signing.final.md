No files were written, no credentials were accessed, and no deployment or network calls were made.

The design below provides:

- Server-authoritative winner selection.
- Function authorization bound to an unforgeable live origin.
- A fixed server signing identity.
- Policy-enforced amount and participant-wallet confinement.
- A durable retry journal.
- Onchain exactly-once enforcement through a unique settlement receipt account created atomically with the transfer.
- Safe recovery across crashes before or after submission.

A database `paid` flag alone is insufficient: the process can crash after broadcasting but before recording success. The Solana program receipt is therefore the final idempotency boundary.

## `policy.json`

This example uses a fixed 0.01 SOL prize. Change `PRIZE_LAMPORTS` consistently in the policy, function, and Solana program.

```json
{
  "constants": {
    "MATCHMAKER_ACTOR": "<MATCHMAKER_SERVICE_PUBKEY>",
    "PAYOUT_AUTHORITY": "<PAYOUT_AUTHORITY_PUBKEY>",
    "PRIZE_LAMPORTS": 10000000
  },

  "boundaries": {
    "egress": [
      {
        "id": "solana-rpc",
        "allow": ["<SOLANA_RPC_HOST>"],
        "mode": "locked"
      }
    ]
  },

  "rooms/$roomId": {
    "tier": "checkpointed",
    "fields": {
      "roomId": "String",
      "playerOneId": "String",
      "playerOneWallet": "Address",
      "playerTwoId": "String",
      "playerTwoWallet": "Address",
      "matchConfig": "Address",
      "prizeLamports": "UInt",
      "status": "String"
    },
    "rules": {
      "read": "@user.id == @data.playerOneId || @user.id == @data.playerTwoId || @user.address == @const.PAYOUT_AUTHORITY || @user.address == @const.MATCHMAKER_ACTOR",

      "create": "@user.address == @const.MATCHMAKER_ACTOR && @newData.roomId == $roomId && @newData.playerOneId != @newData.playerTwoId && @newData.playerOneWallet != @newData.playerTwoWallet && @newData.prizeLamports == @const.PRIZE_LAMPORTS && @newData.status == 'open'",

      "update": "false",
      "delete": "false"
    },
    "session": {
      "intentRule": "@user.id == get(/rooms/$roomId).playerOneId || @user.id == get(/rooms/$roomId).playerTwoId",
      "live": {
        "module": "arena",
        "everyMs": 33,
        "maxLifetimeSec": 3600,
        "snapshotEveryTicks": 30,
        "calls": ["settleMatch"],
        "runAs": "<PAYOUT_AUTHORITY_PUBKEY>"
      }
    }
  },

  "rooms/$roomId/view/$userId": {
    "tier": "ephemeral",
    "fields": {
      "stateJson": "String"
    },
    "rules": {
      "read": "$userId == @user.id",
      "create": "false",
      "update": "false",
      "delete": "false"
    }
  },

  "settlements/$roomId": {
    "tier": "durable",
    "fields": {
      "roomId": "String",
      "winnerUserId": "String",
      "winnerWallet": "Address",
      "amountLamports": "UInt",
      "payerWallet": "Address",
      "matchConfig": "Address",
      "receiptAccount": "Address",

      "status": "String",
      "attempt": "UInt",
      "leaseUntilMs": "UInt",

      "signature": "String",
      "blockhash": "String",
      "lastValidBlockHeight": "UInt",
      "submittedAtMs": "UInt",
      "paidAtMs": "UInt",
      "error": "String"
    },
    "rules": {
      "read": "true",

      "create": "@user.address == @const.PAYOUT_AUTHORITY && @origin.kind == 'live' && @origin.module == 'arena' && @origin.room == $roomId && @newData.roomId == $roomId && @newData.payerWallet == @const.PAYOUT_AUTHORITY && @newData.amountLamports == @const.PRIZE_LAMPORTS && @newData.amountLamports == get(/rooms/$roomId).prizeLamports && @newData.matchConfig == get(/rooms/$roomId).matchConfig && ((@newData.winnerUserId == get(/rooms/$roomId).playerOneId && @newData.winnerWallet == get(/rooms/$roomId).playerOneWallet) || (@newData.winnerUserId == get(/rooms/$roomId).playerTwoId && @newData.winnerWallet == get(/rooms/$roomId).playerTwoWallet)) && @newData.status == 'reserved' && @newData.attempt == 0 && @newData.leaseUntilMs == 0 && @newData.signature == '' && @newData.blockhash == '' && @newData.lastValidBlockHeight == 0 && @newData.submittedAtMs == 0 && @newData.paidAtMs == 0",

      "update": "@user.address == @const.PAYOUT_AUTHORITY && @origin.kind == 'live' && @origin.module == 'arena' && @origin.room == $roomId && @newData.roomId == @data.roomId && @newData.winnerUserId == @data.winnerUserId && @newData.winnerWallet == @data.winnerWallet && @newData.amountLamports == @data.amountLamports && @newData.payerWallet == @data.payerWallet && @newData.matchConfig == @data.matchConfig && @newData.receiptAccount == @data.receiptAccount && ((@data.status == 'reserved' && @newData.status == 'preparing' && @newData.attempt == @data.attempt + 1 && @newData.leaseUntilMs > @time.now && @newData.leaseUntilMs <= @time.now + 60000 && @newData.signature == '' && @newData.blockhash == '' && @newData.lastValidBlockHeight == 0) || (@data.status == 'retryable' && @newData.status == 'preparing' && @newData.attempt == @data.attempt + 1 && @newData.leaseUntilMs > @time.now && @newData.leaseUntilMs <= @time.now + 60000 && @newData.signature == '' && @newData.blockhash == '' && @newData.lastValidBlockHeight == 0) || (@data.status == 'preparing' && @data.leaseUntilMs < @time.now && @newData.status == 'preparing' && @newData.attempt == @data.attempt + 1 && @newData.leaseUntilMs > @time.now && @newData.leaseUntilMs <= @time.now + 60000 && @newData.signature == '' && @newData.blockhash == '' && @newData.lastValidBlockHeight == 0) || (@data.status == 'preparing' && @newData.status == 'prepared' && @newData.attempt == @data.attempt && @newData.signature != '' && @newData.blockhash != '' && @newData.lastValidBlockHeight > 0 && @newData.leaseUntilMs == 0) || (@data.status == 'prepared' && @newData.status == 'submitted' && @newData.attempt == @data.attempt && @newData.signature == @data.signature && @newData.blockhash == @data.blockhash && @newData.lastValidBlockHeight == @data.lastValidBlockHeight) || ((@data.status == 'prepared' || @data.status == 'submitted') && @newData.status == 'retryable' && @newData.attempt == @data.attempt && @newData.signature == @data.signature && @newData.blockhash == @data.blockhash && @newData.lastValidBlockHeight == @data.lastValidBlockHeight && @newData.error != '') || ((@data.status == 'prepared' || @data.status == 'submitted' || @data.status == 'retryable') && @newData.status == 'paid' && @newData.attempt == @data.attempt && @newData.signature == @data.signature && @newData.blockhash == @data.blockhash && @newData.lastValidBlockHeight == @data.lastValidBlockHeight && @newData.paidAtMs > 0) || ((@data.status == 'prepared' || @data.status == 'submitted' || @data.status == 'retryable') && @newData.status == 'halted' && @newData.error != ''))",

      "delete": "false"
    }
  },

  "functions": {
    "settleMatch": {
      "auth": "@origin.kind == 'live' && @origin.module == 'arena'",
      "entry": "functions/settleMatch.js",
      "timeout": 60,
      "secrets": [
        "PAYOUT_KEYPAIR",
        "SOLANA_RPC_URL"
      ],
      "egress": [
        {
          "id": "solana-rpc",
          "allow": ["<SOLANA_RPC_HOST>"]
        }
      ]
    }
  }
}
```

Important properties:

- Direct SDK/CLI invocation fails the function `auth` gate.
- Another live module fails the module check.
- A live call cannot write a settlement for a different room because `@origin.room` must equal `$roomId`.
- The function receives no destination or amount argument. It derives both from the trusted room document.
- A settlement row cannot change winner, destination, amount, payer, config account, or receipt account after creation.

## `arena.live.ts`

The existing authoritative game engine should assign `state.winnerUserId`. The settlement portion below is complete and safe under duplicate calls and duplicate effect delivery.

```ts
type SettlementState = {
  status: "idle" | "calling" | "pending" | "paid" | "halted";
  pendingSinceTick: number;
  nextRetryTick: number;
  signature: string;
  error: string;
};

type State = {
  roomId: string;
  playerOneId: string;
  playerTwoId: string;
  phase: "playing" | "settling" | "over" | "halted";
  winnerUserId: string | null;
  settlement: SettlementState;

  // Existing server-authoritative game state goes here.
  game: Record<string, unknown>;
};

export function init(seed: any): State {
  const room = seed?.room;
  if (!room?.roomId || !room?.playerOneId || !room?.playerTwoId) {
    throw new Error("invalid trusted room seed");
  }

  return {
    roomId: room.roomId,
    playerOneId: room.playerOneId,
    playerTwoId: room.playerTwoId,
    phase: "playing",
    winnerUserId: null,
    settlement: {
      status: "idle",
      pendingSinceTick: 0,
      nextRetryTick: 0,
      signature: "",
      error: ""
    },
    game: {}
  };
}

export function tick(
  previous: State,
  intents: Array<{ address: string; intent: any }>,
  dtMs: number,
  ctx?: { tick?: number }
): State | { state: State; call: { fn: string; args: any; as: string } } {
  const state: State = structuredClone(previous);
  const tickNumber = ctx?.tick ?? 0;

  for (const envelope of intents) {
    if (
      envelope.address === "@effect" &&
      envelope.intent?.__effect
    ) {
      const effect = envelope.intent;
      const result = effect.result;

      if (result?.settlementId !== state.roomId) continue;

      if (effect.ok && result.status === "paid") {
        state.settlement.status = "paid";
        state.settlement.signature = result.signature;
        state.phase = "over";
      } else if (effect.ok && result.status === "pending") {
        state.settlement.status = "pending";
        state.settlement.nextRetryTick = tickNumber + 150;
      } else {
        state.settlement.status = "pending";
        state.settlement.error =
          String(effect.error?.message ?? result?.error ?? "settlement retry");
        state.settlement.nextRetryTick = tickNumber + 150;
      }
    }
  }

  /*
   * Existing game code advances state here.
   *
   * It must set state.winnerUserId only from authoritative state, never from a
   * client-supplied "winner" field.
   *
   * Example integration:
   *
   * const winner = advanceAuthoritativeGame(state.game, intents, dtMs);
   * if (winner) state.winnerUserId = winner;
   */

  if (state.winnerUserId && state.phase === "playing") {
    if (
      state.winnerUserId !== state.playerOneId &&
      state.winnerUserId !== state.playerTwoId
    ) {
      state.phase = "halted";
      state.settlement.status = "halted";
      state.settlement.error = "authoritative winner is not a participant";
      return state;
    }

    state.phase = "settling";
    state.settlement.status = "idle";
  }

  const timedOut =
    state.settlement.status === "calling" &&
    tickNumber - state.settlement.pendingSinceTick >= 300;

  const shouldCall =
    state.phase === "settling" &&
    state.winnerUserId !== null &&
    (
      state.settlement.status === "idle" ||
      timedOut ||
      (
        state.settlement.status === "pending" &&
        tickNumber >= state.settlement.nextRetryTick
      )
    );

  if (shouldCall) {
    state.settlement.status = "calling";
    state.settlement.pendingSinceTick = tickNumber;

    return {
      state,
      call: {
        fn: "settleMatch",
        args: {
          roomId: state.roomId,
          winnerUserId: state.winnerUserId
        },
        as: state.winnerUserId
      }
    };
  }

  return state;
}

export function views(state: State): Record<string, { stateJson: string }> {
  const view = {
    phase: state.phase,
    winnerUserId: state.winnerUserId,
    settlement: {
      status: state.settlement.status,
      signature: state.settlement.signature,
      error: state.settlement.error
    },
    game: state.game
  };

  const stateJson = JSON.stringify(view);

  return {
    [state.playerOneId]: { stateJson },
    [state.playerTwoId]: { stateJson }
  };
}
```

`as` does not change identity. It is only a validation hint; `runAs` supplies the actual payout service identity.

## Solana exactly-once program

This program creates one immutable receipt PDA per `(authority, roomIdHash)`. Receipt creation and payment occur in one atomic transaction. A replay-or even a transaction rebuilt with another blockhash-cannot pay twice because the receipt PDA already exists.

It also reads the exact prize and permitted destinations from an immutable `MatchConfig` created during trusted match provisioning.

### `programs/game_settlement/src/lib.rs`

```rust
use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};

declare_id!("<SETTLEMENT_PROGRAM_ID>");

pub const PRIZE_LAMPORTS: u64 = 10_000_000;

#[program]
pub mod game_settlement {
    use super::*;

    pub fn register_match(
        ctx: Context<RegisterMatch>,
        room_id_hash: [u8; 32],
        player_one: Pubkey,
        player_two: Pubkey,
        prize_lamports: u64,
    ) -> Result<()> {
        require!(player_one != player_two, SettlementError::DuplicatePlayer);
        require!(
            player_one != Pubkey::default() && player_two != Pubkey::default(),
            SettlementError::InvalidPlayer
        );
        require_eq!(
            prize_lamports,
            PRIZE_LAMPORTS,
            SettlementError::InvalidPrize
        );

        let config = &mut ctx.accounts.match_config;
        config.room_id_hash = room_id_hash;
        config.authority = ctx.accounts.authority.key();
        config.player_one = player_one;
        config.player_two = player_two;
        config.prize_lamports = prize_lamports;
        config.bump = ctx.bumps.match_config;

        Ok(())
    }

    pub fn settle(
        ctx: Context<Settle>,
        room_id_hash: [u8; 32],
    ) -> Result<()> {
        let config = &ctx.accounts.match_config;
        let winner = ctx.accounts.winner.key();

        require!(
            winner == config.player_one || winner == config.player_two,
            SettlementError::WinnerNotParticipant
        );
        require_eq!(
            config.prize_lamports,
            PRIZE_LAMPORTS,
            SettlementError::InvalidPrize
        );

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.authority.to_account_info(),
                    to: ctx.accounts.winner.to_account_info(),
                },
            ),
            config.prize_lamports,
        )?;

        let receipt = &mut ctx.accounts.receipt;
        receipt.room_id_hash = room_id_hash;
        receipt.authority = ctx.accounts.authority.key();
        receipt.winner = winner;
        receipt.amount_lamports = config.prize_lamports;
        receipt.settled_at_slot = Clock::get()?.slot;
        receipt.bump = ctx.bumps.receipt;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(room_id_hash: [u8; 32])]
pub struct RegisterMatch<'info> {
    #[account(
        init,
        payer = authority,
        space = MatchConfig::LEN,
        seeds = [
            b"match",
            authority.key().as_ref(),
            room_id_hash.as_ref()
        ],
        bump
    )]
    pub match_config: Account<'info, MatchConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(room_id_hash: [u8; 32])]
pub struct Settle<'info> {
    #[account(
        init,
        payer = authority,
        space = SettlementReceipt::LEN,
        seeds = [
            b"settlement",
            authority.key().as_ref(),
            room_id_hash.as_ref()
        ],
        bump
    )]
    pub receipt: Account<'info, SettlementReceipt>,

    #[account(
        seeds = [
            b"match",
            authority.key().as_ref(),
            room_id_hash.as_ref()
        ],
        bump = match_config.bump,
        has_one = authority
    )]
    pub match_config: Account<'info, MatchConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: constrained to one of the immutable MatchConfig participant keys.
    #[account(mut)]
    pub winner: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[account]
pub struct MatchConfig {
    pub room_id_hash: [u8; 32],
    pub authority: Pubkey,
    pub player_one: Pubkey,
    pub player_two: Pubkey,
    pub prize_lamports: u64,
    pub bump: u8,
}

impl MatchConfig {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 32 + 8 + 1;
}

#[account]
pub struct SettlementReceipt {
    pub room_id_hash: [u8; 32],
    pub authority: Pubkey,
    pub winner: Pubkey,
    pub amount_lamports: u64,
    pub settled_at_slot: u64,
    pub bump: u8,
}

impl SettlementReceipt {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 8 + 8 + 1;
}

#[error_code]
pub enum SettlementError {
    #[msg("Both match participants are identical")]
    DuplicatePlayer,

    #[msg("A participant address is invalid")]
    InvalidPlayer,

    #[msg("Prize does not equal the configured production prize")]
    InvalidPrize,

    #[msg("Winner is not one of the configured match participants")]
    WinnerNotParticipant,
}
```

`register_match` must be executed and finalized during trusted room provisioning. Only after decoding and verifying that immutable account should the matchmaker write `rooms/<roomId>`.

## Settlement function

Bounded Functions do not upload `node_modules`. Build this source into one self-contained browser-targeted bundle before pointing the policy at it.

### `functions-src/settleMatch.ts`

```ts
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction
} from "@solana/web3.js";
import bs58 from "bs58";
import { Buffer } from "buffer";

const PROGRAM_ID = new PublicKey("<SETTLEMENT_PROGRAM_ID>");
const PRIZE_LAMPORTS = 10_000_000;
const LEASE_MS = 45_000;

type Journal = {
  roomId: string;
  winnerUserId: string;
  winnerWallet: string;
  amountLamports: number;
  payerWallet: string;
  matchConfig: string;
  receiptAccount: string;

  status:
    | "reserved"
    | "preparing"
    | "prepared"
    | "submitted"
    | "retryable"
    | "paid"
    | "halted";

  attempt: number;
  leaseUntilMs: number;
  signature: string;
  blockhash: string;
  lastValidBlockHeight: number;
  submittedAtMs: number;
  paidAtMs: number;
  error: string;
};

function assertRoomId(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(value)
  ) {
    throw new Error("invalid roomId");
  }
}

function parseKeypair(value: unknown): Keypair {
  if (typeof value !== "string") {
    throw new Error("PAYOUT_KEYPAIR is missing");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("PAYOUT_KEYPAIR must be a Solana 64-byte JSON array");
  }

  if (
    !Array.isArray(parsed) ||
    parsed.length !== 64 ||
    parsed.some(
      (v) => !Number.isInteger(v) || Number(v) < 0 || Number(v) > 255
    )
  ) {
    throw new Error("PAYOUT_KEYPAIR must be a Solana 64-byte JSON array");
  }

  return Keypair.fromSecretKey(Uint8Array.from(parsed as number[]));
}

async function sha256(value: string): Promise<Buffer> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Buffer.from(digest);
}

async function discriminator(namespace: string, name: string): Promise<Buffer> {
  return (await sha256(`${namespace}:${name}`)).subarray(0, 8);
}

async function roomHash(appId: string, roomId: string): Promise<Buffer> {
  return sha256(`bounded-live-settlement:v1\0${appId}\0${roomId}`);
}

function u64LE(value: number): Buffer {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("unsafe u64 value");
  }

  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(BigInt(value));
  return out;
}

function readU64LE(data: Buffer, offset: number): number {
  const value = data.readBigUInt64LE(offset);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("onchain integer exceeds JavaScript safe range");
  }
  return Number(value);
}

async function deriveAccounts(
  appId: string,
  roomId: string,
  authority: PublicKey
) {
  const hash = await roomHash(appId, roomId);

  const [matchConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("match"), authority.toBuffer(), hash],
    PROGRAM_ID
  );

  const [receipt] = PublicKey.findProgramAddressSync(
    [Buffer.from("settlement"), authority.toBuffer(), hash],
    PROGRAM_ID
  );

  return { hash, matchConfig, receipt };
}

async function decodeMatchConfig(
  connection: Connection,
  address: PublicKey
) {
  const account = await connection.getAccountInfo(address, "confirmed");
  if (!account) throw new Error("immutable onchain match config is missing");
  if (!account.owner.equals(PROGRAM_ID)) {
    throw new Error("match config has the wrong owner");
  }

  const data = Buffer.from(account.data);
  const expected = await discriminator("account", "MatchConfig");

  if (data.length !== 145 || !data.subarray(0, 8).equals(expected)) {
    throw new Error("invalid MatchConfig account");
  }

  let offset = 8;
  const roomIdHash = data.subarray(offset, offset += 32);
  const authority = new PublicKey(data.subarray(offset, offset += 32));
  const playerOne = new PublicKey(data.subarray(offset, offset += 32));
  const playerTwo = new PublicKey(data.subarray(offset, offset += 32));
  const prizeLamports = readU64LE(data, offset);
  offset += 8;
  const bump = data[offset];

  return {
    roomIdHash,
    authority,
    playerOne,
    playerTwo,
    prizeLamports,
    bump
  };
}

async function decodeReceipt(
  connection: Connection,
  address: PublicKey
) {
  const account = await connection.getAccountInfo(address, "confirmed");
  if (!account) return null;
  if (!account.owner.equals(PROGRAM_ID)) {
    throw new Error("receipt has the wrong owner");
  }

  const data = Buffer.from(account.data);
  const expected = await discriminator("account", "SettlementReceipt");

  if (data.length !== 121 || !data.subarray(0, 8).equals(expected)) {
    throw new Error("invalid SettlementReceipt account");
  }

  let offset = 8;
  const roomIdHash = data.subarray(offset, offset += 32);
  const authority = new PublicKey(data.subarray(offset, offset += 32));
  const winner = new PublicKey(data.subarray(offset, offset += 32));
  const amountLamports = readU64LE(data, offset);
  offset += 8;
  const settledAtSlot = readU64LE(data, offset);

  return {
    roomIdHash,
    authority,
    winner,
    amountLamports,
    settledAtSlot
  };
}

async function makeSettlementInstruction(
  hash: Buffer,
  receipt: PublicKey,
  matchConfig: PublicKey,
  authority: PublicKey,
  winner: PublicKey
): Promise<TransactionInstruction> {
  const ixDiscriminator = await discriminator("global", "settle");

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: receipt, isSigner: false, isWritable: true },
      { pubkey: matchConfig, isSigner: false, isWritable: false },
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: winner, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
    ],
    data: Buffer.concat([ixDiscriminator, hash])
  });
}

async function buildSignedTransaction(
  blockhash: string,
  hash: Buffer,
  receipt: PublicKey,
  matchConfig: PublicKey,
  payer: Keypair,
  winner: PublicKey
) {
  const instruction = await makeSettlementInstruction(
    hash,
    receipt,
    matchConfig,
    payer.publicKey,
    winner
  );

  const transaction = new Transaction({
    feePayer: payer.publicKey,
    recentBlockhash: blockhash
  }).add(instruction);

  transaction.sign(payer);

  if (!transaction.signature) {
    throw new Error("transaction was not signed");
  }

  const signature = bs58.encode(transaction.signature);
  const raw = transaction.serialize({
    requireAllSignatures: true,
    verifySignatures: true
  });

  return { signature, raw };
}

async function recoverReceiptSignature(
  connection: Connection,
  receipt: PublicKey
): Promise<string> {
  const entries = await connection.getSignaturesForAddress(
    receipt,
    { limit: 1 },
    "confirmed"
  );
  return entries[0]?.signature ?? "";
}

async function safeSet(ctx: any, path: string, document: Journal) {
  try {
    await ctx.bounded.set(path, document);
    return true;
  } catch {
    return false;
  }
}

function assertJournalMatches(
  row: Journal,
  expected: {
    roomId: string;
    winnerUserId: string;
    winnerWallet: string;
    payerWallet: string;
    matchConfig: string;
    receiptAccount: string;
  }
) {
  if (
    row.roomId !== expected.roomId ||
    row.winnerUserId !== expected.winnerUserId ||
    row.winnerWallet !== expected.winnerWallet ||
    row.payerWallet !== expected.payerWallet ||
    row.matchConfig !== expected.matchConfig ||
    row.receiptAccount !== expected.receiptAccount ||
    row.amountLamports !== PRIZE_LAMPORTS
  ) {
    throw new Error("settlement journal conflicts with authoritative match");
  }
}

function receiptMatches(
  receipt: NonNullable<Awaited<ReturnType<typeof decodeReceipt>>>,
  hash: Buffer,
  payer: PublicKey,
  winner: PublicKey
) {
  return (
    Buffer.from(receipt.roomIdHash).equals(hash) &&
    receipt.authority.equals(payer) &&
    receipt.winner.equals(winner) &&
    receipt.amountLamports === PRIZE_LAMPORTS
  );
}

export default async function settleMatch(args: any, ctx: any) {
  const origin = ctx.origin;

  if (
    origin?.kind !== "live" ||
    origin?.module !== "arena"
  ) {
    throw new Error("settlement requires the arena live origin");
  }

  assertRoomId(args?.roomId);

  if (
    origin.room !== args.roomId ||
    typeof args?.winnerUserId !== "string"
  ) {
    throw new Error("origin room or winner is invalid");
  }

  const rpcUrl =
    ctx.env.SOLANA_RPC_URL ??
    await ctx.secrets.get("SOLANA_RPC_URL");
  const keypairValue =
    ctx.env.PAYOUT_KEYPAIR ??
    await ctx.secrets.get("PAYOUT_KEYPAIR");

  if (!rpcUrl) throw new Error("SOLANA_RPC_URL is missing");

  const payer = parseKeypair(keypairValue);
  if (ctx.user?.address !== payer.publicKey.toBase58()) {
    throw new Error("runAs identity does not match PAYOUT_KEYPAIR");
  }

  const connection = new Connection(rpcUrl, "confirmed");
  const roomPath = `rooms/${args.roomId}`;
  const journalPath = `settlements/${args.roomId}`;

  const room = await ctx.bounded.get(roomPath);
  if (!room) throw new Error("trusted room does not exist");
  if (room.roomId !== args.roomId) throw new Error("room binding mismatch");
  if (room.prizeLamports !== PRIZE_LAMPORTS) {
    throw new Error("room prize does not equal the production prize");
  }

  let winnerWallet: string;
  if (args.winnerUserId === room.playerOneId) {
    winnerWallet = room.playerOneWallet;
  } else if (args.winnerUserId === room.playerTwoId) {
    winnerWallet = room.playerTwoWallet;
  } else {
    throw new Error("winner is not a match participant");
  }

  const winner = new PublicKey(winnerWallet);
  const { hash, matchConfig, receipt } = await deriveAccounts(
    ctx.appId,
    args.roomId,
    payer.publicKey
  );

  if (room.matchConfig !== matchConfig.toBase58()) {
    throw new Error("room is not bound to the derived MatchConfig PDA");
  }

  const chainConfig = await decodeMatchConfig(connection, matchConfig);

  if (
    !Buffer.from(chainConfig.roomIdHash).equals(hash) ||
    !chainConfig.authority.equals(payer.publicKey) ||
    !chainConfig.playerOne.equals(new PublicKey(room.playerOneWallet)) ||
    !chainConfig.playerTwo.equals(new PublicKey(room.playerTwoWallet)) ||
    chainConfig.prizeLamports !== PRIZE_LAMPORTS
  ) {
    throw new Error("onchain MatchConfig does not match the trusted room");
  }

  const expected = {
    roomId: args.roomId,
    winnerUserId: args.winnerUserId,
    winnerWallet: winner.toBase58(),
    payerWallet: payer.publicKey.toBase58(),
    matchConfig: matchConfig.toBase58(),
    receiptAccount: receipt.toBase58()
  };

  const initial: Journal = {
    ...expected,
    amountLamports: PRIZE_LAMPORTS,
    status: "reserved",
    attempt: 0,
    leaseUntilMs: 0,
    signature: "",
    blockhash: "",
    lastValidBlockHeight: 0,
    submittedAtMs: 0,
    paidAtMs: 0,
    error: ""
  };

  await safeSet(ctx, journalPath, initial);

  let row = await ctx.bounded.get(journalPath) as Journal | null;
  if (!row) throw new Error("settlement reservation was not admitted");
  assertJournalMatches(row, expected);

  if (row.status === "paid") {
    return {
      settlementId: args.roomId,
      status: "paid",
      signature: row.signature
    };
  }

  const existingReceipt = await decodeReceipt(connection, receipt);
  if (existingReceipt) {
    if (!receiptMatches(existingReceipt, hash, payer.publicKey, winner)) {
      await safeSet(ctx, journalPath, {
        ...row,
        status: "halted",
        error: "onchain receipt conflicts with expected settlement"
      });
      throw new Error("onchain receipt conflict");
    }

    const signature =
      row.signature ||
      await recoverReceiptSignature(connection, receipt);

    await safeSet(ctx, journalPath, {
      ...row,
      signature,
      status: "paid",
      leaseUntilMs: 0,
      paidAtMs: Date.now(),
      error: ""
    });

    return {
      settlementId: args.roomId,
      status: "paid",
      signature
    };
  }

  const now = Date.now();
  const canAcquire =
    row.status === "reserved" ||
    row.status === "retryable" ||
    (row.status === "preparing" && row.leaseUntilMs < now);

  if (canAcquire) {
    const preparing: Journal = {
      ...row,
      status: "preparing",
      attempt: row.attempt + 1,
      leaseUntilMs: now + LEASE_MS,
      signature: "",
      blockhash: "",
      lastValidBlockHeight: 0,
      submittedAtMs: 0,
      paidAtMs: 0,
      error: ""
    };

    const acquired = await safeSet(ctx, journalPath, preparing);
    row = await ctx.bounded.get(journalPath) as Journal;

    if (
      !acquired ||
      row.status !== "preparing" ||
      row.attempt !== preparing.attempt
    ) {
      return {
        settlementId: args.roomId,
        status: "pending"
      };
    }

    const latest = await connection.getLatestBlockhash("finalized");
    const signed = await buildSignedTransaction(
      latest.blockhash,
      hash,
      receipt,
      matchConfig,
      payer,
      winner
    );

    const prepared: Journal = {
      ...row,
      status: "prepared",
      leaseUntilMs: 0,
      signature: signed.signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
      error: ""
    };

    const stored = await safeSet(ctx, journalPath, prepared);
    row = await ctx.bounded.get(journalPath) as Journal;

    if (
      !stored ||
      row.status !== "prepared" ||
      row.attempt !== prepared.attempt ||
      row.signature !== prepared.signature
    ) {
      // Do not submit unless its exact signature was durably journaled first.
      return {
        settlementId: args.roomId,
        status: "pending"
      };
    }
  }

  if (row.status === "preparing") {
    return {
      settlementId: args.roomId,
      status: "pending"
    };
  }

  if (row.status !== "prepared" && row.status !== "submitted") {
    throw new Error(`settlement cannot proceed from status ${row.status}`);
  }

  const rebuilt = await buildSignedTransaction(
    row.blockhash,
    hash,
    receipt,
    matchConfig,
    payer,
    winner
  );

  if (rebuilt.signature !== row.signature) {
    await safeSet(ctx, journalPath, {
      ...row,
      status: "halted",
      error: "reconstructed signature differs from journal"
    });
    throw new Error("transaction reconstruction conflict");
  }

  // Re-sending identical signed bytes is safe: Solana deduplicates the signature.
  // The raw transaction is kept only in memory and is never logged or persisted.
  try {
    const returnedSignature = await connection.sendRawTransaction(
      rebuilt.raw,
      {
        skipPreflight: false,
        maxRetries: 3
      }
    );

    if (returnedSignature !== row.signature) {
      throw new Error("RPC returned an unexpected transaction signature");
    }
  } catch {
    // Ambiguous submission is resolved below from chain state, never by
    // immediately building a different transaction.
  }

  if (row.status === "prepared") {
    await safeSet(ctx, journalPath, {
      ...row,
      status: "submitted",
      submittedAtMs: Date.now(),
      error: ""
    });
    row = await ctx.bounded.get(journalPath) as Journal;
  }

  const landedReceipt = await decodeReceipt(connection, receipt);
  if (landedReceipt) {
    if (!receiptMatches(landedReceipt, hash, payer.publicKey, winner)) {
      await safeSet(ctx, journalPath, {
        ...row,
        status: "halted",
        error: "landed receipt conflicts with expected settlement"
      });
      throw new Error("landed receipt conflict");
    }

    await safeSet(ctx, journalPath, {
      ...row,
      status: "paid",
      leaseUntilMs: 0,
      paidAtMs: Date.now(),
      error: ""
    });

    return {
      settlementId: args.roomId,
      status: "paid",
      signature: row.signature
    };
  }

  const statuses = await connection.getSignatureStatuses(
    [row.signature],
    { searchTransactionHistory: true }
  );
  const status = statuses.value[0];

  if (status?.err) {
    // The transaction is atomic. With no receipt, an errored transaction did
    // not transfer funds and a new attempt may be prepared.
    await safeSet(ctx, journalPath, {
      ...row,
      status: "retryable",
      error: "transaction failed without creating a receipt"
    });

    return {
      settlementId: args.roomId,
      status: "pending"
    };
  }

  if (
    status?.confirmationStatus === "confirmed" ||
    status?.confirmationStatus === "finalized"
  ) {
    // A receipt read can lag slightly behind status; retry instead of claiming
    // success without validating the receipt.
    return {
      settlementId: args.roomId,
      status: "pending"
    };
  }

  const currentBlockHeight = await connection.getBlockHeight("confirmed");
  if (currentBlockHeight > row.lastValidBlockHeight) {
    // The old transaction can no longer land. The program receipt is checked
    // again before any later attempt, and remains the ultimate exactly-once gate.
    const receiptAfterExpiry = await decodeReceipt(connection, receipt);

    if (receiptAfterExpiry) {
      if (!receiptMatches(
        receiptAfterExpiry,
        hash,
        payer.publicKey,
        winner
      )) {
        throw new Error("receipt conflict after blockhash expiry");
      }

      await safeSet(ctx, journalPath, {
        ...row,
        status: "paid",
        paidAtMs: Date.now(),
        error: ""
      });

      return {
        settlementId: args.roomId,
        status: "paid",
        signature: row.signature
      };
    }

    await safeSet(ctx, journalPath, {
      ...row,
      status: "retryable",
      error: "blockhash expired without a receipt"
    });
  }

  return {
    settlementId: args.roomId,
    status: "pending"
  };
}
```

### Build configuration

```json
{
  "private": true,
  "scripts": {
    "build:settlement": "esbuild functions-src/settleMatch.ts --bundle --minify --platform=browser --format=esm --target=es2022 --outfile=functions/settleMatch.js"
  },
  "dependencies": {
    "@solana/web3.js": "<PINNED_VERSION>",
    "bs58": "<PINNED_VERSION>",
    "buffer": "<PINNED_VERSION>"
  },
  "devDependencies": {
    "esbuild": "<PINNED_VERSION>"
  }
}
```

The generated `functions/settleMatch.js` must remain below the Bounded function upload limits: 512 KB per file and 2 MB total. Pin exact dependency versions and commit the lockfile.

## Match-provisioning prerequisite

Before creating `rooms/<roomId>`:

1. Compute:

   ```text
   SHA-256("bounded-live-settlement:v1\0<APP_ID>\0<ROOM_ID>")
   ```

2. Submit `register_match` using the payout authority.
3. Wait for finalized confirmation.
4. Decode `MatchConfig` and verify authority, both wallets, room hash, and prize.
5. Create the immutable Bounded room as `MATCHMAKER_ACTOR`, including the verified `matchConfig` address.
6. Never allow clients to create or update that room configuration.

## Required placeholders

- `<APP_ID>`
- `<MATCHMAKER_SERVICE_PUBKEY>`
- `<PAYOUT_AUTHORITY_PUBKEY>`
- `<SETTLEMENT_PROGRAM_ID>`
- `<SOLANA_RPC_HOST>`
- `<PINNED_VERSION>`
- `PAYOUT_KEYPAIR`: the payout authority’s 64-byte Solana keypair JSON, set only as a function secret.
- `SOLANA_RPC_URL`: the selected production RPC URL, set only as a function secret.

The public value in `session.live.runAs`, `PAYOUT_AUTHORITY`, the `MatchConfig.authority`, and the public half of `PAYOUT_KEYPAIR` must all be identical.

## Required security tests

- Direct user invocation of `settleMatch` returns `403`.
- A call from any module other than `arena` returns `403`.
- A call for room A attempting to write `settlements/B` is denied.
- Supplying an amount or wallet in function arguments has no effect; neither is read.
- A nonparticipant winner is rejected before signing.
- A mismatched payout secret is rejected before signing.
- A room/config mismatch is rejected before signing.
- Crash after `prepared`, before submission: retry reconstructs the identical signature.
- Crash after submission, before `submitted`: retry resends identical bytes.
- Two concurrent calls: only one wins the `preparing` transition.
- Rebuilding with a fresh blockhash after expiry still cannot transfer twice because the receipt PDA already exists.
- A transaction failure creates no receipt and transfers no lamports.
- A receipt with unexpected authority, room, winner, or amount halts settlement.
- A successful chain status without a matching decoded receipt remains pending rather than being reported as paid.

The exact-once claim is scoped honestly: assuming Solana processes transactions atomically and the settlement program remains immutable/controlled, there can be at most one successful payout per authority and room hash. Temporary insolvency or RPC unavailability can delay payment, but cannot authorize a second successful transfer.