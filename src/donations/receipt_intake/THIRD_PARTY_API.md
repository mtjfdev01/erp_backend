# Receipt Intake API (external)

Submit a donor phone + receipt image/PDF. We OCR the receipt, create/link the donor, record the donation, attach the file, and optionally enroll monthly recurring.

## Endpoint

```
POST https://mtjf-erp-backend.up.railway.app/donations/public/receipt-intake
```

## Auth

Send your API key on every request:

```
x-api-key: YOUR_API_KEY
```

(or `Authorization: Bearer YOUR_API_KEY`)

## Body (`multipart/form-data`)

| Field | Required | Notes |
|-------|----------|--------|
| `phone` | yes | Donor phone |
| `receipt` | yes | Image (JPEG/PNG/WebP/GIF) or PDF, max 10 MB |
| `recurring` | no | `true` / `1` → create monthly recurring |
| `amount` | no | Override OCR amount |
| `currency` | no | e.g. `PKR` (default if missing) |
| `donation_date` | no | `YYYY-MM-DD` |
| `donor_name` | no | Override OCR name |
| `donation_method` | no | e.g. `bank_transfer`, `cash`, `cheque`, `whatsapp` |
| `transaction_id` | no | |
| `bank_name` | no | |
| `notes` | no | |

## Example (cURL)

```bash
curl -X POST "https://mtjf-erp-backend.up.railway.app/donations/public/receipt-intake" \
  -H "x-api-key: YOUR_API_KEY" \
  -F "phone=03001234567" \
  -F "receipt=@/path/to/receipt.jpg" \
  -F "recurring=false"
```

## Success response

```json
{
  "success": true,
  "message": "Receipt intake completed",
  "data": {
    "donor": { "id": 1, "name": "...", "phone": "..." },
    "donation": {
      "id": 1,
      "amount": 1000,
      "currency": "PKR",
      "status": "completed",
      "donation_method": "bank_transfer",
      "donation_source": "receipt_intake",
      "date": "2026-10-30"
    },
    "attachment": { "id": 1, "file_url": "https://..." },
    "recurring": null,
    "extraction": { "amount": 1000, "currency": "PKR", "donor_name": "...", "...": "..." }
  }
}
```

## Errors

| HTTP | Meaning |
|------|---------|
| 401 | Missing/invalid API key |
| 400 | Missing phone/file, bad amount, etc. |
| 502 | OCR / AI failure |

On error: `{ "success": false, "message": "...", "data": null }`
