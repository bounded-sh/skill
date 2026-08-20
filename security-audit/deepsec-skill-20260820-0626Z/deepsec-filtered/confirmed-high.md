# Filtered confirmed DeepSec export

This export includes only independently validated Critical and High findings. Raw DeepSec severity is not a confirmation decision.

| ID | Severity | Finding | DeepSec trace IDs |
|---|---|---|---|
| H001 | High | Releasing and reclaiming a vanity slug permits session and domain takeover | `finding_0af67c5530ef54bc`, `finding_c9d6b734fc80501d` |
| H002 | High | Bare deploy silently promotes environment-specific authority into another app | `finding_1e581f41b1bfe0cf` |
| H003 | High | Source sync can upload Git-ignored credentials despite the documented secret-safe guarantee | `finding_f089cbe20db7be8b` |
| H004 | High | Prediction-market creator can resolve early and sweep an unrelated user's collateral | `finding_5bed72968ee3f7ae` |
| H005 | High | Two distinct sell paths in one batch pay from the same pre-state and drain pooled collateral | `finding_76269b0b72d8de3c` |
| H006 | High | Pump buy slippage protection is recomputed from attacker-moved execution reserves | `finding_d85c66d684bb089b` |
| H007 | High | Analytics viewer can recover reset credentials and bearer tokens from retained blobs | `finding_c4bf0d86b113087a` |
| H008 | High | Any authenticated app user can invoke secret-bearing agent capabilities without action authorization | `finding_c25682bb8a82d60e`, `finding_cd64dd5b1dd92ac9`, `finding_0cbdec87fa68e83f` |
| H009 | High | Standalone NFT caller becomes update authority despite the program-managed claim | `finding_20aefcc965bde502` |

Full manual evidence is in `../findings/all-confirmed.md`.
