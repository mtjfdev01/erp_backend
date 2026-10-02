/** CEO public complaint portal — org / type / category constants. */

export enum CeoComplaintOrganization {
  MTJ_FOUNDATION = "mtj_foundation",
  ASLAB = "aslab",
  EDUCATION_SYSTEM = "education_system",
}

export enum CeoComplainantType {
  EMPLOYEE = "employee",
  PATIENT = "patient",
  VISITOR = "visitor",
}

export enum CeoComplaintCategory {
  STAFF_BEHAVIOR = "staff_behavior",
  REPORT_DELAY = "report_delay",
  TEST_QUALITY = "test_quality",
  WRONG_TEST_BILLING = "wrong_test_billing",
  OVERCHARGING = "overcharging",
  CLEANLINESS = "cleanliness",
  SYSTEM_SOFTWARE = "system_software",
  OTHER = "other",
}

export enum CeoComplaintStatus {
  SUBMITTED = "submitted",
  UNDER_REVIEW = "under_review",
  RESOLVED = "resolved",
  CLOSED = "closed",
}

export enum CeoComplaintSubmissionChannel {
  WEBSITE = "website",
  DMS = "dms",
}

export const CEO_COMPLAINT_ORGANIZATIONS = [
  { value: CeoComplaintOrganization.MTJ_FOUNDATION, label: "MTJ Foundation" },
  { value: CeoComplaintOrganization.ASLAB, label: "Aslab" },
  {
    value: CeoComplaintOrganization.EDUCATION_SYSTEM,
    label: "Education System",
  },
] as const;

export const CEO_COMPLAINANT_TYPES = [
  { value: CeoComplainantType.EMPLOYEE, label: "Employee" },
  { value: CeoComplainantType.PATIENT, label: "Patient" },
  { value: CeoComplainantType.VISITOR, label: "Visitor" },
] as const;

export const CEO_COMPLAINT_CATEGORIES = [
  { value: CeoComplaintCategory.STAFF_BEHAVIOR, label: "Staff behaviour" },
  { value: CeoComplaintCategory.REPORT_DELAY, label: "Report delay" },
  { value: CeoComplaintCategory.TEST_QUALITY, label: "Test quality" },
  {
    value: CeoComplaintCategory.WRONG_TEST_BILLING,
    label: "Wrong test billing",
  },
  { value: CeoComplaintCategory.OVERCHARGING, label: "Overcharging" },
  { value: CeoComplaintCategory.CLEANLINESS, label: "Cleanliness" },
  {
    value: CeoComplaintCategory.SYSTEM_SOFTWARE,
    label: "System or software",
  },
  { value: CeoComplaintCategory.OTHER, label: "Other" },
] as const;

/** Hardcoded Aslab branches for v1 (move to DB later if needed). */
export const ASLAB_BRANCHES = [
  { value: "lahore", label: "Lahore" },
  { value: "multan", label: "Multan" },
  { value: "bahawalpur", label: "Bahawalpur" },
  { value: "rahim_yar_khan", label: "Rahim Yar Khan" },
  { value: "sahiwal", label: "Sahiwal" },
  { value: "faisalabad", label: "Faisalabad" },
  { value: "sargodha", label: "Sargodha" },
  { value: "gujranwala", label: "Gujranwala" },
  { value: "sialkot", label: "Sialkot" },
  { value: "rawalpindi", label: "Rawalpindi" },
  { value: "islamabad", label: "Islamabad" },
  { value: "other", label: "Other" },
] as const;

export const CEO_COMPLAINT_STATUSES = [
  { value: CeoComplaintStatus.SUBMITTED, label: "Submitted" },
  { value: CeoComplaintStatus.UNDER_REVIEW, label: "Under review" },
  { value: CeoComplaintStatus.RESOLVED, label: "Resolved" },
  { value: CeoComplaintStatus.CLOSED, label: "Closed" },
] as const;
