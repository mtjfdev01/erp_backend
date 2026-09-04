-- One-time migration: copy legacy donor_type=csr rows into csr_pocs.
-- Safe to re-run: skips rows where legacy_donor_id already exists.
-- Does NOT delete or archive legacy donor rows.

INSERT INTO csr_pocs (
  csr_donor_id,
  name,
  email,
  phone,
  cnic,
  business_type,
  business_type_other,
  area_of_interest,
  branch_id,
  role,
  is_primary,
  notes,
  legacy_donor_id,
  is_active,
  is_archived,
  created_at,
  updated_at
)
SELECT
  a.organization_id AS csr_donor_id,
  COALESCE(
    NULLIF(TRIM(d.name), ''),
    NULLIF(TRIM(CONCAT(COALESCE(d.first_name, ''), ' ', COALESCE(d.last_name, ''))), ''),
    d.email,
    CONCAT('POC #', d.id)
  ) AS name,
  d.email,
  d.phone,
  d.cnic,
  d.business_type,
  d.business_type_other,
  d.area_of_interest,
  a.branch_id,
  COALESCE(a.role, 'contact') AS role,
  COALESCE(a.is_primary, false) AS is_primary,
  a.notes,
  d.id AS legacy_donor_id,
  COALESCE(d.is_active, true) AS is_active,
  false AS is_archived,
  NOW() AS created_at,
  NOW() AS updated_at
FROM donors d
INNER JOIN donor_organization_affiliations a
  ON a.donor_id = d.id
 AND a.is_archived = false
WHERE d.donor_type = 'csr'
  AND d.is_archived = false
  AND NOT EXISTS (
    SELECT 1 FROM csr_pocs p WHERE p.legacy_donor_id = d.id
  );
