# Access, Data Scope & Geographic Flow

How staff requests are gated in `ddr_server` for donors, donations, and related DMS flows.

**One-line rule:** Can you do the action? → Is the row yours / your team’s? → Is it in your territory?  
Lookup can search everyone; linking / saving still enforces ownership.

---

## Request flow

```
JWT auth
  → 1. Action permission
  → 2. Data scope
  → 3. Geographic scope
  → Allow / 403
```

- Layers **2 and 3 stack with AND** on lists (must pass both when both apply).
- `@RequiredPermissions([...])` lists are **OR** (any matching path/role is enough). 
- Fail any required gate → **403 Forbidden**.

---

## Layer 1 — Action permission

**Question:** May this user perform this verb on this module?

| Who | Effect |
|-----|--------|
| `super_admin` | All actions |
| `fund_raising_manager` | Most FR actions (guards / source checks) |
| Module flags | Nested JSON, e.g. `fund_raising.offline_donations.create` |
| Public / website (`user.id = -1`) | Skips staff permission gates |

**Examples**

- `fund_raising.online_donations.create`
- `fund_raising.offline_donors.view`
- `fund_raising.in_kind_donations.update`

**Key files**

- `permissions/guards/permissions.guard.ts`
- `permissions/permissions.service.ts`
- `permissions/decorators/require-permission.decorator.ts`
- Donor / donation controllers (runtime `checkDonorPermission` / `checkDonationPermission` where used)

---

## Layer 2 — Data scope (who owns the row)

**Question:** Is this record in the user’s ownership window?

Resolved from the module’s `scope` on the user permission JSON (default **self** unless `view_all` / org).

| Scope | Sees / can use |
|-------|----------------|
| `self` | Own user id only |
| `team` | Self + full report tree |
| `department` | Same department users |
| `org` / `view_all` | Everyone (no user-id filter) |
| `super_admin` | Bypass data scope |

**Owners**

- Always: `created_by`
- Donors also: `assigned_to` (when `useAssignedTo` / list `assignedToColumn` is enabled)
- Donations list ownership is typically on **`created_by` only**

**Important:** `fund_raising_manager` unlocks **actions**, not automatic data-scope bypass. They still get self/team/dept unless they are also `super_admin` or have org/`view_all`.

**Key files**

- `permissions/data-scope/data-scope.service.ts`
- `permissions/data-scope/data-scope.types.ts`
- `dms/donor/donor.service.ts` (`assertDonorRecordAccess`, list scope)
- `donations/donations.service.ts` (list / record scope)

---

## Layer 3 — Geographic scope (where)

**Question:** Is this record in the user’s territory?

**Active when:** department is `fund_raising` or `crd`, user is not `geographic_off`, not `super_admin`, and has territory assignments (countries / regions / districts / tehsils / cities / routes).

Matching uses city / country / address / `geo_search` (donation boxes use city/route ids). Own `created_by` rows usually still match.

| Geo off when | Result |
|--------------|--------|
| `super_admin` | No geo filter |
| `geographic_off` on user | No geo filter |
| No territory assignments | No geo filter (empty assignment behaviour) |
| Donor has `assigned_to` set (any user) | **Skip geo** on donor view + donation/recurring **link** |
| Otherwise | Must match territory |

**Key files**

- `permissions/geographic-scope/geographic-scope.service.ts`
- User `assigned_*` arrays + `geographic_off`

---

## Where it applies (donors & donations)

| Surface | Action | Data scope | Geographic |
|---------|--------|------------|------------|
| Donor list | Yes | Yes (all sources) | Yes (AND with data) |
| Donor view | Yes | Offline: ownership; website: skip ownership | Yes, unless donor is assigned |
| Donation / recurring **create·update** (link donor) | Yes | Online + offline if owned/assigned; unassigned website OK | Yes, unless donor is assigned |
| Donation list | Yes | Offline always; online often skipped unless Team filter | Yes (AND) |
| `GET /donors/lookup` · `GET /donors/picker` | Auth only | **No** | **No** |

---

## Online vs offline

| | Online | Offline |
|---|--------|---------|
| Marker | `donor.source` / `donation_source` = `website` | Anything else (e.g. `fund_raising`) |
| Donor **view** | Skips ownership | Requires `created_by` or `assigned_to` in data scope |
| Donor **link** on save | Unassigned website still linkable; if owned/assigned → data scope applies | Same ownership rules (not excluded) |
| Geo | Same rules; skipped when `assigned_to` is set | Same |

---

## Pick vs commit

```
/donors/lookup  or  /donors/picker
  → search only (no data scope, no geo, archive filter only)

POST/PATCH donations  or  recurring-donations
  → assertStaffCanLinkDonor → assertDonorLinkAccess
      → geo (unless assigned)
      → ownership for online + offline when donor has owner(s)
```

**Picking ≠ linking.** Lookup may show every non-archived donor; saving still enforces access.

---

## Bypass ladder

1. **super_admin** → action + data + geo  
2. **org / view_all** → data only  
3. **geographic_off** / no assignments / **assigned donor** → geo only (as applicable)  
4. **fund_raising_manager** → actions only (not automatic data/geo bypass)

---

## Key entry points

| Concern | Location |
|---------|----------|
| JWT | `auth/jwt.guard.ts`, `auth/guards/conditional-jwt.guard.ts` |
| Action guard | `permissions/guards/permissions.guard.ts` |
| Data scope | `permissions/data-scope/data-scope.service.ts` |
| Geographic | `permissions/geographic-scope/geographic-scope.service.ts` |
| Donor list / view / link | `dms/donor/donor.service.ts` (`assertDonorViewAccess`, `assertStaffCanLinkDonor`, `assertDonorLinkAccess`) |
| Donor lookup / picker | `dms/donor/donor.controller.ts` (`GET lookup`, `GET picker`) |
| Donation create / update | `donations/donations.service.ts` (calls `assertStaffCanLinkDonor`) |
| Recurring create / update | `donations/recurring_donations/recurring-donations.controller.ts` |

---

## Quick examples

**Self-scoped FR officer, geo on**

- Sees list rows they created **or** are assigned to, **and** in their cities.  
- Can lookup any donor, but cannot save a donation for an offline donor outside ownership.  
- If that donor is `assigned_to` someone, geo is not checked on link; ownership still is.

**Org / view_all**

- Data scope does not filter by user id; geo may still apply unless off / bypassed.

**super_admin**

- No action, data, or geo filter.
