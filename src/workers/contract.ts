/**
 * Future authorized workers. This module names the contract only.
 * It does not import a client, and writesEnabled is fixed off.
 * A later owner-approved adapter must still record identity, scope, audit, and result.
 */

export type ApprovalPolicy = "none" | "owner";

export interface WorkerContract {
  id: string;
  system: "github" | "vercel" | "shopify" | "supabase" | "meta" | "google-drive" | "agent";
  mode: "read" | "write";
  writesEnabled: false;
  approvalPolicy: ApprovalPolicy;
  identityRequired: true;
  permissionScope: string;
  auditRequired: true;
  resultRequired: true;
}

export const FUTURE_WORKERS: readonly WorkerContract[] = [
  {
    id: "github-read",
    system: "github",
    mode: "read",
    writesEnabled: false,
    approvalPolicy: "none",
    identityRequired: true,
    permissionScope: "Read commits and deployment-related repository metadata.",
    auditRequired: true,
    resultRequired: true,
  },
  {
    id: "github-write",
    system: "github",
    mode: "write",
    writesEnabled: false,
    approvalPolicy: "owner",
    identityRequired: true,
    permissionScope: "Push, merge, or change repository settings. Disabled.",
    auditRequired: true,
    resultRequired: true,
  },
  {
    id: "vercel-read",
    system: "vercel",
    mode: "read",
    writesEnabled: false,
    approvalPolicy: "none",
    identityRequired: true,
    permissionScope: "Read the current deployment identity. Disabled for deploys.",
    auditRequired: true,
    resultRequired: true,
  },
  {
    id: "vercel-deploy",
    system: "vercel",
    mode: "write",
    writesEnabled: false,
    approvalPolicy: "owner",
    identityRequired: true,
    permissionScope: "Production and preview deployments. Disabled.",
    auditRequired: true,
    resultRequired: true,
  },
  {
    id: "shopify-write",
    system: "shopify",
    mode: "write",
    writesEnabled: false,
    approvalPolicy: "owner",
    identityRequired: true,
    permissionScope: "Store catalog, orders, and payments. Disabled.",
    auditRequired: true,
    resultRequired: true,
  },
  {
    id: "meta-spend",
    system: "meta",
    mode: "write",
    writesEnabled: false,
    approvalPolicy: "owner",
    identityRequired: true,
    permissionScope: "Advertising spend and publishing. Disabled.",
    auditRequired: true,
    resultRequired: true,
  },
  {
    id: "google-drive-write",
    system: "google-drive",
    mode: "write",
    writesEnabled: false,
    approvalPolicy: "owner",
    identityRequired: true,
    permissionScope: "Create or change Drive files. Disabled.",
    auditRequired: true,
    resultRequired: true,
  },
  {
    id: "supabase-business",
    system: "supabase",
    mode: "write",
    writesEnabled: false,
    approvalPolicy: "owner",
    identityRequired: true,
    permissionScope: "Customer data writes. Disabled. Factory persistence is a separate server role.",
    auditRequired: true,
    resultRequired: true,
  },
  {
    id: "approved-agent",
    system: "agent",
    mode: "write",
    writesEnabled: false,
    approvalPolicy: "owner",
    identityRequired: true,
    permissionScope: "Any external business action. Disabled until the owner authorizes a worker.",
    auditRequired: true,
    resultRequired: true,
  },
];
