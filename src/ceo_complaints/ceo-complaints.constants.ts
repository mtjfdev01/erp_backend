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

/** Complaint type (کمپلینٹ ٹائپ) — replaces lab-oriented categories. */
export enum CeoComplaintCategory {
  HARASSMENT_DISCRIMINATION = "harassment_discrimination",
  ETHICS_FRAUD_CORRUPTION = "ethics_fraud_corruption",
  ABUSE_OF_AUTHORITY = "abuse_of_authority",
  UNFAIR_EMPLOYMENT = "unfair_employment",
  COMPENSATION_BENEFITS_PAYROLL = "compensation_benefits_payroll",
  WORKPLACE_SAFETY_HEALTH = "workplace_safety_health",
  WORKING_CONDITIONS_FACILITIES = "working_conditions_facilities",
  POLICY_COMPLIANCE = "policy_compliance",
  IT_DATA_CYBERSECURITY = "it_data_cybersecurity",
  RETALIATION_VICTIMIZATION = "retaliation_victimization",
  EMPLOYEE_RELATIONS = "employee_relations",
  OTHER_GENERAL = "other_general",
}

/** ترجیح (Priority) — derived from complaint type. */
export enum CeoComplaintPriority {
  CRITICAL_HIGH = "critical_high",
  CRITICAL = "critical",
  HIGH = "high",
  MEDIUM_HIGH = "medium_high",
  MEDIUM = "medium",
  HIGH_CRITICAL = "high_critical",
  LOW_MEDIUM = "low_medium",
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

/** Department the complaint is about / directed to. */
export enum CeoComplaintDepartment {
  HR = "hr",
  FINANCE_ACCOUNTS = "finance_accounts",
  IT = "it",
  ADMIN = "admin",
  OPERATIONS = "operations",
  MARKETING = "marketing",
  PROCUREMENT = "procurement",
  LEGAL_COMPLIANCE = "legal_compliance",
  INTERNAL_AUDIT = "internal_audit",
  AUDIO_VIDEO = "audio_video",
  CUSTOMER_SERVICE = "customer_service",
  OTHER = "other",
  UNKNOWN = "unknown",
}

export const CEO_COMPLAINT_PRIORITIES = [
  {
    value: CeoComplaintPriority.CRITICAL_HIGH,
    label: "Critical / High",
    label_ur: "نہایت اہم / اعلیٰ",
  },
  {
    value: CeoComplaintPriority.CRITICAL,
    label: "Critical",
    label_ur: "نہایت اہم",
  },
  { value: CeoComplaintPriority.HIGH, label: "High", label_ur: "اعلیٰ" },
  {
    value: CeoComplaintPriority.MEDIUM_HIGH,
    label: "Medium / High",
    label_ur: "درمیانہ / اعلیٰ",
  },
  {
    value: CeoComplaintPriority.MEDIUM,
    label: "Medium",
    label_ur: "درمیانہ",
  },
  {
    value: CeoComplaintPriority.HIGH_CRITICAL,
    label: "High / Critical",
    label_ur: "اعلیٰ / نہایت اہم",
  },
  {
    value: CeoComplaintPriority.LOW_MEDIUM,
    label: "Low / Medium",
    label_ur: "کم / درمیانہ",
  },
] as const;

export const CEO_COMPLAINT_CATEGORIES = [
  {
    value: CeoComplaintCategory.HARASSMENT_DISCRIMINATION,
    label: "Harassment and Discrimination",
    label_ur: "ہراسانی اور امتیازی سلوک",
    priority: CeoComplaintPriority.CRITICAL_HIGH,
  },
  {
    value: CeoComplaintCategory.ETHICS_FRAUD_CORRUPTION,
    label: "Ethics, Fraud and Corruption Reporting",
    label_ur: "اخلاقیات، فراڈ اور بدعنوانی کی اطلاع دینا",
    priority: CeoComplaintPriority.CRITICAL,
  },
  {
    value: CeoComplaintCategory.ABUSE_OF_AUTHORITY,
    label: "Abuse of Authority / Leadership Misconduct",
    label_ur: "اختیارات کا غلط استعمال / قیادت کی بدسلوکی",
    priority: CeoComplaintPriority.HIGH,
  },
  {
    value: CeoComplaintCategory.UNFAIR_EMPLOYMENT,
    label: "Unfair Employment Practices",
    label_ur: "غیر منصفانہ ملازمت کے طریقے",
    priority: CeoComplaintPriority.MEDIUM_HIGH,
  },
  {
    value: CeoComplaintCategory.COMPENSATION_BENEFITS_PAYROLL,
    label: "Compensation, Benefits and Payroll",
    label_ur: "معاوضہ، مراعات اور پے رول",
    priority: CeoComplaintPriority.MEDIUM,
  },
  {
    value: CeoComplaintCategory.WORKPLACE_SAFETY_HEALTH,
    label: "Workplace Safety, Health and Environment",
    label_ur: "کام کی جگہ کی حفاظت، صحت اور ماحول",
    priority: CeoComplaintPriority.HIGH_CRITICAL,
  },
  {
    value: CeoComplaintCategory.WORKING_CONDITIONS_FACILITIES,
    label: "Working Conditions and Facilities",
    label_ur: "کام کے حالات اور سہولیات",
    priority: CeoComplaintPriority.LOW_MEDIUM,
  },
  {
    value: CeoComplaintCategory.POLICY_COMPLIANCE,
    label: "Policy and Compliance Violations",
    label_ur: "پالیسی اور تعمیل کی خلاف ورزیاں",
    priority: CeoComplaintPriority.HIGH,
  },
  {
    value: CeoComplaintCategory.IT_DATA_CYBERSECURITY,
    label: "IT, Data and Cyber Security",
    label_ur: "آئی ٹی، ڈیٹا اور سائبر سیکیورٹی",
    priority: CeoComplaintPriority.HIGH_CRITICAL,
  },
  {
    value: CeoComplaintCategory.RETALIATION_VICTIMIZATION,
    label: "Retaliation and Victimization",
    label_ur: "انتقامی کارروائی اور شکار بنانا",
    priority: CeoComplaintPriority.CRITICAL_HIGH,
  },
  {
    value: CeoComplaintCategory.EMPLOYEE_RELATIONS,
    label: "Interpersonal / Employee Relations",
    label_ur: "باہمی تعلقات / ملازمین کے تعلقات",
    priority: CeoComplaintPriority.LOW_MEDIUM,
  },
  {
    value: CeoComplaintCategory.OTHER_GENERAL,
    label: "Other / General",
    label_ur: "دیگر / عمومی",
    priority: CeoComplaintPriority.MEDIUM,
  },
] as const;

export const CATEGORY_PRIORITY_MAP: Record<
  CeoComplaintCategory,
  CeoComplaintPriority
> = CEO_COMPLAINT_CATEGORIES.reduce(
  (acc, row) => {
    acc[row.value] = row.priority;
    return acc;
  },
  {} as Record<CeoComplaintCategory, CeoComplaintPriority>,
);

export const CEO_COMPLAINT_DEPARTMENTS = [
  { value: CeoComplaintDepartment.HR, label: "Human Resources (HR)" },
  {
    value: CeoComplaintDepartment.FINANCE_ACCOUNTS,
    label: "Finance / Accounts",
  },
  { value: CeoComplaintDepartment.IT, label: "IT" },
  { value: CeoComplaintDepartment.ADMIN, label: "Admin" },
  { value: CeoComplaintDepartment.OPERATIONS, label: "Operations" },
  { value: CeoComplaintDepartment.MARKETING, label: "Marketing" },
  {
    value: CeoComplaintDepartment.PROCUREMENT,
    label: "Procurement / Purchasing",
  },
  {
    value: CeoComplaintDepartment.LEGAL_COMPLIANCE,
    label: "Legal / Compliance",
  },
  {
    value: CeoComplaintDepartment.INTERNAL_AUDIT,
    label: "Internal Audit",
  },
  { value: CeoComplaintDepartment.AUDIO_VIDEO, label: "Audio Video" },
  {
    value: CeoComplaintDepartment.CUSTOMER_SERVICE,
    label: "Customer Service",
  },
  { value: CeoComplaintDepartment.OTHER, label: "Other" },
  { value: CeoComplaintDepartment.UNKNOWN, label: "Unknown" },
] as const;

export const CEO_COMPLAINT_ORGANIZATIONS = [
  { value: CeoComplaintOrganization.MTJ_FOUNDATION, label: "MTJ Foundation" },
  { value: CeoComplaintOrganization.ASLAB, label: "Aslab" },
  {
    value: CeoComplaintOrganization.EDUCATION_SYSTEM,
    label: "Al Hasanain College",
  },
] as const;

export const CEO_COMPLAINANT_TYPES = [
  { value: CeoComplainantType.EMPLOYEE, label: "Employee" },
  { value: CeoComplainantType.VISITOR, label: "Visitor" },
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
