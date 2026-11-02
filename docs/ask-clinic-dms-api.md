# Ask Clinic (AAS) ↔ DMS Beneficiaries API

Server-to-server lookup so Ask Clinic / AAS reception can autofill patient demographics from MTJF Aid people.

Auth uses the new **`api_keys`** module (not legacy `external_api_keys` / donation partners).

---

## Endpoint

| Item | Value |
|---|---|
| Method | `GET` |
| Paths | `/external/v1/beneficiaries` **or** `/api/v1/beneficiaries` |
| Query | `query` (alias: `search`) — name, CNIC, or mobile |
| Optional | `limit` (default 20, max 50) |
| Auth header | `x-api-key: <key>` (also accepts `Authorization: Bearer <key>`) |
| Keys | Table `api_keys` — create via `POST /api-keys` |

### Example

```bash
curl -X GET "https://mtjf-erp-backend.up.railway.app/external/v1/beneficiaries?query=42201-4567890-2" \
  -H "Accept: application/json" \
  -H "x-api-key: YOUR_ASK_CLINIC_API_KEY"
```

---

## Create an Ask Clinic API key (staff)

```http
POST /api-keys
Authorization: (ERP JWT cookie)
Content-Type: application/json

{
  "name": "Ask Clinic / AAS",
  "scopes": ["ask_clinic", "ask_clinic.beneficiaries"],
  "notes": "Production key for AAS Clinics patient search"
}
```

Response includes **`api_key` once** — copy and share with Ask Clinic securely.

Other staff routes:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api-keys` | List keys (prefix only) |
| `GET` | `/api-keys/scopes` | Known scope values |
| `PATCH` | `/api-keys/:id` | Update name / scopes / `is_active` |
| `DELETE` | `/api-keys/:id` | Revoke |

> **Note:** Donation partner keys stay at `/external/api-keys` (`external_api_keys` table). Do not reuse those for Ask Clinic.

---

## Success response (`200`)

```json
{
  "success": true,
  "message": "Found 1 matching people",
  "data": [
    {
      "id": 8771,
      "display_id": "PR-HEA-8771",
      "beneficiaryCode": "PR-HEA-8771",
      "fullName": "Ayesha Khan",
      "guardianName": "Kamran Khan",
      "gender": "FEMALE",
      "dateOfBirth": "1998-08-20",
      "age": 28,
      "cnic": "42201-4567890-2",
      "mobileNumber": "03214567890",
      "alternatePhone": "03001234567",
      "address": "House 12, Street 4, Gulberg III",
      "city": "Lahore",
      "program": "MTJ Foundation Health Welfare Program",
      "eligibilityStatus": "VERIFIED",
      "registrationStatus": "beneficiary",
      "roles": ["beneficiary", "family_head"],
      "householdRole": "head",
      "applications": [
        {
          "application_no": "AID-2026-00123",
          "status": "successful",
          "requested_aid_type": "health",
          "aid_program": "health_patient_care"
        }
      ]
    }
  ]
}
```

No matches → `{ "success": true, "data": [] }` (not HTTP 404).

---

## DMS registration roles (`registrationStatus` / `roles`)

| Value | Meaning |
|---|---|
| `beneficiary` | Person is (or was) the **beneficiary** on an aid application |
| `family_head` | Marked as household **head** |
| `family_member` | Household member (non-head) and/or appears in kinship tree |
| `writer` | Application writer/applicant when different from beneficiary |
| `registered_person` | In Aid people registry only (no household/app links yet) |

`registrationStatus` is the highest-priority role; `roles` lists all that apply.

---

## Eligibility (`eligibilityStatus`)

| Value | When |
|---|---|
| `VERIFIED` | Health / AAS lab beneficiary with **successful** or **delivered** application |
| `ACTIVE` | Health beneficiary in pipeline, or other active beneficiary apps |
| `APPROVED` | Non-health aid approved/delivered |
| `REGISTERED` | In DMS people data without qualifying aid outcome |

Health matches also set:

- `beneficiaryCode` / `display_id` → `PR-HEA-8771`
- `program` → `MTJ Foundation Health Welfare Program`

---

## Errors

| HTTP | When |
|---|---|
| `400` | Missing/`query` shorter than 2 characters |
| `401` | Missing or invalid API key |
| `403` | Key valid but missing `ask_clinic` scope |
| `500` | Unexpected server error |

---

## Details for AAS Clinics config

1. **Base URL (prod):** `https://mtjf-erp-backend.up.railway.app`
2. **Endpoint:** `GET /external/v1/beneficiaries?query=...`
3. **API key header:** `x-api-key`
4. **API key:** staff → `POST /api-keys` with scopes `["ask_clinic"]`
5. **IP whitelist:** none required by this API (network firewall is separate)

---

## Code

- `ddr_server/src/api-keys/` — dedicated keys module
- `ddr_server/src/dms/aid/integrations/ask-clinic-beneficiaries.*`
- Legacy donation keys: `ddr_server/src/external/` (unchanged)
