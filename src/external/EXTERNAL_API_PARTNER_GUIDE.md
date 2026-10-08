# MTJF External Partner API

Version: `v1`  
Base URL: **`https://mtjf-erp-backend.up.railway.app`**  
Partner write endpoint: **`POST /external/v1`**  
Staff key management: **`/external/api-keys`**

One donation-style payload. Donor + donation + recurring are handled inside `DonationsService.create`.

---

## Base URLs

| Environment | Base URL |
|-------------|----------|
| **Production** | `https://mtjf-erp-backend.up.railway.app` |
| Local (dev) | `http://localhost:3000` |

Partner write (production):

`POST https://mtjf-erp-backend.up.railway.app/external/v1`

---

## Partner auth (API key from DB)

Keys live in table **`external_api_keys`** (not `.env`). Each partner gets their own row.

```http
X-Api-Key: <api_key from your MTJF contact>
```

Also accepted: `Authorization: Bearer <api_key>`

---

## How MTJF staff create a key

Staff (super_admin / fund_raising_manager), authenticated with ERP JWT cookie:

```http
POST https://mtjf-erp-backend.up.railway.app/external/api-keys
Content-Type: application/json
```

```json
{
  "partner_name": "Partner Portal",
  "donation_source": "partner_portal",
  "notes": "Production key"
}
```

Response includes **`api_key` once** — copy and share with the partner securely. List endpoint only shows `key_prefix`.

Other staff routes (same base URL):

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/external/api-keys` | List keys (no full secret) |
| `PATCH` | `/external/api-keys/:id` | Update name / source / `is_active` |
| `DELETE` | `/external/api-keys/:id` | Revoke (deactivate + archive) |

---

## Partner write URL

```http
POST https://mtjf-erp-backend.up.railway.app/external/v1
X-Api-Key: <YOUR_API_KEY>
Content-Type: application/json
```

Local equivalent: `http://localhost:3000/external/v1`

### Invoice flag

| `create_invoice` | Behaviour |
|------------------|------------|
| omitted / `false` (**default**) | Record donor + donation (+ recurring). No gateway invoice |
| `true` | Also create payment invoice for `donation_method` |

### Example payload (test data)

```json
{
  "project_id": "test-project",
  "project_name": "Test Campaign",
  "donor_name": "Test Donor",
  "donor_email": "test.donor@example.com",
  "donor_phone": "03001112233",
  "donation_type": "sadaqah",
  "donation_frequency": "monthly",
  "city": "Lahore",
  "address": "123 Test Street",
  "notification_subscription": true,
  "donation_method": "bank_transfer",
  "donation_source": "partner_test",
  "amount": 1000,
  "currency": "PKR",
  "status": "completed",
  "recurring_consent": true,
  "recurring": {
    "interval": "month",
    "interval_count": 1,
    "start_date_mode": "same_date",
    "consent": true,
    "start_date": "2026-10-01"
  },
  "create_invoice": false
}
```

If `donation_source` is omitted, the key’s `donation_source` (partner default) is used.

---

## Notes

- Amount ≥ 50 (except in-kind).
- Recurring needs consent (`recurring_consent` or `recurring.consent`).
- Inactive / archived keys are rejected (`401`).
- Keep API keys secret.
