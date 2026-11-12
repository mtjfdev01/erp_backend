import { CsrPocListParams } from "../csr-pocs.service";

export function parseCsrPocListQuery(
  query: Record<string, string | undefined>,
): CsrPocListParams {
  const parseOptionalBool = (value?: string): boolean | undefined => {
    if (value === "true") return true;
    if (value === "false") return false;
    return undefined;
  };

  const branchId = query.branch_id ? Number(query.branch_id) : undefined;
  const csrDonorId = query.csr_donor_id ? Number(query.csr_donor_id) : undefined;
  const donationBoxId = query.donation_box_id ? Number(query.donation_box_id) : undefined;

  return {
    type: query.type?.trim() || undefined,
    donation_box_id:
      donationBoxId && Number.isInteger(donationBoxId) && donationBoxId > 0
        ? donationBoxId
        : undefined,
    search: query.search?.trim() || undefined,
    role: query.role?.trim() || undefined,
    csr_donor_id:
      csrDonorId && Number.isInteger(csrDonorId) && csrDonorId > 0
        ? csrDonorId
        : undefined,
    branch_id:
      branchId && Number.isInteger(branchId) && branchId > 0
        ? branchId
        : undefined,
    is_primary: parseOptionalBool(query.is_primary),
    is_active: parseOptionalBool(query.is_active),
    page: query.page ? Number(query.page) : undefined,
    pageSize: query.pageSize ? Number(query.pageSize) : undefined,
  };
}
