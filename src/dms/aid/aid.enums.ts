export enum AidPersonGender {
  MALE = "male",
  FEMALE = "female",
  OTHER = "other",
}

export enum AidMaritalStatus {
  SINGLE = "single",
  MARRIED = "married",
  WIDOWED = "widowed",
  DIVORCED = "divorced",
  SEPARATED = "separated",
}

export enum AidEducationLevel {
  NONE = "none",
  PRIMARY = "primary",
  MIDDLE = "middle",
  MATRIC = "matric",
  INTERMEDIATE = "intermediate",
  BACHELORS = "bachelors",
  MASTERS = "masters",
  RELIGIOUS = "religious",
  OTHER = "other",
}

/** Top-level literacy branch (Educated / UnEducated). */
export enum AidLiteracyStatus {
  EDUCATED = "educated",
  UNEDUCATED = "uneducated",
}

/**
 * Second-level literacy/occupation category under literacy_status.
 * Educated: student | job | self_employed | business | others
 * Uneducated: skilled_laborer | laborer | self_employed | others
 */
export enum AidLiteracyCategory {
  STUDENT = "student",
  JOB = "job",
  SELF_EMPLOYED = "self_employed",
  BUSINESS = "business",
  SKILLED_LABORER = "skilled_laborer",
  LABORER = "laborer",
  OTHERS = "others",
}

export enum AidHouseholdRole {
  HEAD = "head",
  SPOUSE = "spouse",
  CHILD = "child",
  PARENT = "parent",
  SIBLING = "sibling",
  GUARDIAN = "guardian",
  OTHER = "other",
}

/** Relation of `to_person` relative to `from_person` (ego). */
export enum AidKinshipRelation {
  FATHER = "father",
  MOTHER = "mother",
  SPOUSE = "spouse",
  SON = "son",
  DAUGHTER = "daughter",
  CHILD = "child",
  BROTHER = "brother",
  SISTER = "sister",
  SIBLING = "sibling",
  UNCLE = "uncle",
  AUNT = "aunt",
  COUSIN = "cousin",
  GRANDFATHER = "grandfather",
  GRANDMOTHER = "grandmother",
  GRANDCHILD = "grandchild",
  GUARDIAN = "guardian",
  CUSTODY_HOLDER = "custody_holder",
  IN_LAW = "in_law",
  OTHER = "other",
}

export enum AidWriterRelation {
  SELF = "self",
  FATHER = "father",
  MOTHER = "mother",
  SPOUSE = "spouse",
  GUARDIAN = "guardian",
  RELATIVE = "relative",
  OTHER = "other",
}

export enum AidRequestType {
  HEALTH = "health",
  EDUCATION = "education",
  CLEAN_WATER = "clean_water",
  APNA_GHAR = "apna_ghar",
  DISASTER_RELIEF = "disaster_relief",
  KASB_SKILL_DEVELOPMENT = "kasb_skill_development",
  SEEDS_OF_CHANGE = "seeds_of_change",
  AAS_LAB_DIAGNOSTICS = "aas_lab_diagnostics",
  COMMUNITY_SERVICES = "community_services",
  OTHER = "other",
  /** @deprecated legacy values kept for existing rows */
  CASH = "cash",
  RATION = "ration",
  MEDICAL = "medical",
}

/** Overall application pipeline (list filter source of truth). */
export enum AidApplicationStatus {
  SUBMITTED = "submitted",
  UNDER_REVIEW = "under_review",
  REJECTED = "rejected",
  CEO_APPROVAL_REQUIRED = "ceo_approval_required",
  SUCCESSFUL = "successful",
  DELIVERED = "delivered",
}

export enum AidCeoApprovalStatus {
  NOT_REQUIRED = "not_required",
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
}

export enum AidDeliveryStatus {
  NOT_STARTED = "not_started",
  PENDING = "pending",
  DELIVERED = "delivered",
  PARTIAL = "partial",
  CANCELLED = "cancelled",
}

export enum AidAttachmentContext {
  PROFILE = "profile",
  VERIFICATION = "verification",
  DELIVERY = "delivery",
}
