from __future__ import annotations

import re
import subprocess
import sys
from collections.abc import Iterable

PATTERNS = (
    re.compile(r"-----BEGIN [A-Z0-9 ]+ PRIVATE KEY-----"),
    re.compile(r"(?i)\b(?:ghp|github_pat|sk|xox[baprs])_[A-Za-z0-9_-]{16,}\b"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(
        r"(?i)\b(?:api[_-]?key|access[_-]?token|secret[_-]?key|password)\b"
        r"\s*[:=]\s*['\"][^'\"]{8,}['\"]"
    ),
)


def run_git(*args: str) -> str:
    result = subprocess.run(["git", *args], check=True, capture_output=True, text=True)
    return result.stdout


def scan_lines(label: str, lines: Iterable[str]) -> list[str]:
    findings: list[str] = []
    for line in lines:
        if any(pattern.search(line) for pattern in PATTERNS):
            findings.append(f"{label}: {line}")
    return findings


def main() -> int:
    findings: list[str] = []
    commits = [commit for commit in run_git("rev-list", "--all").splitlines() if commit]
    for commit in commits:
        for pattern in PATTERNS:
            output = subprocess.run(
                ["git", "grep", "-I", "-n", "-E", pattern.pattern, commit, "--"],
                capture_output=True,
                text=True,
            )
            if output.returncode == 0:
                findings.extend(scan_lines(commit, output.stdout.splitlines()))

    scopes = (
        ("worktree", ("grep", "-I", "-n")),
        ("index", ("grep", "--cached", "-I", "-n")),
    )
    for scope, args in scopes:
        for pattern in PATTERNS:
            output = subprocess.run(
                ["git", *args, "-E", pattern.pattern, "--"],
                capture_output=True,
                text=True,
            )
            if output.returncode == 0:
                findings.extend(scan_lines(scope, output.stdout.splitlines()))

    unique_findings = sorted(set(findings))
    if unique_findings:
        print("Potential secret literals found:")
        print("\n".join(unique_findings))
        return 1
    print(f"Secret audit passed across {len(commits)} Git commit(s), index, and worktree.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
