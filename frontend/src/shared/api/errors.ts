export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export type TransferErrorKind =
  | "invalid-document"
  | "duplicate-project"
  | "invalid-reference"
  | "desktop-bridge"
  | "backend"
  | "unavailable";

export function transferErrorMessage(cause: unknown): {
  kind: TransferErrorKind;
  message: string;
} {
  if (cause instanceof ApiError) {
    const detail = cause.message.toLowerCase();
    if (cause.status === 409 || detail.includes("already exists")) {
      return {
        kind: "duplicate-project",
        message: "A project with this name already exists in this workspace.",
      };
    }
    if (cause.status === 422) {
      const invalidReference = ["dependency", "reference", "epic"].some((term) =>
        detail.includes(term),
      );
      return invalidReference
        ? {
            kind: "invalid-reference",
            message: "The project contains an invalid dependency or reference.",
          }
        : {
            kind: "invalid-document",
            message: "The project document failed schema validation.",
          };
    }
    if (cause.status >= 500) {
      return {
        kind: "backend",
        message: "Forge could not complete the transfer on the backend.",
      };
    }
  }

  const detail = cause instanceof Error ? cause.message.toLowerCase() : "";
  if (
    detail.includes("desktop api") ||
    detail.includes("desktop bridge") ||
    detail.includes("operation is not available") ||
    detail.includes("request blocked")
  ) {
    return {
      kind: "desktop-bridge",
      message: "The Desktop bridge rejected this request. Your preview is preserved.",
    };
  }
  if (
    cause instanceof TypeError ||
    detail.includes("failed to fetch") ||
    detail.includes("network") ||
    detail.includes("unavailable")
  ) {
    return {
      kind: "unavailable",
      message: "Forge is unavailable right now. Check that the local runtime is running.",
    };
  }
  return {
    kind: "backend",
    message: "Forge could not complete the transfer. Your preview is preserved.",
  };
}
