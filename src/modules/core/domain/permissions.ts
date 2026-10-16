export const ORG_ROLES = ["owner", "admin", "trainer", "assistant"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const PERMISSIONS = [
  "organization.read",
  "organization.update",
  "billing.manage",
  "members.read",
  "members.manage",
  "clients.read",
  "clients.write",
  "dogs.read",
  "dogs.write",
  "dog_notes.read",
  "dog_notes.write",
  "sessions.read",
  "sessions.write",
  "packages.read",
  "packages.write",
  "payments.read",
  "payments.write",
  "homework.read",
  "homework.write",
  "reports.read",
  "audit.read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ASSISTANT: readonly Permission[] = [
  "organization.read",
  "clients.read",
  "dogs.read",
  "sessions.read",
  "sessions.write",
  "packages.read",
];

const TRAINER: readonly Permission[] = [
  ...ASSISTANT,
  "clients.write",
  "dogs.write",
  "dog_notes.read",
  "dog_notes.write",
  "packages.write",
  "payments.read",
  "payments.write",
  "homework.read",
  "homework.write",
  "reports.read",
  "members.read",
];

const ADMIN: readonly Permission[] = [
  ...TRAINER,
  "organization.update",
  "members.manage",
  "audit.read",
];

const OWNER: readonly Permission[] = [...ADMIN, "billing.manage"];

const ROLE_PERMISSIONS: Record<OrgRole, ReadonlySet<Permission>> = {
  owner: new Set(OWNER),
  admin: new Set(ADMIN),
  trainer: new Set(TRAINER),
  assistant: new Set(ASSISTANT),
};

export function roleCan(role: OrgRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
