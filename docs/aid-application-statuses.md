# Aid application statuses

This guide covers the **application status** values stored in the database, and the **STAGE** labels shown on the Data Entry list board.

---

## Quick pipeline (happy path)

```
Draft
  → Submitted          (Consider & assign investigator)
  → Under review       (Field Process / investigation in progress)
  → Verification completed  (Investigator finished checklist)
  → Manager Review     (Program manager recommendation)
  → CEO approval required
  → Successful
  → Delivered
```

Side paths: **Incomplete** / **Incomplete Docs** (returned for fixes), **Rejected** (closed — Program manager can override and reopen in some cases).

---

## STAGE column (Data Entry list)

The **STAGE** pill on the entry list is a simplified board label. It is derived from the real `status` via `mapStatusToStage`.

| STAGE (UI) | Meaning | Underlying status(es) |
|---|---|---|
| **Incomplete** | Missing details; needs completion | `incomplete` |
| **Submitted** | Assigned / waiting for investigator to start | `submitted` |
| **Investigation** | Field visit / checklist in progress | `under_review` |
| **Manager Review** | Awaiting Program manager recommendation / forward | `verification_completed`, `manager_review` |
| **Pending approval** | With CEO / committee | `ceo_approval_required` |
| **Approved** | Approved this month (board filter also limits to current month) | `successful`, `delivered` |
| **Returned** | Rejected / closed negatively | `rejected` |

Drafts and incomplete-docs cases are handled mainly on the **Drafts** board (`draft`, `incomplete_docs` map to stage `draft`).

---

## All application statuses (source of truth)

These are the values on `aid_applications.status` (`AidApplicationStatus`).

| Status (DB / API) | UI label | Who acts | What it means |
|---|---|---|---|
| `draft` | Draft | Data entry / intake | Application saved but not yet in the verification pipeline. Lives on Drafts until Consider & assign. |
| `incomplete` | Incomplete | Assignee / intake | Returned because required case details are missing. Editable; can be resumed after fixes. |
| `incomplete_docs` | Incomplete Docs | Assignee / intake | One or more required documents flagged missing. Treated with drafts until docs are complete. |
| `submitted` | Submitted | Assigned investigator | Considered for verification and assigned. Checklist not meaningfully started yet (STAGE: **Submitted**). |
| `under_review` | Under review | Assigned investigator | Investigation / Field Process in progress (STAGE: **Investigation**). |
| `verification_completed` | Verification completed | Program manager | Investigator finished Field Process checklist. Recommendation still needed from Program manager (STAGE: **Manager Review**). |
| `manager_review` | Manager Review | Program manager | Investigator submitted verification; Program manager reviews / overrides recommendation and can forward to CEO. |
| `ceo_approval_required` | CEO approval required | CEO / elevated approver | Forwarded for CEO decision (STAGE: **Pending approval**). |
| `successful` | Successful | Delivery / disbursement staff | CEO approved. Ready for delivery / disbursement (STAGE: **Approved**). |
| `delivered` | Delivered | — | Aid handed over / delivery recorded (STAGE: **Approved**). |
| `rejected` | Rejected | Program manager may reopen | Closed as rejected (investigator Reject action, CEO reject, etc.). STAGE: **Returned**. Program managers can override recommendation and reopen in supported flows. |

---

## Status by role

### Data entry / intake
- Creates **Draft**
- Completes forms, attachments, Preview
- After **Consider & assign** → moves into **Submitted**

### Investigator (assignee)
- Works applications in **Submitted** / **Under review**
- Completes Field Process checklist
- Marks **Verification completed** (does not fill Program Recommendation in the current flow)
- May use Reject / Incomplete actions where permitted

### Program department manager
- Owns **Verification completed** and **Manager Review**
- Sets / overrides **Recommendation** (including old-flow investigator Reject)
- Forwards to CEO → **CEO approval required**
- Can reopen some **Rejected** cases by changing recommendation and forwarding

### CEO / elevated approver
- Decides on **CEO approval required**
- Approve → **Successful**; Reject → **Rejected**

### Delivery
- Records handover on **Successful** → **Delivered**

---

## Related status fields (not the main STAGE)

These are separate columns / JSON fields, not the main `status`:

| Field | Purpose |
|---|---|
| `ceo_approval_status` | `not_required` / `pending` / `approved` / `rejected` — CEO decision detail |
| `delivery_status` | Delivery progress (`not_started`, `pending`, `delivered`, …) |
| `investigation_recommendation` | Approve / approve with changes / reject + remarks (and ration options) |
| `meal_review` | Preview MEAL verification / recommendation / remarks (can lock) |
| `preview_approval` | Preview Approval section (can lock) |

Disbursement installments use their own statuses (`queued`, `due`, `delivered`, …) on the disbursement ledger, not on the application STAGE board.

---

## Common transitions

| From | Action | To |
|---|---|---|
| `draft` | Consider & assign | `submitted` |
| `submitted` | Investigator starts / saves checklist | `under_review` |
| `under_review` | Verification completed (Field Process done) | `verification_completed` |
| `under_review` / `verification_completed` | Program manager verify + recommend (skip path) | `ceo_approval_required` |
| `under_review` | Investigator verify (legacy / non-manager) | `manager_review` |
| `verification_completed` / `manager_review` | Manager forward | `ceo_approval_required` |
| `ceo_approval_required` | CEO approve | `successful` |
| `ceo_approval_required` | CEO reject | `rejected` |
| any open pipeline | Reject application | `rejected` |
| open pipeline | Mark incomplete | `incomplete` |
| `incomplete` | Resume after assign | `submitted` |
| `successful` | Record delivery | `delivered` |
| `rejected` | Program manager override recommendation | `manager_review` (then can forward to CEO) |

---

## Notes

1. **STAGE vs status** — STAGE is for the entry board only. Filters, permissions, and APIs use the real `status` values above.
2. **Investigation vs Manager Review** — “Investigation” means field work (`under_review`). After Field Process is finished, the board shows **Manager Review** even if the stored status is `verification_completed`.
3. **Pending approval** — always means CEO / committee queue (`ceo_approval_required`).
4. **Returned** — board label for `rejected`, not a separate DB status.
5. Code references: `ddr_server/src/dms/aid/aid.enums.ts`, `department_daily_report/src/components/dms/aid/aidConstants.js` (`AID_STATUS_OPTIONS`, `AID_ENTRY_STAGES`).
