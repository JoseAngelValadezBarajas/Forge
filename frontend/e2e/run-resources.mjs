import { lstatSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import process from "node:process";

const resourcePrefix = "forge-rfx-org03c-e2e-";

export function createRunResourceDirectory(parent = tmpdir()) {
  return mkdtempSync(join(parent, resourcePrefix));
}

export function assertRunResourceDirectory(directory, parent = tmpdir()) {
  const resolvedParent = resolve(parent);
  const resolvedDirectory = resolve(directory);
  const relativeDirectory = relative(resolvedParent, resolvedDirectory);
  if (
    !relativeDirectory ||
    isAbsolute(relativeDirectory) ||
    relativeDirectory.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    dirname(relativeDirectory) !== "." ||
    !basename(relativeDirectory).startsWith(resourcePrefix)
  ) {
    throw new Error("E2E cleanup target is not an invocation-owned resource directory.");
  }
  const info = lstatSync(resolvedDirectory);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error("E2E cleanup target must be an invocation-owned directory.");
  }
  return resolvedDirectory;
}

export function cleanupRunResourceDirectory(directory, parent = tmpdir()) {
  const ownedDirectory = assertRunResourceDirectory(directory, parent);
  rmSync(ownedDirectory, { recursive: true, force: true });
}
