# Security Specification — LEADER XAUUSD Firestore Persistence

## 1. Data Invariants
1. **Strict Ownership Isolation**: Every `UserAccount` (`/users/{userId}`), `SureSignalRecord` (`/users/{userId}/sureSignals/{signalId}`), and `AnalysisReportRecord` (`/users/{userId}/analysisReports/{reportId}`) belongs strictly to `request.auth.uid == userId` and requires `ownerId == request.auth.uid` on every child record.
2. **Master Gate Relational Integrity**: No `sureSignals` or `analysisReports` document can be created, fetched, updated, or deleted unless the parent `/users/{userId}` document exists and its `uid` matches `request.auth.uid`.
3. **Email Verification Gate**: All mutating client writes require `request.auth.token.email_verified == true`.
4. **Immutable Completed SURE Outcomes**: Once a `SureSignalRecord` reaches a terminal status (`TP_HIT`, `SL_HIT`, `AMBIGUOUS`), it can NEVER be updated or deleted by any client. Only `ACTIVE` signals may transition to a terminal state or be cleared by the owner.
5. **Immutable Analysis Snapshots**: Completed `AnalysisReportRecord` snapshots cannot be mutated after creation (`allow update: if false`).
6. **Temporal Integrity & Bounded Payloads**: `createdAt`/`updatedAt` timestamps on user roots and `createdServerAt`/`updatedServerAt` on signal/report documents must equal `request.time`. All strings, IDs (`^[a-zA-Z0-9_-]+$`, <= 128 chars), and arrays enforce explicit `.size()` boundaries matching `firebase-blueprint.json`.

## 2. Adversarial "Dirty Dozen" Payloads (Must All Fail With PERMISSION_DENIED)
1. **Cross-User Read/Write**: Authenticated user `uid_A` attempts to read or create `/users/uid_B/sureSignals/sig1`.
2. **OwnerId Spoofing on Create**: User `uid_A` creates `/users/uid_A/sureSignals/sig1` with `ownerId: "uid_B"`.
3. **Shadow / Ghost Field Injection**: User `uid_A` sends `isAdmin: true` or `extraField: "hack"` in `create` or `update` payload.
4. **Unverified Email Write**: Token has `email_verified: false` while attempting `create` on `/users/uid_A/analysisReports/rep1`.
5. **Orphaned Subcollection Write**: User `uid_A` writes `/users/uid_A/sureSignals/sig1` when `/users/uid_A` does not exist.
6. **Completed Signal Tampering**: User `uid_A` attempts `update` on a `SureSignalRecord` whose existing `status` is `TP_HIT` (trying to change `pnlPoints` or `status`).
7. **Completed Signal Deletion**: User `uid_A` attempts `delete` on a `SureSignalRecord` with `status == 'SL_HIT'`.
8. **State Downgrade Attack**: User `uid_A` updates an `ACTIVE` signal with extra forbidden fields like `spotPrice` or `direction`.
9. **ID Poisoning Attack**: User `uid_A` targets document ID `../../etc/passwd` or a 1.5KB junk string ID.
10. **Client Timestamp Forgery**: User `uid_A` passes a hardcoded client `Date` for `createdServerAt` instead of `serverTimestamp()`.
11. **Value / Resource Poisoning**: User `uid_A` passes a 500-element `timeframes` array or a `summary` string > 2,000 chars.
12. **Unconstrained List Query**: User `uid_A` queries `/users/uid_A/sureSignals` without filtering `where('ownerId', '==', uid_A)`, or queries `/users` collection directly.
