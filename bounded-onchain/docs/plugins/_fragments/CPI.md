## Descriptor lane

`@CPI.*` calls are descriptor-bound: the deploy binds program id, account schema, and attested instruction bytes, so policy code cannot vary the shape. They require attested transaction data, which exists only in `hooks.onchain` execution. Custody of the `source` argument varies per descriptor - `memoNote`/`transferLamports` follow the uniform three-form rule, while the Kamino family is wallet-only (the obligation owner).
