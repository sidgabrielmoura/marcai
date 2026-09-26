export const Role = {
  SUPERADMIN: "SUPERADMIN",
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  EMPLOYEE: "EMPLOYEE",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const TaskStatus = {
  AVAILABLE: "AVAILABLE",
  IN_PROGRESS: "IN_PROGRESS",
  PAUSED: "PAUSED",
  BLOCKED: "BLOCKED",
  SUBMITTED: "SUBMITTED",
  NEEDS_CORRECTION: "NEEDS_CORRECTION",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  NOT_COMPLETED: "NOT_COMPLETED",
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const ExecutionStatus = {
  SCHEDULED: "SCHEDULED",
  AVAILABLE: "AVAILABLE",
  IN_PROGRESS: "IN_PROGRESS",
  PAUSED: "PAUSED",
  NEEDS_CORRECTION: "NEEDS_CORRECTION",
  PENDING_REVIEW: "PENDING_REVIEW",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  NOT_COMPLETED: "NOT_COMPLETED",
} as const;
export type ExecutionStatus = (typeof ExecutionStatus)[keyof typeof ExecutionStatus];

export const Priority = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
} as const;
export type Priority = (typeof Priority)[keyof typeof Priority];

export const Criticality = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
} as const;
export type Criticality = (typeof Criticality)[keyof typeof Criticality];

export const EvidenceType = {
  PHOTO: "PHOTO",
  VIDEO: "VIDEO",
  FILE: "FILE",
  TEXT: "TEXT",
  NUMBER: "NUMBER",
  SIGNATURE: "SIGNATURE",
  LOCATION: "LOCATION",
} as const;
export type EvidenceType = (typeof EvidenceType)[keyof typeof EvidenceType];

export const DependencyType = {
  BLOCKING: "BLOCKING",
  INFORMATIVE: "INFORMATIVE",
  APPROVAL_CONDITION: "APPROVAL_CONDITION",
} as const;
export type DependencyType = (typeof DependencyType)[keyof typeof DependencyType];

export const DependencyLogic = {
  AND: "AND",
  OR: "OR",
} as const;
export type DependencyLogic = (typeof DependencyLogic)[keyof typeof DependencyLogic];

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string | null;
  platformRole?: string | null;
}

export interface ManagerScope {
  locationIds: string[];
  teamIds: string[];
}

export interface SecurityContext {
  userId: string;
  organizationId: string;
  memberId: string;
  role: Role;
  employeeCode?: string | null;
  scope?: ManagerScope;
}
