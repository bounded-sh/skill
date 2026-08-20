# Filtered DeepSec triage summary

DeepSec analyzed 140 non-generated baseline files and emitted 130 raw findings: 0 Critical, 28 High, 34 Medium, 16 HighBug, and 52 Bug. These are discovery labels, not audit conclusions.

Xhigh validation persisted 22 verdicts: 20 true-positive, 1 false-positive, 1 fixed, and 0 uncertain. Multiple raw true-positive findings overlap the same root cause.

After contextual review, pinned implementation tracing, accepted-risk exclusion, focused reproduction, deduplication, and the requested impact gate, the final normalized result is 0 Critical and 9 High findings. Seventeen other candidates were rejected, one was fixed, none remained uncertain, and one accepted known false positive was excluded without retaining its details here.
