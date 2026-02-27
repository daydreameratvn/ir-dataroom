export const INVESTOR_STATUSES = [
  "invited",
  "nda_accepted",
  "active",
  "termsheet_sent",
  "termsheet_signed",
  "docs_out",
  "dropped",
] as const;

export type InvestorStatus = (typeof INVESTOR_STATUSES)[number];

export const STATUS_LABELS: Record<string, string> = {
  invited: "Invited",
  nda_accepted: "NDA Accepted",
  active: "Active",
  termsheet_sent: "Termsheet Sent",
  termsheet_signed: "Termsheet Signed",
  docs_out: "Docs Out",
  dropped: "Dropped",
  // Legacy
  revoked: "Dropped",
};

/** Statuses that grant dataroom access (everything after NDA, except dropped) */
export function hasDataroomAccess(status: string): boolean {
  return (
    status !== "invited" &&
    status !== "dropped" &&
    status !== "revoked" // legacy
  );
}

/** Statuses admin can manually set via dropdown */
export const MANUAL_STATUSES = [
  "termsheet_sent",
  "termsheet_signed",
  "docs_out",
  "dropped",
] as const;

/** Inline badge styles per status */
export function getStatusStyle(status: string): {
  backgroundColor: string;
  color: string;
  borderColor: string;
} {
  switch (status) {
    case "invited":
      return { backgroundColor: "#f4f4f5", color: "#52525b", borderColor: "#d4d4d8" };
    case "nda_accepted":
      return { backgroundColor: "#ecfdf5", color: "#047857", borderColor: "#a7f3d0" };
    case "active":
      return { backgroundColor: "#eff6ff", color: "#1d4ed8", borderColor: "#93c5fd" };
    case "termsheet_sent":
      return { backgroundColor: "#faf5ff", color: "#7c3aed", borderColor: "#c4b5fd" };
    case "termsheet_signed":
      return { backgroundColor: "#fdf2f8", color: "#be185d", borderColor: "#f9a8d4" };
    case "docs_out":
      return { backgroundColor: "#fffbeb", color: "#b45309", borderColor: "#fcd34d" };
    case "dropped":
    case "revoked": // legacy
      return { backgroundColor: "#fef2f2", color: "#dc2626", borderColor: "#fca5a5" };
    default:
      return { backgroundColor: "#f4f4f5", color: "#52525b", borderColor: "#d4d4d8" };
  }
}
