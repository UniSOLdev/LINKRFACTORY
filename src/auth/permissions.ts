export const ROLES = ["administrator", "operator", "viewer"] as const;

export type Role = (typeof ROLES)[number];

export const MUTATIONS = ["create", "approve", "reset"] as const;

export type Mutation = (typeof MUTATIONS)[number];

const ALLOWED: Record<Role, readonly Mutation[]> = {
  administrator: ["create", "approve", "reset"],
  operator: ["create"],
  viewer: [],
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function canPerform(role: Role | null, action: Mutation): boolean {
  if (!role) return false;
  return ALLOWED[role].includes(action);
}
