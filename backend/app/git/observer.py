"""Read-only, bounded local Git observation.

The observer deliberately returns metadata only. It never invokes a shell, uses a
remote, reads source files, or runs hooks. Every Git operation is checked
explicitly and errors are reduced to safe public codes.
"""

from __future__ import annotations

import os
import re
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from threading import BoundedSemaphore, Lock, Thread
from typing import BinaryIO, Final

OBSERVER_VERSION: Final = "fnd04-git-observer-v2"
DEFAULT_TIMEOUT_SECONDS: Final = 5.0
DEFAULT_OUTPUT_LIMIT: Final = 256 * 1024
_OBSERVATION_LIMIT: Final = 4
_READ_CHUNK_SIZE: Final = 8192
_CLEANUP_TIMEOUT_SECONDS: Final = 0.5
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


@dataclass(frozen=True, slots=True)
class _GitCommandResult:
    returncode: int
    stdout: str
    stderr: str


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
        except FileNotFoundError:
            return self._error(root, "PATH_NOT_FOUND")
        except OSError:
            return self._error(root, "PATH_NOT_FOUND")
        except ValueError:
            return self._error(root, "INVALID_PATH")

        try:
            with self._semaphore:
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
                if status_result.returncode != 0:
                    status_error = status_result.stderr.casefold()
                    if status_result.returncode in {128, 129} and (
                        "not a git repository" in status_error
                        or "outside repository" in status_error
                    ):
                        code = "NOT_REPOSITORY"
                    elif status_result.returncode in {128, 129}:
                        code = "INVALID_REPOSITORY"
                    else:
                        code = "GIT_STATUS_FAILED"
                    return self._error(resolved, code)

                branch_result = self._run(
                    resolved, ["symbolic-ref", "--quiet", "--short", "HEAD"]
                )
                if branch_result.returncode == 0:
                    branch = branch_result.stdout.strip() or None
                    detached = False
                elif branch_result.returncode == 1:
                    branch = None
                    detached = True
                else:
                    return self._error(resolved, "SYMBOLIC_REF_FAILED")

                head_result = self._run(resolved, ["rev-parse", "--verify", "HEAD"])
        except _GitCommandError as exc:
            return self._error(resolved, exc.code)

        if head_result.returncode == 0:
            head_text = head_result.stdout.strip()
            head_sha = head_text if _VALID_SHA.fullmatch(head_text) else None
            if head_sha is None:
                return self._error(resolved, "INVALID_HEAD")
            unborn = False
        elif head_result.returncode == 128:
            head_sha = None
            unborn = True
        else:
            return self._error(resolved, "HEAD_LOOKUP_FAILED")

        status_lines = status_result.stdout.splitlines()
        entries = [line for line in status_lines if len(line) >= 3 and not line.startswith("##")]
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

    def _run(self, root: Path, args: list[str]) -> _GitCommandResult:
        command = ["git", "-c", "core.fsmonitor=false", "-c", "pager.status=false", *args]
        try:
            process = subprocess.Popen(
                command,
                cwd=root,
                env=self._environment(),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                shell=False,
                start_new_session=os.name != "nt",
                creationflags=(
                    subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
                ),
            )
        except FileNotFoundError as exc:
            raise _GitCommandError("GIT_UNAVAILABLE") from exc
        except OSError as exc:
            raise _GitCommandError("GIT_EXECUTION") from exc

        if process.stdout is None or process.stderr is None:
            self._terminate(process)
            raise _GitCommandError("GIT_EXECUTION")

        collector = _OutputCollector(self.output_limit)
        readers = [
            Thread(target=self._drain, args=(process.stdout, collector, False), daemon=True),
            Thread(target=self._drain, args=(process.stderr, collector, True), daemon=True),
        ]
        for reader in readers:
            reader.start()

        timed_out = False
        deadline = time.monotonic() + self.timeout_seconds
        try:
            while process.poll() is None:
                if collector.overflowed:
                    self._terminate(process)
                    break
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    timed_out = True
                    self._terminate(process)
                    break
                try:
                    process.wait(timeout=min(0.05, remaining))
                except subprocess.TimeoutExpired:
                    continue
        finally:
            if process.poll() is None:
                self._terminate(process)
            for stream in (process.stdout, process.stderr):
                stream.close()
            for reader in readers:
                reader.join(_CLEANUP_TIMEOUT_SECONDS)

        if collector.overflowed:
            raise _GitCommandError("OUTPUT_LIMIT")
        if timed_out:
            raise _GitCommandError("TIMEOUT")
        if any(reader.is_alive() for reader in readers):
            raise _GitCommandError("GIT_EXECUTION")
        return _GitCommandResult(
            returncode=process.returncode if process.returncode is not None else -1,
            stdout=collector.stdout.decode("utf-8", errors="replace"),
            stderr=collector.stderr.decode("utf-8", errors="replace"),
        )

    @staticmethod
    def _drain(stream: BinaryIO, collector: _OutputCollector, stderr: bool) -> None:
        try:
            while True:
                chunk = stream.read(_READ_CHUNK_SIZE)
                if not chunk or not collector.add(chunk, stderr):
                    return
        except (OSError, ValueError):
            return

    @staticmethod
    def _terminate(process: subprocess.Popen[bytes]) -> None:
        if process.poll() is not None:
            return
        try:
            process.terminate()
        except OSError:
            pass
        try:
            process.wait(timeout=_CLEANUP_TIMEOUT_SECONDS)
            return
        except (OSError, subprocess.TimeoutExpired):
            pass
        try:
            process.kill()
        except OSError:
            pass
        try:
            process.wait(timeout=_CLEANUP_TIMEOUT_SECONDS)
        except (OSError, subprocess.TimeoutExpired):
            pass

    @staticmethod
    def _environment() -> dict[str, str]:
        allowed = ("PATH", "SystemRoot", "ComSpec", "PATHEXT", "TEMP", "TMP")
        env = {key: os.environ[key] for key in allowed if os.environ.get(key)}
        env.setdefault("PATH", os.defpath)
        env.update(
            {
                "GIT_CONFIG_NOSYSTEM": "1",
                "GIT_CONFIG_GLOBAL": os.devnull,
                "GIT_CONFIG_SYSTEM": os.devnull,
                "GIT_TERMINAL_PROMPT": "0",
                "GIT_OPTIONAL_LOCKS": "0",
                "GIT_PAGER": "cat",
                "GIT_EDITOR": ":",
                "GIT_CONFIG_COUNT": "0",
                "LC_ALL": "C",
                "LANG": "C",
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

    @classmethod
    def _error(cls, root: str | Path, code: str) -> GitObservation:
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
            error_detail=cls._public_detail(code),
        )

    @staticmethod
    def _public_detail(code: str) -> str:
        return {
            "PATH_NOT_FOUND": "Repository path is not available.",
            "INVALID_PATH": "Repository path must be an absolute directory.",
            "NOT_REPOSITORY": "Directory is not a Git repository.",
            "INVALID_REPOSITORY": "Git repository metadata is invalid.",
            "GIT_STATUS_FAILED": "Git status failed safely.",
            "SYMBOLIC_REF_FAILED": "Git branch state could not be read.",
            "HEAD_LOOKUP_FAILED": "Git HEAD could not be read.",
            "INVALID_HEAD": "Git returned an invalid HEAD identifier.",
            "GIT_UNAVAILABLE": "Git executable is not available.",
            "GIT_EXECUTION": "Git observation could not be executed.",
            "TIMEOUT": "Git observation timed out.",
            "OUTPUT_LIMIT": "Git output exceeded the configured limit.",
        }.get(code, "Git observation failed safely.")


class _OutputCollector:
    def __init__(self, limit: int) -> None:
        self.limit = limit
        self.stdout = bytearray()
        self.stderr = bytearray()
        self.overflowed = False
        self._lock = Lock()

    def add(self, chunk: bytes, stderr: bool) -> bool:
        with self._lock:
            if self.overflowed or len(self.stdout) + len(self.stderr) + len(chunk) > self.limit:
                self.overflowed = True
                return False
            (self.stderr if stderr else self.stdout).extend(chunk)
            return True


@dataclass(frozen=True, slots=True)
class _GitCommandError(Exception):
    code: str
