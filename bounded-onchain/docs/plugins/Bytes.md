<!-- GENERATED FILE. Do not hand-edit.
     Source: bounded-onchain/data/plugin-catalog.json (extracted from bounded-monorepo manifests
     plus the published capability table). Prose: bounded-onchain/docs/plugins/_fragments/.
     Regenerate: node scripts/generate-plugin-catalog.mjs -->

# `@Bytes`

Borsh-style byte building and reading for raw instruction data.

Check every function's row in [solana-capability-status.md](../solana-capability-status.md) before treating it as live; support states below are a snapshot of that table.

## Read-only

### `Bytes.anchorDiscriminator`

```
@Bytes.anchorDiscriminator(namespace, name) - sha256(namespace + ':' + name)[..8], e.g. @Bytes.anchorDiscriminator('global', 'increment') for an Anchor instruction discriminator.
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `bytes`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `namespace` | string | yes | no | - | The Anchor namespace (e.g. 'global' for instructions, 'account' for accounts) |
| `name` | string | yes | no | - | The instruction/account name (snake_case as declared by the program) |

### `Bytes.bool`

```
@Bytes.bool(b) - Encodes b as 1 byte (0 or 1).
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `bytes`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `b` | boolean | yes | no | - | Boolean value |

### `Bytes.concat`

```
@Bytes.concat(a, b, ...) - Concatenates Bytes values (variadic).
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `bytes`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `a` | bytes | yes | no | - | First Bytes value |
| `b` | bytes | no | no | - | Second Bytes value (optional; variadic) |
| `c` | bytes | no | no | - | Additional Bytes value (optional) |
| `d` | bytes | no | no | - | Additional Bytes value (optional) |
| `e` | bytes | no | no | - | Additional Bytes value (optional) |
| `f` | bytes | no | no | - | Additional Bytes value (optional) |
| `g` | bytes | no | no | - | Additional Bytes value (optional) |
| `h` | bytes | no | no | - | Additional Bytes value (optional) |

### `Bytes.i64`

```
@Bytes.i64(n) - Encodes n as 8 bytes little-endian two's complement (range-checked).
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `bytes`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `n` | number | yes | no | - | Signed integer in i64 range |

### `Bytes.i64At`

```
@Bytes.i64At(bytes, offset) - Reads a little-endian i64 (two's complement) at offset (bounds-checked).
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `bytes` | bytes | yes | no | - | The Bytes value to read from |
| `offset` | number | yes | no | - | Byte offset to read at |

### `Bytes.len`

```
@Bytes.len(bytes) - Returns the byte length of a Bytes value.
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `bytes` | bytes | yes | no | - | The Bytes value to measure |

### `Bytes.pubkey`

```
@Bytes.pubkey(addr) - Encodes an address as its raw 32 bytes.
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `bytes`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `addr` | string | yes | no | - | The address to encode as 32 raw bytes |

### `Bytes.pubkeyAt`

```
@Bytes.pubkeyAt(bytes, offset) - Reads a 32-byte pubkey at offset and returns it as an address (bounds-checked).
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `string`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `bytes` | bytes | yes | no | - | The Bytes value to read from |
| `offset` | number | yes | no | - | Byte offset to read at |

### `Bytes.raw`

```
@Bytes.raw(hexString) - Hex string to Bytes (e.g. @Bytes.raw('deadbeef')); constant-folded to a Bytes literal when the argument is a string literal.
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `bytes`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `hexString` | string | yes | no | - | Hex-encoded bytes (with or without 0x prefix, even length) |

### `Bytes.str`

```
@Bytes.str(s) - Borsh string encoding: u32 LE length prefix + utf8 bytes.
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `bytes`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `s` | string | yes | no | - | The string to Borsh-encode |

### `Bytes.u128`

```
@Bytes.u128(n) - Encodes n as 16 bytes little-endian (input is a u64-range policy number).
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `bytes`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `n` | number | yes | no | - | Non-negative integer (u64-range policy number, widened to u128 LE) |

### `Bytes.u16`

```
@Bytes.u16(n) - Encodes n as 2 bytes little-endian (range-checked).
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `bytes`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `n` | number | yes | no | - | Non-negative integer in u16 range |

### `Bytes.u16At`

```
@Bytes.u16At(bytes, offset) - Reads a little-endian u16 at offset (bounds-checked).
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `bytes` | bytes | yes | no | - | The Bytes value to read from |
| `offset` | number | yes | no | - | Byte offset to read at |

### `Bytes.u32`

```
@Bytes.u32(n) - Encodes n as 4 bytes little-endian (range-checked).
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `bytes`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `n` | number | yes | no | - | Non-negative integer in u32 range |

### `Bytes.u32At`

```
@Bytes.u32At(bytes, offset) - Reads a little-endian u32 at offset (bounds-checked).
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `bytes` | bytes | yes | no | - | The Bytes value to read from |
| `offset` | number | yes | no | - | Byte offset to read at |

### `Bytes.u64`

```
@Bytes.u64(n) - Encodes n as 8 bytes little-endian (range-checked).
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `bytes`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `n` | number | yes | no | - | Non-negative integer in u64 range |

### `Bytes.u64At`

```
@Bytes.u64At(bytes, offset) - Reads a little-endian u64 at offset (bounds-checked). Combined with @Solana.data this reads any field of any account whose layout you know.
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `bytes` | bytes | yes | no | - | The Bytes value to read from |
| `offset` | number | yes | no | - | Byte offset to read at |

### `Bytes.u8`

```
@Bytes.u8(n) - Encodes n as 1 byte (range-checked 0..255).
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `bytes`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `n` | number | yes | no | - | Non-negative integer in u8 range |

### `Bytes.u8At`

```
@Bytes.u8At(bytes, offset) - Reads a u8 at offset (bounds-checked).
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `number`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `bytes` | bytes | yes | no | - | The Bytes value to read from |
| `offset` | number | yes | no | - | Byte offset to read at |

### `Bytes.utf8`

```
@Bytes.utf8(s) - Bare utf8 bytes (no length prefix).
```

- Callable from: onchain rules, onchain named queries, `hooks.onchain`, offchain rules, offchain named queries
- Returns: `bytes`
- Status: **unverified** (source parity only); markers: LIVE-PENDING.

| Arg | Type | Required | Signs | Accepts | Description |
|---|---|---|---|---|---|
| `s` | string | yes | no | - | The string to utf8-encode |
