"""Read-only, bounded local Git observation.

The observer deliberately returns metadata only. It never invokes a shell, uses a
remote, reads source files, or runs hooks. Errors are data so callers can persist
an honest observation without turning an unavailable repository into a success.
"""

from __future__ import annotations

import os
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from threading import BoundedSemaphore
from typing import Final

OBSERVER_VERSION: Final = "fnd04-git-observer-v1"
DEFAULT_TIMEOUT_SECONDS: Final = 5.0
DEFAULT_OUTPUT_LIMIT: Final = 256 * 1024
_OBSERVATION_LIMIT: Final = 4
_VALID_SHA = re.compile(r"^[0-9a-fA-F]{40,64}$")


@dataclass(frozen=True, slots=True)
class GitObservation:
    root: str
    head_sha: str | None
    branch: str | None
    detached: bool
    unborn: bool
    clean: bool | None
    tracked_modified_count: int
    staged_count: int
    untracked_count: int
    observer_version: str
    status: str
    error_code: str | None = None
    error_detail: str | None = None


class GitObserver:
    """Observe one repository with explicit resource and subprocess limits."""

    _semaphore = BoundedSemaphore(_OBSERVATION_LIMIT)

    def __init__(
        self,
        *,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
        output_limit: int = DEFAULT_OUTPUT_LIMIT,
    ) -> None:
        if timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be positive")
        if output_limit <= 0:
            raise ValueError("output_limit must be positive")
        self.timeout_seconds = timeout_seconds
        self.output_limit = output_limit

    def observe(self, root: str | Path) -> GitObservation:
        try:
            resolved = self._resolve_root(root)
        except OSError as exc:
            return self._error(root, "PATH_NOT_FOUND", str(exc))
        except ValueError as exc:
            return self._error(root, "INVALID_PATH", str(exc))

        try:
            with self._semaphore:
                branch_result = self._run(resolved, ["symbolic-ref", "--quiet", "--short", "HEAD"])
                head_result = self._run(resolved, ["rev-parse", "--verify", "HEAD"])
                status_result = self._run(
                    resolved,
                    [
                        "--no-optional-locks",
                        "status",
                        "--porcelain=v1",
                        "-b",
                        "--untracked-files=normal",
                    ],
                )
        except _GitCommandError as exc:
            return self._error(resolved, exc.code, exc.detail)

        branch_text = branch_result.stdout.strip()
        branch = branch_text or None
        detached = branch is None
        head_text = head_result.stdout.strip()
        unborn = head_result.returncode != 0
        head_sha = head_text if _VALID_SHA.fullmatch(head_text) else None
        if not unborn and head_sha is None:
            return self._error(resolved, "INVALID_HEAD", "Git returned an invalid HEAD identifier")

        status_lines = status_result.stdout.splitlines()
        entries = [line for line in status_lines[1:] if len(line) >= 3]
        staged = sum(1 for line in entries if line[0] not in {" ", "?"})
        modified = sum(1 for line in entries if line[1] not in {" ", "?"})
        untracked = sum(1 for line in entries if line[:2] == "??")
        return GitObservation(
            root=str(resolved),
            head_sha=head_sha,
            branch=branch,
            detached=detached,
            unborn=unborn,
            clean=not entries,
            tracked_modified_count=modified,
            staged_count=staged,
            untracked_count=untracked,
            observer_version=OBSERVER_VERSION,
            status="ok",
        )

    def _run(self, root: Path, args: list[str]) -> subprocess.CompletedProcess[str]:
        command = ["git", "-c", "core.fsmonitor=false", "-c", "pager.status=false", *args]
        try:
            result = subprocess.run(
                command,
                cwd=root,
                env=self._environment(),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=self.timeout_seconds,
                check=False,
                shell=False,
            )
        except FileNotFoundError as exc:
            raise _GitCommandError("GIT_UNAVAILABLE", "Git executable is not available") from exc
        except subprocess.TimeoutExpired as exc:
            raise _GitCommandError(
                "TIMEOUT", f"Git command exceeded {self.timeout_seconds:g}s"
            ) from exc
        except OSError as exc:
            raise _GitCommandError("GIT_EXECUTION", "Git command could not be executed") from exc
        if len(result.stdout) + len(result.stderr) > self.output_limit:
            raise _GitCommandError("OUTPUT_LIMIT", "Git output exceeded the configured limit")
        if result.returncode != 0 and args[0] == "status":
            detail = self._safe_detail(result.stderr)
            raise _GitCommandError("INVALID_REPOSITORY", detail or "Git status failed")
        return result

    @staticmethod
    def _environment() -> dict[str, str]:
        env = os.environ.copy()
        env.update(
            {
                "GIT_CONFIG_NOSYSTEM": "1",
                "GIT_CONFIG_GLOBAL": os.devnull,
                "GIT_CONFIG_SYSTEM": os.devnull,
                "GIT_TERMINAL_PROMPT": "0",
                "GIT_OPTIONAL_LOCKS": "0",
                "GIT_PAGER": "cat",
                "GIT_EDITOR": ":",
            }
        )
        return env

    @staticmethod
    def _resolve_root(root: str | Path) -> Path:
        candidate = Path(root).expanduser()
        if not candidate.is_absolute():
            raise ValueError("Repository path must be absolute")
        resolved = candidate.resolve(strict=True)
        if not resolved.is_dir():
            raise ValueError("Repository path must be a directory")
        return resolved

    @staticmethod
    def _safe_detail(detail: str) -> str:
        clean = " ".join(detail.split())
        return clean[:240]

    @classmethod
    def _error(cls, root: str | Path, code: str, detail: str) -> GitObservation:
        try:
            safe_root = str(Path(root).expanduser().resolve())
        except OSError:
            safe_root = str(root)
        return GitObservation(
            root=safe_root,
            head_sha=None,
            branch=None,
            detached=False,
            unborn=False,
            clean=None,
            tracked_modified_count=0,
            staged_count=0,
            untracked_count=0,
            observer_version=OBSERVER_VERSION,
            status="error",
            error_code=code,
            error_detail=cls._safe_detail(detail),
        )


@dataclass(frozen=True, slots=True)
class _GitCommandError(Exception):
    code: str
    detail: str
