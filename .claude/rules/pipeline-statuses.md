---
name: pipeline-statuses
description: CRM pipeline valid statuses, transition rules, and auto-advance logic
metadata:
  type: reference
---

# CRM Pipeline Statuses

**Source:** `.claude/agents/crm-agent.md` lines 23–41

---

## Valid Sequence

```
draft → lead → meeting → quote → follow_up → closing → active → upsell
```

Never skip a stage. Never go backwards.

---

## Auto-Advance (allowed without David's approval)

| Email signal | Transition |
|---|---|
| Meeting / call / presentation scheduled | `lead → meeting` |
| Quote sent (PDF / הצ"מ / price offer) | `meeting → quote` |
| Following up / waiting for approval | `quote → follow_up` |
| Approved / signed / moved to closing | `follow_up → closing` |

---

## Transitions Requiring David's Explicit Approval

| Transition | Reason |
|---|---|
| `closing → active` | Client goes live — real users get access |
| `* → upsell` | Commercial expansion decision |
| Any downgrade (backward move) | Pipeline integrity |

---

## Notes

- `isActiveClient: true` is set when status reaches `active` — see `axioms.md §6`
- The 8 statuses are the only valid values in Firestore `authorities.status`
- Source for valid statuses also in: `CLAUDE.md` lines 41 (8 statuses enumerated)
