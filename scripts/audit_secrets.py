from __future__ import annotations

import argparse
import re
import subprocess
import sys
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from pathlib import Path

DEFAULT_REPO_ROOT = Path(__file__).resolve().parents[1]

PATTERN_SPECS: tuple[tuple[str, str], ...] = (
    ("private-key-header", r"-----BEGIN [A-Z0-9 ]+ PRIVATE KEY-----"),
    (
        "known-token",
        r"(?i)\b(?:gh[pousr]|github_pat|sk|xox[baprs])_[A-Za-z0-9_-]{16,}\b",
    ),
    ("aws-access-key", r"\bAKIA[0-9A-Z]{16}\b"),
    (
        "credential-assignment",
        r"(?i)\b(?:api[_-]?key|access[_-]?token|secret[_-]?key|password)\b"
        r"\s*[:=]\s*['\"][^'\"]{8,}['\"]",
    ),
)


class AuditError(RuntimeError):
    """Raised when the audit cannot complete with trustworthy coverage."""


@dataclass(frozen=True, slots=True)
class PatternRule:
    name: str
    expression: re.Pattern[str]


@dataclass(frozen=True, slots=True)
class Finding:
    scope: str
    location: str
    line_number: int
    rule: str
    context: str


@dataclass(frozen=True, slots=True)
class AuditReport:
    commits: int
    index_files: int
    worktree_files: int
    binary_files_skipped: int
    symlink_files_skipped: int
    findings: tuple[Finding, ...]


def compile_patterns(
    specs: Iterable[tuple[str, str]] = PATTERN_SPECS,
) -> tuple[PatternRule, ...]:
    rules: list[PatternRule] = []
    for name, expression in specs:
        try:
            rules.append(PatternRule(name=name, expression=re.compile(expression)))
        except re.error as exc:
            raise AuditError(f"invalid secret pattern '{name}'") from exc
    return tuple(rules)


def run_git(repo_root: Path, *args: str) -> bytes:
    try:
        result = subprocess.run(
            ["git", "-C", str(repo_root), *args],
            capture_output=True,
            check=False,
        )
    except OSError as exc:
        raise AuditError("could not execute Git") from exc
    if result.returncode != 0:
        raise AuditError(f"Git command failed: git {' '.join(args)}")
    return result.stdout


def nul_paths(data: bytes) -> tuple[str, ...]:
    try:
        decoded = data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise AuditError("Git returned an undecodable path list") from exc
    return tuple(path for path in decoded.split("\0") if path)


def text_or_binary(data: bytes) -> str | None:
    if b"\x00" in data:
        return None
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return None


def safe_context(line: str, start: int, end: int) -> str:
    window_start = max(0, start - 32)
    window_end = min(len(line), end + 32)
    prefix = line[window_start:start].replace("\t", " ")
    suffix = line[end:window_end].replace("\t", " ")
    leading = "..." if window_start else ""
    trailing = "..." if window_end < len(line) else ""
    return f"{leading}{prefix}<REDACTED>{suffix}{trailing}"


def scan_text(
    scope: str,
    location: str,
    text: str,
    rules: Sequence[PatternRule],
) -> tuple[Finding, ...]:
    findings: list[Finding] = []
    for line_number, line in enumerate(text.splitlines(), start=1):
        for rule in rules:
            for match in rule.expression.finditer(line):
                findings.append(
                    Finding(
                        scope=scope,
                        location=location,
                        line_number=line_number,
                        rule=rule.name,
                        context=safe_context(line, match.start(), match.end()),
                    )
                )
    return tuple(findings)


def scan_blob(
    scope: str,
    location: str,
    data: bytes,
    rules: Sequence[PatternRule],
) -> tuple[tuple[Finding, ...], bool]:
    text = text_or_binary(data)
    if text is None:
        return (), True
    return scan_text(scope, location, text, rules), False


def git_paths(repo_root: Path, *args: str) -> tuple[str, ...]:
    return nul_paths(run_git(repo_root, *args))


def scan_repository(
    repo_root: Path,
    rules: Sequence[PatternRule] | None = None,
) -> AuditReport:
    root = repo_root.resolve()
    compiled_rules = tuple(rules) if rules is not None else compile_patterns()
    commits = tuple(
        commit
        for commit in run_git(root, "rev-list", "--all").decode("ascii").splitlines()
        if commit
    )
    findings: list[Finding] = []
    binary_files_skipped = 0
    symlink_files_skipped = 0

    for commit in commits:
        for path in git_paths(root, "ls-tree", "-r", "-z", "--name-only", commit):
            data = run_git(root, "show", f"{commit}:{path}")
            commit_findings, skipped = scan_blob(
                "history", f"{commit}:{path}", data, compiled_rules
            )
            findings.extend(commit_findings)
            binary_files_skipped += int(skipped)

    index_paths = git_paths(root, "ls-files", "--cached", "-z", "--")
    for path in index_paths:
        data = run_git(root, "show", f":{path}")
        index_findings, skipped = scan_blob("index", path, data, compiled_rules)
        findings.extend(index_findings)
        binary_files_skipped += int(skipped)

    worktree_paths = git_paths(
        root,
        "ls-files",
        "--cached",
        "--others",
        "--exclude-standard",
        "-z",
        "--",
    )
    for path in worktree_paths:
        file_path = root / Path(path)
        try:
            if file_path.is_symlink():
                symlink_files_skipped += 1
                continue
            if not file_path.is_file():
                continue
            data = file_path.read_bytes()
        except OSError as exc:
            raise AuditError(f"could not read working-tree file: {path}") from exc
        worktree_findings, skipped = scan_blob("worktree", path, data, compiled_rules)
        findings.extend(worktree_findings)
        binary_files_skipped += int(skipped)

    return AuditReport(
        commits=len(commits),
        index_files=len(index_paths),
        worktree_files=len(worktree_paths),
        binary_files_skipped=binary_files_skipped,
        symlink_files_skipped=symlink_files_skipped,
        findings=tuple(sorted(findings, key=lambda item: (item.location, item.line_number))),
    )


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Audit Forge Git history and files for secrets.")
    parser.add_argument("--repo", type=Path, default=DEFAULT_REPO_ROOT)
    args = parser.parse_args(argv)
    try:
        report = scan_repository(args.repo)
    except AuditError as exc:
        print(f"Secret audit ERROR: {exc}", file=sys.stderr)
        return 2

    if report.findings:
        print("Secret audit FAILED: potential secret material found; values are redacted.")
        for finding in report.findings:
            print(
                f"{finding.scope}:{finding.location}:{finding.line_number} "
                f"rule={finding.rule} context={finding.context}"
            )
        return 1

    print(
        "Secret audit PASS: "
        f"{report.commits} commit(s), {report.index_files} index file(s), "
        f"{report.worktree_files} worktree file(s); "
        f"{report.binary_files_skipped} binary and {report.symlink_files_skipped} "
        "symlink file(s) skipped."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
