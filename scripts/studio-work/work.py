#!/usr/bin/env python3
"""Keeps a piece of work in Xeno Studio as it goes, so any session can pick it up where the last one stopped.

A work (docs/work.md) is kept in the studio: its plan, its journal (what was done, what comes next, what was
decided and why, the questions for a person), its record, the code it ran on, and its files, every version, sent
straight to storage in parts. This puts a machine's side of it there and back:

  python3 scripts/studio-work/work.py list                       # work in progress, and who is on it
  python3 scripts/studio-work/work.py start "Aurixa Reel 2" --goal "..." --root records=docs/brands/aurixa-reel-2
  python3 scripts/studio-work/work.py resume <work id, or words of its title>   # take it up here
  python3 scripts/studio-work/work.py save -m "what was done" --next "what comes next" [--decision "what :: why"]
  python3 scripts/studio-work/work.py status | pull | push | note -m ... | link <kind> <id> | track name=folder
  python3 scripts/studio-work/work.py restore-code [--here]       # the code as the work last left it
  python3 scripts/studio-work/work.py release                     # stop working on it here, for the next session
  python3 scripts/studio-work/work.py run -m "Drawing the film" -- <command>   # a long job, the work held while it runs
  python3 scripts/studio-work/work.py gate post Film --note-file note.txt "The film=film.mp4" "The cover=cover.jpg"

A work's files sit under its roots: names for folders (records=docs/brands/aurixa-reel-2), and "work", a folder
of its own (.xeno-work/<id>/files) for what doesn't belong in git (frames, renders, references). Every save sends
what changed since the last: each file cut into parts of 32 MiB, each part sent once a work, by its SHA-256. And
every save keeps the code as it stands, under work/code: the commits no remote holds yet (commits.bundle) and the
changes not committed (uncommitted.patch). Resume puts all of it back, each part and file checked by its SHA-256.

This repository's Claude Code hooks (.claude/settings.json) run it by themselves for the work a checkout is on:
at a session's start they take it up again and print where it stands (or, with none, list the work in progress);
while the session works they keep its files every few minutes; at the end of every turn they save the turn's last
words; when a turn is cut short (a usage limit, an error) they say so and let the work go for the next session;
and as the session ends they save once more. So a session that stops at any moment leaves its work where the
next one, here or anywhere, can carry it on. XENO_WORK_HOOKS=0 turns them off.

The studio is XENO_STUDIO_URL (default https://canvas-xeno-studio.lovable.app), with a personal token in
XENO_STUDIO_TOKEN (Settings, API access, with the read and edit scopes), or one the network adds.
"""
from __future__ import annotations

import argparse
import base64
import calendar
import fnmatch
import hashlib
import json
import os
import re
import shlex
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

BASE = os.environ.get("XENO_STUDIO_URL", "https://canvas-xeno-studio.lovable.app").rstrip("/")
TOKEN = os.environ.get("XENO_STUDIO_TOKEN")
# Files are sent in parts of this size (the studio's own, 32 MiB; smaller only in tests).
CHUNK = int(os.environ.get("XENO_WORK_CHUNK_BYTES", str(32 * 1024 * 1024)))
# Cloudflare refuses Python's default user agent (error 1010).
AGENT = "xeno-studio-work/1.0 (studio API script)"
AUTO_EVERY = int(os.environ.get("XENO_WORK_AUTOSAVE_SECONDS", "180"))
MAX_FILE = int(os.environ.get("XENO_WORK_MAX_FILE_BYTES", str(20 * 1024**3)))
# An automatic save leaves a file changed this recently to the next one: it may still be being written.
SETTLE = int(os.environ.get("XENO_WORK_SETTLE_SECONDS", "15"))
# The code kept with every save: untracked files up to this size, a patch and a bundle up to these.
UNTRACKED_MAX = 64 * 1024 * 1024
PATCH_MAX = 1024**3
BUNDLE_MAX = 1024**3
KEEP_CODE = os.environ.get("XENO_WORK_CODE", "1") not in ("0", "off", "false", "no")
HOOKS_ON = os.environ.get("XENO_WORK_HOOKS", "1") not in ("0", "off", "false", "no")
# How long a session's hold lasts unless renewed: long enough for a render between two saves.
HOLD_SECONDS = 1800
# How much goes in one request (the studio takes 500 files a save and 200 parts an offer); smaller only in tests.
FILES_PER_SAVE = int(os.environ.get("XENO_WORK_FILES_PER_SAVE", "400"))
PARTS_PER_OFFER = int(os.environ.get("XENO_WORK_PARTS_PER_OFFER", "200"))
FILES_PER_PAGE = int(os.environ.get("XENO_WORK_FILES_PER_PAGE", "200"))
WIDTH = 4
WORK_ROOT = "work"
CODE = "code"
STEP_STATUSES = ("todo", "doing", "done", "blocked", "skipped")
# Never kept: version control, dependencies, caches, this tool's own folder, and copies pull set aside.
IGNORE = [
    ".git", ".git/*", "*/.git/*", "node_modules", "*/node_modules/*", "__pycache__", "*/__pycache__/*",
    "*.pyc", ".DS_Store", "*/.DS_Store", ".xeno-work", ".xeno-work/*", "*/.xeno-work/*", "*.studio-v*",
    ".output/*", "dist/*", ".vinxi/*", ".tanstack/*", ".nitro/*",
]
SECRET = re.compile(r"\b(xs_[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16})\b")
# How long a call waits, and how often it is tried: hooks, which a session waits for, ask for less.
PATIENCE = {"timeout": float(os.environ.get("XENO_WORK_TIMEOUT", "90")), "tries": int(os.environ.get("XENO_WORK_TRIES", "4"))}


def repo_root() -> Path:
    project = os.environ.get("CLAUDE_PROJECT_DIR")
    if project and Path(project).is_dir():
        return Path(project).resolve()
    try:
        top = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, timeout=5)
        if top.returncode == 0 and top.stdout.strip():
            return Path(top.stdout.strip()).resolve()
    except (OSError, subprocess.SubprocessError):
        pass
    return Path(__file__).resolve().parents[2]


ROOT = repo_root()
HOME = Path(os.environ.get("XENO_WORK_HOME", str(ROOT / ".xeno-work")))


def say(*parts, quiet=False):
    if not quiet:
        print(*parts, flush=True)


def stamp() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def clip(text: str, n: int) -> str:
    return text if len(text) <= n else text[: n - 1].rstrip() + "…"


def scrub(text: str) -> str:
    """A token that ended up in words is never sent with them."""
    return SECRET.sub("[a secret, left out]", text)


def size_label(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1000 or unit == "TB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1000
    return f"{n} B"


def plural(n: int, one: str, many: str | None = None) -> str:
    return f"{n} {one if n == 1 else (many or one + 's')}"


def request_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:24]}"


# ---------------------------------------------------------------- the studio ----------------------------------------------------------------


class StudioError(Exception):
    def __init__(self, code, message, status=None):
        super().__init__(f"{code}: {message}")
        self.code, self.message, self.status = code, message, status

    @property
    def passing(self) -> bool:
        """The network or the studio stumbled: the same request may well work later."""
        return self.code == "NETWORK" or self.status in (408, 429) or (self.status or 0) >= 500


def call(op: str, args: dict, timeout: float | None = None, tries: int | None = None):
    """One operation of the studio's API; tried again (2, 4, 8 s) when the network or the studio stumbles."""
    timeout = timeout or PATIENCE["timeout"]
    tries = tries or int(PATIENCE["tries"])
    body = json.dumps(args).encode()
    headers = {"content-type": "application/json", "user-agent": AGENT}
    if TOKEN:
        headers["authorization"] = f"Bearer {TOKEN}"
    for attempt in range(tries):
        request = urllib.request.Request(f"{BASE}/api/public/studio/{op}", data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.loads(response.read())["result"]
        except urllib.error.HTTPError as failure:
            text = failure.read().decode(errors="replace")
            try:
                error = json.loads(text)["error"]
            except (ValueError, KeyError, TypeError):
                error = {"code": f"HTTP_{failure.code}", "message": text[:300]}
            if failure.code in (408, 429, 500, 502, 503, 504) and attempt < tries - 1:
                time.sleep(2 ** (attempt + 1))
                continue
            raise StudioError(error.get("code"), error.get("message"), failure.code) from None
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as failure:
            if attempt < tries - 1:
                time.sleep(2 ** (attempt + 1))
                continue
            raise StudioError("NETWORK", str(getattr(failure, "reason", failure))) from None
    raise StudioError("NETWORK", "no answer")


def transfer(url: str, data: bytes | None = None, headers: dict | None = None, timeout: float = 600, tries: int | None = None):
    """A part's bytes to or from storage, by the signed address the studio gave (no token goes with it)."""
    tries = tries or max(int(PATIENCE["tries"]), 1)
    for attempt in range(tries):
        request = urllib.request.Request(url, data=data, headers={"user-agent": AGENT, **(headers or {})},
                                         method="PUT" if data is not None else "GET")
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.read()
        except urllib.error.HTTPError as failure:
            text = failure.read().decode(errors="replace")[:300]
            # Already there (an upload that finished but wasn't recorded): the save checks it.
            if data is not None and failure.code in (400, 409) and ("exist" in text.lower() or "duplicate" in text.lower()):
                return b""
            if failure.code in (408, 429, 500, 502, 503, 504) and attempt < tries - 1:
                time.sleep(2 ** (attempt + 1))
                continue
            raise StudioError(f"STORAGE_{failure.code}", text, failure.code) from None
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as failure:
            if attempt < tries - 1:
                time.sleep(2 ** (attempt + 1))
                continue
            raise StudioError("NETWORK", str(getattr(failure, "reason", failure))) from None
    raise StudioError("NETWORK", "no answer")


def session() -> dict:
    """This session, as it holds a work: Claude Code's own id where it runs in Claude Code."""
    if os.environ.get("XENO_WORK_SESSION"):
        sid = re.sub(r"[^\x21-\x7e]", "", os.environ["XENO_WORK_SESSION"])[:200] or "script"
        return {"id": sid, "label": sid[:300], "kind": "script"}
    sid = re.sub(r"[^\x21-\x7e]", "", os.environ.get("CLAUDE_CODE_SESSION_ID", ""))
    if sid:
        label = f"Claude Code session {sid[:8]}"
        # A cloud session says where it is on the web: claude.ai/code/session_… for its cse_… id.
        remote = re.fullmatch(r"cse_([A-Za-z0-9]+)", os.environ.get("CLAUDE_CODE_REMOTE_SESSION_ID", "")) or re.search(
            r"/sessions/cse_([A-Za-z0-9]+)", os.environ.get("CLAUDE_CODE_REMOTE_SDK_URL", ""))
        if remote:
            label += f" (claude.ai/code/session_{remote.group(1)})"
        return {"id": f"claude-code:{sid}"[:200], "label": label, "kind": "claude_code"}
    host = re.sub(r"[^\x21-\x7e]", "", socket.gethostname())[:60] or "machine"
    user = os.getuid() if hasattr(os, "getuid") else 0
    return {"id": f"script:{host}:{user}", "label": f"work.py on {host}", "kind": "script"}


# ---------------------------------------------------------------- the code ----------------------------------------------------------------


def git(*args: str, env: dict | None = None, data: bytes | None = None, timeout: float = 120):
    """git in this checkout: (whether it worked, its output as bytes, its complaint)."""
    try:
        done = subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True, input=data, timeout=timeout,
                              env={**os.environ, **(env or {})})
        return done.returncode == 0, done.stdout, done.stderr.decode(errors="replace").strip()
    except (OSError, subprocess.SubprocessError) as failure:
        return False, b"", str(failure)


def git_text(*args: str, env: dict | None = None) -> str | None:
    ok, out, _ = git(*args, env=env)
    return out.decode(errors="replace").strip() if ok else None


def in_git() -> bool:
    return git_text("rev-parse", "--is-inside-work-tree") == "true"


def git_path(name: str) -> Path | None:
    found = git_text("rev-parse", "--git-path", name)
    if not found:
        return None
    path = Path(found)
    return path if path.is_absolute() else ROOT / path


def keep_out_of_git():
    """This tool's own folder, and the studio's copies pull sets beside a file changed here, are never part of
    the code: said once in the checkout's own exclude file (never in a file git tracks)."""
    exclude = git_path("info/exclude")
    if not exclude:
        return
    try:
        text = exclude.read_text() if exclude.exists() else ""
        missing = [line for line in (".xeno-work/", "*.studio-v*") if line not in text.splitlines()]
        if missing:
            exclude.parent.mkdir(parents=True, exist_ok=True)
            with open(exclude, "a") as handle:
                handle.write(("" if not text or text.endswith("\n") else "\n") + "\n".join(missing) + "\n")
    except OSError:
        pass


def outside(cfg: dict | None) -> list[str]:
    """Pathspecs for what the code kept with a work leaves out: this tool's folder, and the work's own roots
    inside the checkout (their files are kept as the work's)."""
    specs = [":(exclude).xeno-work"]
    for name, where in sorted(((cfg or {}).get("roots") or {}).items()):
        try:
            rel = resolve_root(where).resolve().relative_to(ROOT)
        except (ValueError, OSError):
            continue
        rel_text = rel.as_posix()
        if rel_text in ("", "."):
            specs.append(":(exclude).")  # the whole checkout is a root: no patch at all
        elif not rel_text.startswith(".xeno-work"):
            specs.append(f":(exclude){rel_text}")
    return specs


def code_version(cfg: dict | None = None) -> dict | None:
    """The code the work runs on: the repository (never its credentials), branch, commit, whether it has changes
    not committed, and how many of its commits no remote holds yet."""
    if not in_git():
        return None
    commit = git_text("rev-parse", "--verify", "-q", "HEAD")
    if not commit:
        return None
    status = git_text("status", "--porcelain", "--", ".", ":(exclude).xeno-work") or ""
    code: dict = {"commit": commit, "branch": git_text("rev-parse", "--abbrev-ref", "HEAD") or "HEAD", "dirty": bool(status)}
    upstream = git_text("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")
    if upstream:
        code["upstream"] = upstream
    if git_text("remote"):
        count = git_text("rev-list", "--count", "HEAD", "--not", "--remotes")
        if count and count.isdigit():
            code["unpushed"] = int(count)
    remote = git_text("config", "--get", "remote.origin.url") or ""
    found = re.search(r"github\.com[:/]+([^/]+/[^/]+?)(?:\.git)?/?$", remote) or re.search(r"/git/([^/]+/[^/]+?)(?:\.git)?/?$", remote)
    if found:
        code["repository"] = found.group(1)
    return code


def code_folder(cfg: dict) -> Path | None:
    where = (cfg.get("roots") or {}).get(WORK_ROOT)
    return resolve_root(where) / CODE if where else None


def write_if_changed(path: Path, data: bytes) -> bool:
    try:
        if path.is_file() and path.stat().st_size == len(data) and path.read_bytes() == data:
            return False
    except OSError:
        pass
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)
    return True


def remove(path: Path):
    try:
        path.unlink()
    except OSError:
        pass


def uncommitted_patch(cfg: dict):
    """Every change not committed (staged or not, and the files git doesn't ignore and doesn't track), as one
    binary patch from HEAD, made in an index and an object store of its own so the checkout's are left alone.
    Returns (the patch, the untracked files left out as too large)."""
    specs = ["--", ".", *outside(cfg)]
    index = git_path("index")
    objects = git_path("objects")
    if not objects:
        return None, []
    with tempfile.TemporaryDirectory(prefix="xeno-work-") as scratch:
        env = {
            "GIT_INDEX_FILE": os.path.join(scratch, "index"),
            "GIT_OBJECT_DIRECTORY": os.path.join(scratch, "objects"),
            "GIT_ALTERNATE_OBJECT_DIRECTORIES": str(objects),
        }
        os.makedirs(env["GIT_OBJECT_DIRECTORY"])
        if index and index.is_file():
            shutil.copyfile(index, env["GIT_INDEX_FILE"])  # its stat cache: only what changed is read
        elif not git("read-tree", "HEAD", env=env)[0]:
            return None, []
        if not git("add", "-u", *specs, env=env)[0]:
            return None, []
        ok, listed, _ = git("ls-files", "--others", "--exclude-standard", "-z", *specs, env=env)
        if not ok:
            return None, []
        keep, skipped = [], []
        for name in listed.decode(errors="surrogateescape").split("\0"):
            if not name:
                continue
            try:
                size = (ROOT / name).lstat().st_size
            except OSError:
                continue
            (skipped if size > UNTRACKED_MAX else keep).append((name, size))
        if keep and not git("--literal-pathspecs", "add", "--pathspec-from-file=-", "--pathspec-file-nul", env=env,
                            data="\0".join(name for name, _ in keep).encode(errors="surrogateescape"))[0]:
            return None, []
        ok, patch, _ = git("diff", "--cached", "--binary", "--no-color", "--no-ext-diff", "--no-renames", "HEAD",
                           *specs, env=env, timeout=600)
        return (patch if ok else None), skipped


def snapshot_code(cfg: dict, quiet: bool = True):
    """The code as it stands, kept under the work's own root (work/code) so a session anywhere can carry on from
    exactly here: the commits no remote holds yet (commits.bundle), the changes not committed (uncommitted.patch),
    and what they are (state.json). Returns (the code record for the save, notes on what was left out)."""
    code = code_version(cfg)
    folder = code_folder(cfg)
    if not code or not folder or not KEEP_CODE:
        return code, []
    if cfg.get("codeBehind"):
        if not code_is_here(cfg):
            # This checkout hasn't taken up the code kept with the work: saving its own would put it out of view.
            return None, ["this checkout hasn't taken up the work's code (restore-code), so the work keeps the code it had"]
        cfg["codeBehind"] = None
        save_local(cfg)
    notes: list[str] = []
    folder.mkdir(parents=True, exist_ok=True)
    bundle, patch_file, state_file = folder / "commits.bundle", folder / "uncommitted.patch", folder / "state.json"
    marker = work_dir(cfg["workId"]) / "bundle.key"
    head = code["commit"]
    has_remote = bool(git_text("remote"))
    # The commits no remote holds (all of them where there is no remote): only this machine has them.
    if has_remote:
        commits = (git_text("rev-list", "HEAD", "--not", "--remotes") or "").split()
    else:
        commits = (git_text("rev-list", "HEAD") or "").split()
    if commits:
        key = hashlib.sha256("\n".join([head, *commits]).encode()).hexdigest()
        known = read_json(marker, {}) if marker.is_file() else {}
        made = isinstance(known, dict) and known.get("key") == key and bundle.is_file() and \
            known.get("sha256") == hash_file(bundle)[0]
        if not made:
            tmp = folder / ".commits.bundle.tmp"
            ok, _, complaint = git("bundle", "create", str(tmp), "HEAD", *(["--not", "--remotes"] if has_remote else []),
                                   timeout=600)
            if ok and tmp.is_file() and tmp.stat().st_size <= BUNDLE_MAX:
                os.replace(tmp, bundle)
                write_json(marker, {"key": key, "sha256": hash_file(bundle)[0]})
            else:
                remove(tmp)
                notes.append(f"{plural(len(commits), 'commit')} no remote holds couldn't be bundled"
                             + (f" ({clip(complaint, 160)})" if complaint and not ok else " (larger than 1 GB)"))
    else:
        remove(bundle)
        remove(marker)
    # The changes not committed, outside the work's own roots.
    skipped = []
    if code.get("dirty"):
        patch, skipped = uncommitted_patch(cfg)
        if patch is None:
            notes.append("the changes not committed couldn't be read from git")
        elif len(patch) > PATCH_MAX:
            remove(patch_file)
            notes.append("the changes not committed come to more than 1 GB: they aren't kept")
        elif patch:
            write_if_changed(patch_file, patch)
        else:
            remove(patch_file)
        if skipped:
            notes.append("left out of the code kept (larger than 64 MB): " + ", ".join(
                f"{name} ({size_label(size)})" for name, size in skipped[:5]) + (f" and {len(skipped) - 5} more" if len(skipped) > 5 else ""))
    else:
        remove(patch_file)
    state = {
        "head": head,
        "branch": code.get("branch"),
        "upstream": code.get("upstream"),
        "repository": code.get("repository"),
        "unpushed": len(commits) if has_remote else None,
        "remote": has_remote,
        "bundle": bundle.is_file(),
        "patch": patch_file.is_file(),
        "outsidePatch": sorted(name for name in (cfg.get("roots") or {}) if name != WORK_ROOT),
        "leftOut": [name for name, _ in skipped],
    }
    write_if_changed(state_file, (json.dumps(state, indent=1, sort_keys=True) + "\n").encode())
    return code, notes


def committer() -> dict:
    """Who a merge bringing the work's code over is made by, where this checkout names nobody."""
    if git_text("config", "user.email"):
        return {}
    name, email = "Xeno Studio work.py", "work-py@users.noreply.xeno.studio"
    return {"GIT_COMMITTER_NAME": name, "GIT_COMMITTER_EMAIL": email, "GIT_AUTHOR_NAME": name, "GIT_AUTHOR_EMAIL": email}


def has_commit(commit: str) -> bool:
    return git("cat-file", "-e", f"{commit}^{{commit}}")[0]


def is_ancestor(older: str, newer: str) -> bool:
    return git("merge-base", "--is-ancestor", older, newer)[0]


def worktree_clean(cfg: dict | None) -> bool:
    """No changes of the checkout's own, outside the work's roots (what pull wrote there is the work's; where it
    matters, git itself refuses to check out or pick a commit over it)."""
    return not (git_text("status", "--porcelain", "--", ".", *outside(cfg)) or "")


def fetch_head(cfg: dict, state: dict) -> tuple[bool, str]:
    """The work's commit in this checkout: here already, from the work's bundle, or from the remote."""
    head = state["head"]
    if has_commit(head):
        return True, ""
    bundle = code_folder(cfg) / "commits.bundle"
    if not state.get("bundle"):
        bundle = Path("/nonexistent/commits.bundle")  # one left from an older snapshot isn't this one's
    if git_text("remote"):
        git("fetch", "--quiet", "--all", timeout=600)  # what the bundle stands on, or the commit itself
        if has_commit(head):
            return True, ""
    if bundle.is_file():
        ok, _, complaint = git("bundle", "verify", "--quiet", str(bundle))
        if not ok:
            return False, f"the work's bundle can't be read here: {clip(complaint, 300)}"
        ok, _, complaint = git("fetch", "--quiet", str(bundle), f"HEAD:refs/xeno-work/{cfg['workId']}", timeout=600)
        if not ok:
            return False, f"the work's commits couldn't be fetched from its bundle: {clip(complaint, 300)}"
        if has_commit(head):
            return True, ""
    return False, f"commit {head[:12]} isn't here, on the remote, or in a bundle kept with the work"


def apply_patch(cfg: dict, quiet: bool) -> tuple[bool, str]:
    """The work's changes not committed, applied here: only those its state names (a file left from an older
    snapshot is never applied)."""
    patch = code_folder(cfg) / "uncommitted.patch"
    if not (code_state(cfg) or {}).get("patch") or not patch.is_file():
        return True, ""
    if git("apply", "--check", "--binary", str(patch))[0]:
        ok, _, complaint = git("apply", "--binary", str(patch))
        return ok, "" if ok else clip(complaint, 300)
    if git("apply", "--check", "--reverse", "--binary", str(patch))[0]:
        return True, "already here"
    _, _, complaint = git("apply", "--check", "--binary", str(patch))
    return False, clip(complaint, 400)


def code_state(cfg: dict) -> dict | None:
    """What the code kept with the work is (work/code/state.json, as this checkout last had it from the work)."""
    folder = code_folder(cfg)
    state = read_json(folder / "state.json", None) if folder else None
    return state if isinstance(state, dict) and state.get("head") else None


def code_is_here(cfg: dict) -> bool:
    """Whether this checkout holds the code kept with the work: its commit, and its changes not committed."""
    state = code_state(cfg)
    if not state or not in_git():
        return True
    current = git_text("rev-parse", "--verify", "-q", "HEAD")
    if not current or not has_commit(state["head"]) or not is_ancestor(state["head"], current):
        return False
    patch = code_folder(cfg) / "uncommitted.patch"
    if state.get("patch") and patch.is_file():
        return git("apply", "--check", "--reverse", "--binary", str(patch))[0]
    return True


def default_branch() -> str | None:
    """The remote's default branch (origin/main), where it can be told."""
    ref = git_text("symbolic-ref", "--quiet", "refs/remotes/origin/HEAD")
    if ref and ref.startswith("refs/remotes/"):
        return ref[len("refs/remotes/"):]
    for name in ("origin/main", "origin/master"):
        if git_text("rev-parse", "--verify", "-q", f"refs/remotes/{name}"):
            return name
    return None


def merge_here(cfg: dict, state: dict, tell) -> bool:
    """The work's commits brought onto the branch this checkout is on: a fast-forward where it can, a merge
    otherwise (its commits keep who they are, so pushing this branch pushes them too). Nothing is changed when
    they don't go on cleanly."""
    head, branch = state["head"], state.get("branch") or "HEAD"
    current_branch = git_text("rev-parse", "--abbrev-ref", "HEAD") or "HEAD"
    if is_ancestor("HEAD", head):
        ok, _, complaint = git("merge", "--ff-only", "--quiet", head, timeout=600)
        if ok:
            tell(f"Brought the work's code onto {current_branch} (to {head[:12]}).")
            return True
    else:
        message = f"Carry on {cfg.get('title') or 'the work'}: its code from {branch}"
        ok, _, complaint = git("merge", "--no-edit", "--quiet", "-m", message, head, env=committer(), timeout=600)
        if ok:
            tell(f"Merged the work's code from {branch} into {current_branch}.")
            return True
        git("merge", "--abort")
    tell(f"The work's code didn't go onto {current_branch} cleanly ({clip(complaint, 300)}): nothing was changed. "
         f"`python3 scripts/studio-work/work.py restore-code` checks out {branch} instead.")
    return False


def check_out(state: dict, tell) -> bool:
    """The work's own branch checked out at its commit (made, or moved on to it, where that loses nothing)."""
    head, branch = state["head"], state.get("branch") or "HEAD"
    if branch == "HEAD":
        ok, _, complaint = git("checkout", "-q", "--detach", head)
        if not ok:
            tell(f"Couldn't check out {head[:12]}: {clip(complaint, 300)}")
            return False
        tell(f"Checked out {head[:12]}, where the work left it.")
        return True
    exists = git_text("rev-parse", "--verify", "-q", f"refs/heads/{branch}")
    if exists and exists != head and not is_ancestor(exists, head):
        tell(f"This checkout's {branch} has commits the work's doesn't: `python3 scripts/studio-work/work.py "
             f"restore-code --here` brings the work's onto it instead, or check out {head[:12]} yourself.")
        return False
    ok, _, complaint = git("checkout", "-q", "-B", branch, head)
    if not ok:
        tell(f"Couldn't check out {branch} at {head[:12]}: {clip(complaint, 300)}")
        return False
    tell(f"Checked out {branch} at {head[:12]}, where the work left it.")
    return True


def restore_code(cfg: dict, *, here: bool = False, force: bool = False, quiet: bool = False, automatic: bool = False) -> bool:
    """The code as the work last left it, in this checkout: its commits and its changes not committed.

    Asked for (restore-code), it checks out the work's own branch at its commit, or with --here brings the work's
    commits onto the branch this checkout is on. On resume, it puts the code back wherever nothing is disturbed:
    the checkout has no changes of its own, and its branch is the work's, or has no commits of its own (a fresh
    checkout of the default branch, or a branch just made from it, as a cloud session starts on). Otherwise it
    says how."""
    state = code_state(cfg)
    if not state:
        if not automatic:
            say("No code was kept with this work.", quiet=quiet)
        return not automatic
    if not in_git():
        say(f"This isn't a git checkout: the work's code is in {code_folder(cfg)}", quiet=quiet)
        return False
    head, branch = state["head"], state.get("branch") or "HEAD"
    current = git_text("rev-parse", "--verify", "-q", "HEAD") or ""
    current_branch = git_text("rev-parse", "--abbrev-ref", "HEAD") or "HEAD"
    clean = worktree_clean(cfg)
    how = "python3 scripts/studio-work/work.py restore-code"

    def tell(*lines):
        say("\n".join(lines), quiet=quiet)

    def guidance():
        tell(f"The work's code was on {branch} at {head[:12]}"
             + (f", with {plural(state.get('unpushed') or 0, 'commit')} no remote held" if state.get("unpushed") else "")
             + (", with changes not committed" if state.get("patch") else "") + "; this checkout is on "
             + f"{current_branch} at {current[:12] or 'no commit'}" + (" with changes of its own" if not clean else "") + ".",
             f"To carry the code on: `{how}` (switches to {branch}), or `{how} --here` (brings its commits and "
             f"changes onto {current_branch}). Until then, saves from here keep the work's code as it is.")

    if code_is_here(cfg):
        # Its commit is in this checkout's history and its changes are applied: nothing to put back.
        if not automatic:
            tell(f"The work's code is here already ({branch} at {head[:12]}"
                 + (", with its changes not committed" if state.get("patch") else "") + ").")
        return True
    contained = bool(current) and has_commit(head) and is_ancestor(head, current)
    if automatic:
        if not clean:
            guidance()
            return False
        base = default_branch()
        fresh = bool(current) and bool(base) and is_ancestor(current, base)
        if contained or current == head:
            moved = True
        elif branch == current_branch and branch != "HEAD" and (not has_commit(head) or is_ancestor(current, head)):
            ok, why = fetch_head(cfg, state)
            moved = ok and check_out(state, tell)
            if not ok:
                tell(f"The work's code can't be put back: {why}.")
        elif fresh:
            ok, why = fetch_head(cfg, state)
            if not ok:
                tell(f"The work's code can't be put back: {why}.")
                return False
            # The default branch itself is left as it is: the work's branch is checked out instead.
            on_default = base is not None and current_branch == base.split("/", 1)[1]
            moved = check_out(state, tell) if (on_default or current_branch == "HEAD") else merge_here(cfg, state, tell)
        else:
            guidance()
            return False
        if not moved:
            return False
    else:
        if not clean and not force:
            tell("This checkout has changes of its own: commit or stash them first (or --force to try anyway).")
            return False
        if current != head and not (contained and here):
            ok, why = fetch_head(cfg, state)
            if not ok:
                tell(f"The work's code can't be put back: {why}.")
                return False
            if not (merge_here(cfg, state, tell) if here else check_out(state, tell)):
                return False
    ok, why = apply_patch(cfg, quiet)
    if not ok:
        tell(f"Its changes not committed didn't apply here ({why}); they are in {code_folder(cfg) / 'uncommitted.patch'}.")
        return False
    if state.get("patch"):
        tell("Its changes not committed are back." if why != "already here" else "Its changes not committed are here already.")
    if state.get("leftOut"):
        tell("Left out of the code kept (too large): " + ", ".join(state["leftOut"][:5]))
    return True


# ---------------------------------------------------------------- on this machine ----------------------------------------------------------------


def work_dir(work_id: str) -> Path:
    return HOME / work_id


def read_json(path: Path, default):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return default


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(json.dumps(value, indent=1) + "\n")
    os.replace(tmp, path)


def local_works() -> list[dict]:
    if not HOME.is_dir():
        return []
    found = []
    for entry in sorted(HOME.iterdir()):
        cfg = read_json(entry / "work.json", None)
        if isinstance(cfg, dict) and cfg.get("workId"):
            found.append(cfg)
    return found


def attached_works() -> list[dict]:
    """The work this checkout is on (start and resume attach one; release and finishing let it go)."""
    return [cfg for cfg in local_works() if cfg.get("attached") and cfg.get("autosave", True)]


def save_local(cfg: dict):
    write_json(work_dir(cfg["workId"]) / "work.json", cfg)


def local_config(work: dict, roots: dict | None = None) -> dict:
    """A work as this machine keeps it: its roots (the work's, with any given here), its own folder."""
    before = read_json(work_dir(work["id"]) / "work.json", {}) or {}
    merged = {**(work.get("roots") or {}), **(before.get("roots") or {}), **(roots or {})}
    merged.setdefault(WORK_ROOT, f".xeno-work/{work['id']}/files")
    cfg = {
        **before,
        "workId": work["id"],
        "title": work.get("title", before.get("title", "")),
        "base": BASE,
        "roots": merged,
        "autosave": before.get("autosave", True),
        "ignore": before.get("ignore", []),
        "session": session()["id"],
        "attached": True,
    }
    resolve_root(merged[WORK_ROOT]).mkdir(parents=True, exist_ok=True)
    save_local(cfg)
    keep_out_of_git()
    return cfg


def attach_only(cfg: dict, quiet: bool = False):
    """A checkout is on one work at a time: the others it was on are let go (resume one to switch back)."""
    for other in attached_works():
        if other["workId"] == cfg["workId"]:
            continue
        other["attached"] = False
        save_local(other)
        try:
            call("release_work", {"workId": other["workId"], "session": session(),
                                  "summary": f"Let go: this checkout moved on to {cfg.get('title') or 'another work'}."})
        except StudioError:
            pass
        say(f"Let go of {other.get('title')} here (python3 scripts/studio-work/work.py resume {other['workId']} to go back to it).", quiet=quiet)


def resolve_root(path: str) -> Path:
    p = Path(os.path.expanduser(path))
    return p if p.is_absolute() else ROOT / p


def ignored(rel: str, patterns: list[str]) -> bool:
    name = rel.split("/")[-1]
    return any(fnmatch.fnmatch(rel, pattern) or fnmatch.fnmatch(name, pattern) for pattern in patterns)


def scan(cfg: dict):
    """Every file under the work's roots, as path in the work → (file, its stat), and what was left out and why."""
    found, skipped, missing_roots = {}, [], []
    base_patterns = IGNORE + list(cfg.get("ignore") or [])
    for name, where in sorted((cfg.get("roots") or {}).items()):
        base = resolve_root(where)
        if not base.is_dir():
            missing_roots.append(name)
            continue
        patterns = list(base_patterns)
        own = base / ".xenoignore"
        if own.is_file():
            patterns += [line.strip() for line in own.read_text().splitlines() if line.strip() and not line.startswith("#")]
        for folder, dirs, files in os.walk(base, followlinks=False):
            rel_folder = os.path.relpath(folder, base).replace(os.sep, "/")
            rel_folder = "" if rel_folder == "." else rel_folder + "/"
            dirs[:] = sorted(d for d in dirs if not ignored(rel_folder + d, patterns))
            for file in sorted(files):
                rel = rel_folder + file
                if ignored(rel, patterns):
                    continue
                full = Path(folder) / file
                try:
                    info = full.lstat()
                except OSError:
                    continue
                path = f"{name}/{rel}"
                if full.is_symlink() or not full.is_file():
                    skipped.append((path, "not a plain file"))
                    continue
                if info.st_size > MAX_FILE:
                    skipped.append((path, f"larger than {size_label(MAX_FILE)}"))
                    continue
                if len(path) > 500 or any(ord(c) < 32 for c in path) or "\\" in path:
                    skipped.append((path[:120], "a path the studio can't keep"))
                    continue
                found[path] = (full, info)
    return found, skipped, missing_roots


def hash_file(full: Path):
    """A file's SHA-256, and each of its parts' SHA-256, MD5 and size, in one read."""
    whole = hashlib.sha256()
    parts = []
    with open(full, "rb") as handle:
        while True:
            data = handle.read(CHUNK)
            if not data:
                break
            whole.update(data)
            parts.append({"sha256": hashlib.sha256(data).hexdigest(), "md5": hashlib.md5(data).hexdigest(), "size": len(data)})
    return whole.hexdigest(), parts


def index_of(cfg: dict) -> dict:
    index = read_json(work_dir(cfg["workId"]) / "index.json", None)
    return index if isinstance(index, dict) and isinstance(index.get("files"), dict) else {"files": {}}


def save_index(cfg: dict, index: dict):
    write_json(work_dir(cfg["workId"]) / "index.json", index)


def changes(cfg: dict, index: dict, only: list[str] | None = None, settle: int = 0):
    """What changed since the work last kept this machine's files: files new or different, and files gone."""
    found, skipped, missing_roots = scan(cfg)
    known = index["files"]
    now = time.time()
    changed, waiting = [], 0
    for path, (full, info) in sorted(found.items()):
        if only and not under(path, only):
            continue
        entry = known.get(path)
        if entry and entry.get("size") == info.st_size and entry.get("mtime_ns") == info.st_mtime_ns and entry.get("parts") is not None:
            if entry.get("saved_sha") == entry.get("sha256"):
                continue
            sha, parts = entry["sha256"], entry["parts"]
        else:
            if settle and now - info.st_mtime < settle and not path.startswith(f"{WORK_ROOT}/{CODE}/"):
                waiting += 1  # still being written, perhaps: the next save keeps it
                continue
            sha, parts = hash_file(full)
            known[path] = {**(entry or {}), "size": info.st_size, "mtime_ns": info.st_mtime_ns, "sha256": sha, "parts": parts}
            if entry and entry.get("saved_sha") == sha:
                continue
        changed.append({"path": path, "full": full, "info": info, "sha256": sha, "parts": parts})
    gone = []
    by_root: dict[str, list[str]] = {}
    for path, entry in known.items():
        if entry.get("saved_sha") and path not in found and (not only or under(path, only)):
            by_root.setdefault(path.split("/")[0], []).append(path)
    for root, paths in sorted(by_root.items()):
        total = sum(1 for p, e in known.items() if p.split("/")[0] == root and e.get("saved_sha"))
        # A root that isn't here, or lost most of its files at once, is a folder missing on this machine, not
        # files deleted: nothing of it is deleted in the work.
        if root in missing_roots or root not in (cfg.get("roots") or {}) or (total >= 4 and len(paths) > total / 2):
            skipped.append((f"{root}/", f"{len(paths)} of its {total} kept files aren't here: not deleted in the work"))
            continue
        gone.extend(sorted(paths))
    return changed, gone, skipped, waiting


def under(path: str, prefixes: list[str]) -> bool:
    return any(path == prefix or path.startswith(prefix.rstrip("/") + "/") for prefix in prefixes)


def git_tracked_clean(full: Path) -> bool:
    try:
        rel = os.path.relpath(full, ROOT)
        if rel.startswith(".."):
            return False
        tracked = subprocess.run(["git", "-C", str(ROOT), "ls-files", "--error-unmatch", "--", rel], capture_output=True, timeout=10)
        if tracked.returncode != 0:
            return False
        status = subprocess.run(["git", "-C", str(ROOT), "status", "--porcelain", "--", rel], capture_output=True, text=True, timeout=10)
        return status.returncode == 0 and not status.stdout.strip()
    except (OSError, subprocess.SubprocessError, ValueError):
        return False


class Lock:
    """One save at a time for a work on this machine (another waits, or, for an automatic one, gives way)."""

    def __init__(self, cfg: dict, wait: float):
        self.path = work_dir(cfg["workId"]) / "save.lock"
        self.wait = wait
        self.handle = None

    def __enter__(self):
        try:
            import fcntl
        except ImportError:  # no locks to be had here: a save at a time is up to whoever runs them
            return True
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.handle = open(self.path, "w")
        deadline = time.time() + self.wait
        while True:
            try:
                fcntl.flock(self.handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
                return True
            except OSError:
                if time.time() >= deadline:
                    return False
                time.sleep(0.25)

    def __exit__(self, *exc):
        if self.handle:
            self.handle.close()


# ---------------------------------------------------------------- keeping it ----------------------------------------------------------------


def upload(cfg: dict, files: list[dict], quiet: bool) -> int:
    """Every part of these files the work doesn't hold yet, sent straight to storage. Returns the bytes sent."""
    where = {}
    for file in files:
        offset = 0
        for part in file["parts"]:
            where.setdefault(part["sha256"], (file["full"], offset, part))
            offset += part["size"]
    shas = list(where)
    to_send = []
    for at in range(0, len(shas), PARTS_PER_OFFER):
        batch = []
        for sha in shas[at:at + PARTS_PER_OFFER]:
            info = where[sha][2]
            batch.append({"sha256": sha, "size": info["size"], **({"md5": info["md5"]} if re.fullmatch(r"[0-9a-f]{32}", info.get("md5") or "") else {})})
        offered = call("upload_work_files", {"workId": cfg["workId"], "parts": batch})
        to_send += [part for part in offered["parts"] if not part.get("stored")]
    if not to_send:
        return 0
    total = sum(where[p["sha256"]][2]["size"] for p in to_send)
    say(f"  sending {plural(len(to_send), 'part')} ({size_label(total)})", quiet=quiet)

    def send(part):
        full, offset, info = where[part["sha256"]]
        with open(full, "rb") as handle:
            handle.seek(offset)
            data = handle.read(info["size"])
        if hashlib.sha256(data).hexdigest() != part["sha256"]:
            raise StudioError("CHANGED", f"{full} changed while it was being sent: the next save keeps it")
        transfer(part["uploadUrl"], data, part.get("headers") or {"content-type": "application/octet-stream", "x-upsert": "false"})

    with ThreadPoolExecutor(WIDTH) as pool:
        list(pool.map(send, to_send))
    return total


def outbox(cfg: dict) -> Path:
    return work_dir(cfg["workId"]) / "outbox"


def keep_for_later(cfg: dict, args: dict):
    """A save's words that couldn't reach the studio, kept here; the next save that reaches it sends them first."""
    box = outbox(cfg)
    box.mkdir(parents=True, exist_ok=True)
    write_json(box / f"{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}.json", {k: v for k, v in args.items() if k != "files"})


def flush_outbox(cfg: dict, quiet: bool):
    """Saves that couldn't reach the studio before, sent now, oldest first (each by its own request id, so a save
    that did arrive after all isn't kept twice)."""
    box = outbox(cfg)
    if not box.is_dir():
        return
    for item in sorted(box.glob("*.json")):
        args = read_json(item, None)
        if not isinstance(args, dict):
            remove(item)
            continue
        try:
            try:
                call("save_work", args)
            except StudioError as failure:
                if failure.code != "CONFLICT":
                    raise
                # Its change to the record was made from a version that has moved on since: the rest still goes.
                args = {k: v for k, v in args.items() if k not in ("state", "baseVersion")}
                args["summary"] = ((args.get("summary") or "") + "\n\n(Its change to the record wasn't kept: the record "
                                   "had changed since it was made.)").strip()[:20000]
                args["clientRequestId"] = request_id("wp")
                call("save_work", args)
            remove(item)
            say(f"  sent a save kept here since {time.strftime('%H:%M:%S', time.gmtime(int(item.stem.split('-')[0]) / 1000))} UTC", quiet=quiet)
        except StudioError as failure:
            if failure.passing:
                return
            item.rename(item.with_suffix(".refused"))
            say(f"  a save kept here was refused: {failure.message}", quiet=quiet)


def mark_saved(cfg: dict, index: dict, batch: list[dict]):
    for file in batch:
        if file.get("deleted"):
            index["files"].pop(file["path"], None)
        elif file["path"] in index["files"]:
            index["files"][file["path"]]["saved_sha"] = file["sha256"]
    save_index(cfg, index)


def renew(cfg: dict):
    """The session is still at it: its own hold renewed, quietly (a renewal writes nothing in the journal). A
    heartbeat only renews: a work another session took, or that was let go, stays as it is."""
    try:
        call("claim_work", {"workId": cfg["workId"], "session": session(), "seconds": HOLD_SECONDS, "renew": True,
                            "brief": False})
    except StudioError:
        pass


def save(cfg: dict, *, kind="save", summary="", next_steps=None, decisions=None, questions=None, steps=None,
         state=None, base_version=None, status=None, with_files=True, only=None, quiet=False, wait=120.0,
         release=None, automatic=False) -> dict | None:
    """One save: this machine's changed files (their parts sent first) and the code as it stands, then its words.
    The words are never lost: when the studio can't be reached they are kept here and sent by the next save that
    reaches it, and when the files can't be kept the words go without them, saying so."""
    with Lock(cfg, wait) as locked:
        if not locked:
            say("Another save of this work is running here: this one gives way to it.", quiet=quiet)
            if release is not None:
                release_hold(cfg, release, quiet)
            return None
        flush_outbox(cfg, quiet)
        index = index_of(cfg)
        notes: list[str] = []
        if with_files:
            code, code_notes = snapshot_code(cfg, quiet)
            notes += code_notes
            changed, gone, skipped, waiting = changes(cfg, index, only, SETTLE if automatic else 0)
            save_index(cfg, index)
        else:
            code, changed, gone, skipped, waiting = code_version(cfg), [], [], [], 0
        me = session()
        narrative = {
            "workId": cfg["workId"],
            "session": me,
            "kind": kind,
            "holdSeconds": HOLD_SECONDS,
            **({"nextSteps": [scrub(s) for s in next_steps]} if next_steps is not None else {}),
            **({"decisions": decisions} if decisions else {}),
            **({"questions": [scrub(q) for q in questions]} if questions is not None else {}),
            **({"steps": steps} if steps else {}),
            **({"state": state} if state is not None else {}),
            **({"baseVersion": base_version} if base_version is not None else {}),
            **({"status": status} if status else {}),
            **({"code": code} if code else {}),
        }
        if skipped and not automatic:
            notes.append("not kept: " + "; ".join(f"{p} ({why})" for p, why in skipped[:10])
                         + (f"; and {len(skipped) - 10} more" if len(skipped) > 10 else ""))
        records: list[dict] = []
        if changed:
            say(f"Keeping {plural(len(changed), 'changed file')} ({size_label(sum(f['info'].st_size for f in changed))})", quiet=quiet)
            try:
                upload(cfg, changed, quiet)
                records = [
                    {"path": f["path"], "sha256": f["sha256"], "size": f["info"].st_size, "chunks": [p["sha256"] for p in f["parts"]],
                     "modifiedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(f["info"].st_mtime)),
                     **({"executable": True} if f["info"].st_mode & 0o111 else {})}
                    for f in changed
                ]
            except StudioError as failure:
                if failure.passing:
                    keep_for_later(cfg, late(words(narrative, summary, notes), failure))
                    raise
                notes.append(f"its changed files weren't kept this time ({failure.message}): the next save tries again")
        records += [{"path": path, "deleted": True} for path in gone]
        if not records and automatic and not summary:
            renew(cfg)
            say("Nothing changed since the last save." + (f" ({plural(waiting, 'file')} still being written.)" if waiting else ""), quiet=quiet)
            if release is not None:
                release_hold(cfg, release, quiet)
            return {"nothing": True}
        batches = [records[at:at + FILES_PER_SAVE] for at in range(0, len(records), FILES_PER_SAVE)] or [[]]
        # Files beyond what one save takes go first, on their own; the last carries the words.
        for number, batch in enumerate(batches[:-1], 1):
            try:
                call("save_work", {"workId": cfg["workId"], "session": me, "kind": "auto", "files": batch,
                                   "summary": f"Files kept (part {number} of {len(batches)} of one save)",
                                   "holdSeconds": HOLD_SECONDS, "clientRequestId": request_id("wp")})
                mark_saved(cfg, index, batch)
            except StudioError as failure:
                if failure.passing:
                    keep_for_later(cfg, late(words(narrative, summary, notes), failure))
                    raise
                notes.append(f"not all its files were kept ({failure.message}): the next save tries again")
                batches = [[]]
                break
        last = batches[-1]
        args = {**words(narrative, summary, notes), **({"files": last} if last else {}), "clientRequestId": request_id("wp")}
        try:
            result = call("save_work", args)
            mark_saved(cfg, index, last)
        except StudioError as failure:
            if failure.passing:
                keep_for_later(cfg, late(args, failure))
                raise
            if not last:
                raise
            # Refused for its files: the words go without them.
            notes.append(f"its changed files weren't kept this time ({failure.message}): the next save tries again")
            args = {**words(narrative, summary, notes), "clientRequestId": request_id("wp")}
            result = call("save_work", args)
        cfg["lastSave"] = {"at": stamp(), "entry": result.get("n")}
        if status in ("done", "abandoned"):
            cfg["attached"] = False
        if result.get("hold") == "held":
            cfg["session"] = me["id"]
        save_local(cfg)
        if result.get("hold") == "held_by_other":
            held = result.get("heldBy") or {}
            say(f"Saved, but {held.get('label') or held.get('holder')} holds this work now (last heard from it {held.get('heardAt')}).", quiet=quiet)
        say(f"Saved to the studio: entry {result.get('n')}"
            + (f", {plural(len([r for r in last if not r.get('deleted')]), 'file')} kept" if any(not r.get("deleted") for r in last) else "")
            + (f", {len(gone)} deleted" if gone else "")
            + (f"; {'; '.join(notes)}" if notes else "") + ".", quiet=quiet)
        if release is not None:
            release_hold(cfg, release, quiet)
        return result


def words(narrative: dict, summary: str, notes: list[str]) -> dict:
    """A save's words: its account, with what it says about its files."""
    text = scrub(summary.strip())
    if notes:
        text += ("\n\n" if text else "") + "Files: " + "; ".join(notes) + "."
    return {**narrative, **({"summary": text[:20000]} if text else {})}


def late(args: dict, failure: StudioError) -> dict:
    """Words kept on the machine say so when they arrive (the same request id: sent before after all, kept once)."""
    note = f"(Kept on the machine while the studio couldn't be reached: {failure.message}.)"
    text = (args.get("summary") or "").strip()
    return {**args, "summary": (text + ("\n\n" if text else "") + note)[:20000],
            "clientRequestId": args.get("clientRequestId") or request_id("wp")}


def release_hold(cfg: dict, summary: str, quiet: bool):
    try:
        result = call("release_work", {"workId": cfg["workId"], "session": session(), **({"summary": summary[:2000]} if summary else {})})
        if result.get("released"):
            say("Let go of it, for the next session.", quiet=quiet)
    except StudioError as failure:
        say(f"Couldn't let go of it: {failure.message}", quiet=quiet)


def pull(cfg: dict, *, force=False, only=None, quiet=False) -> dict:
    """The work's files as they stand, put back here (each checked against its SHA-256). A file changed here and
    in the studio is kept as it is here, with the studio's beside it; a file the studio deleted goes here too
    unless it changed here. The code kept with the work (work/code) always comes as the studio has it: this
    checkout's own is made again from git at its next save. Says how many came, and whether the code did."""
    index = index_of(cfg)
    work = call("get_work", {"workId": cfg["workId"], "entries": 1, "includeState": False, "brief": False})
    head = (code_version(cfg) or {}).get("commit")
    saved_on = (work.get("code") or {}).get("commit")
    after = None
    fetched = kept = set_aside = removed = 0
    code_came = False
    present: set[str] = set()
    while True:
        page = call("get_work_files", {"workId": cfg["workId"], **({"after": after} if after else {}), "limit": FILES_PER_PAGE})
        for file in page["files"]:
            present.add(file["path"])
            if only and not under(file["path"], only):
                continue
            root, _, rel = file["path"].partition("/")
            base = cfg["roots"].get(root)
            if not base or not rel:
                say(f"  {file['path']}: no root {root!r} here (work.py track {root}=<folder>)", quiet=quiet)
                continue
            target = resolve_root(base) / rel
            entry = index["files"].get(file["path"])
            if target.is_file():
                info = target.stat()
                if entry and entry.get("size") == info.st_size and entry.get("mtime_ns") == info.st_mtime_ns and entry.get("parts") is not None:
                    local_sha, local_parts = entry["sha256"], entry["parts"]
                else:
                    local_sha, local_parts = hash_file(target)
                if local_sha == file["sha256"]:
                    index["files"][file["path"]] = {"size": info.st_size, "mtime_ns": info.st_mtime_ns, "sha256": local_sha,
                                                    "parts": local_parts, "saved_sha": file["sha256"]}
                    kept += 1
                    continue
                unchanged_here = bool(entry) and entry.get("saved_sha") == local_sha
                committed_copy = bool(saved_on) and head == saved_on and git_tracked_clean(target)
                derived = file["path"].startswith(f"{WORK_ROOT}/{CODE}/")
                if not (force or unchanged_here or committed_copy or derived):
                    aside = target.with_name(f"{target.name}.studio-v{file['version']}")
                    fetch_file(file, aside)
                    set_aside += 1
                    say(f"  {file['path']}: changed here and in the studio: kept this one, the studio's is beside it as {aside.name}", quiet=quiet)
                    continue
            fetch_file(file, target)
            info = target.stat()
            index["files"][file["path"]] = {"size": info.st_size, "mtime_ns": info.st_mtime_ns, "sha256": file["sha256"],
                                            "parts": None, "saved_sha": file["sha256"]}
            fetched += 1
            code_came = code_came or file["path"].startswith(f"{WORK_ROOT}/{CODE}/")
        save_index(cfg, index)
        if not page.get("more"):
            break
        after = page.get("next")
    # What the studio no longer holds, gone here too where it is as the studio last had it.
    for path, entry in list(index["files"].items()):
        if path in present or not entry.get("saved_sha") or (only and not under(path, only)):
            continue
        root, _, rel = path.partition("/")
        base = cfg["roots"].get(root)
        target = resolve_root(base) / rel if base and rel else None
        if not target or not target.is_file():
            index["files"].pop(path, None)
            continue
        if hash_file(target)[0] == entry["saved_sha"] or path.startswith(f"{WORK_ROOT}/{CODE}/"):
            remove(target)
            index["files"].pop(path, None)
            removed += 1
            code_came = code_came or path.startswith(f"{WORK_ROOT}/{CODE}/")
        else:
            entry.pop("saved_sha", None)
    save_index(cfg, index)
    say(f"Files: {fetched} put back, {kept} already here" + (f", {set_aside} set aside" if set_aside else "")
        + (f", {removed} deleted as the studio deleted them" if removed else "") + ".", quiet=quiet)
    return {"fetched": fetched, "code": code_came}


def note_code(cfg: dict, quiet: bool = False):
    """After the work's code came from the studio: whether this checkout holds it, kept on the machine so its
    saves never put the work's code out of view (see snapshot_code)."""
    state = code_state(cfg)
    behind = None if code_is_here(cfg) else (state or {}).get("head")
    if cfg.get("codeBehind") != behind:
        cfg["codeBehind"] = behind
        save_local(cfg)
    if behind:
        say(f"This checkout doesn't hold the work's code yet ({state.get('branch')} at {behind[:12]}): `python3 "
            "scripts/studio-work/work.py restore-code` puts it here, and until then saves from here keep the work's "
            "code as it is.", quiet=quiet)


def fetch_file(file: dict, target: Path):
    target.parent.mkdir(parents=True, exist_ok=True)
    whole = hashlib.sha256()
    fd, tmp = tempfile.mkstemp(prefix=f".{target.name}.", dir=str(target.parent))
    try:
        with os.fdopen(fd, "wb") as out:
            for part in file.get("parts") or []:
                if not part.get("url"):
                    raise StudioError("MISSING", f"{file['path']}: a part has no link (is it stored?)")
                data = transfer(part["url"])
                if hashlib.sha256(data).hexdigest() != part["sha256"]:
                    raise StudioError("CORRUPT", f"{file['path']}: a part didn't match its SHA-256")
                whole.update(data)
                out.write(data)
        if whole.hexdigest() != file["sha256"]:
            raise StudioError("CORRUPT", f"{file['path']} didn't match its SHA-256")
        mode = 0o755 if file.get("executable") else 0o644
        os.chmod(tmp, mode & ~current_umask())
        os.replace(tmp, target)
        if file.get("modifiedAt"):
            try:
                when = calendar.timegm(time.strptime(file["modifiedAt"][:19], "%Y-%m-%dT%H:%M:%S"))
                os.utime(target, (when, when))
            except (ValueError, OverflowError, OSError):
                pass
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def current_umask() -> int:
    mask = os.umask(0o022)
    os.umask(mask)
    return mask


# ---------------------------------------------------------------- the commands ----------------------------------------------------------------


def find_work(selector: str | None) -> dict:
    """The work meant: its id (or the start of one), or words of its title; with none, the one this checkout is on."""
    mine = local_works()
    if not selector:
        on = [cfg for cfg in mine if cfg.get("attached")] or (mine if len(mine) == 1 else [])
        if len(on) == 1:
            return on[0]
        if not on:
            sys.exit("This checkout isn't on a work: start one (work.py start) or resume one (work.py list shows them).")
        sys.exit("This checkout has more than one work: name it (--work <id>): " + ", ".join(f"{w.get('title')} ({w['workId'][:8]})" for w in on))
    for cfg in mine:
        if cfg["workId"] == selector or (len(selector) >= 6 and cfg["workId"].startswith(selector)):
            return cfg
    if re.fullmatch(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", selector):
        return {"workId": selector.lower()}
    works = call("list_works", {"search": selector[:80], "includeFinished": True, "limit": 10})
    exact = [w for w in works if w["title"].lower() == selector.lower()]
    if len(exact) == 1 or len(works) == 1:
        chosen = (exact or works)[0]
        return {"workId": chosen["id"], "title": chosen["title"]}
    if not works:
        sys.exit(f"No work is called anything like {selector!r} (work.py list).")
    sys.exit("More than one work matches: " + "; ".join(f"{w['title']} ({w['id']})" for w in works))


def known_here(cfg: dict) -> dict:
    """A work this machine keeps, or sys.exit saying how to take it up."""
    if not (work_dir(cfg["workId"]) / "work.json").exists():
        sys.exit(f"This work isn't on this machine yet: python3 scripts/studio-work/work.py resume {cfg['workId']}")
    return read_json(work_dir(cfg["workId"]) / "work.json", cfg)


def parse_roots(items) -> dict:
    roots = {}
    for item in items or []:
        name, _, path = item.partition("=")
        if not re.fullmatch(r"[a-z0-9][a-z0-9_.-]{0,39}", name, re.I) or not path:
            sys.exit(f"--root takes name=folder (name: letters, digits, _ . -): {item!r}")
        if name == WORK_ROOT:
            sys.exit(f"{WORK_ROOT!r} is the work's own folder here (.xeno-work/<id>/files): name the root something else.")
        roots[name] = path
    return roots


def parse_decisions(items):
    out = []
    for item in items or []:
        what, _, why = item.partition("::")
        if what.strip():
            out.append({"what": scrub(what.strip())[:1000], **({"why": scrub(why.strip())[:2000]} if why.strip() else {})})
    return out


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:80] or "step"


def parse_steps(items):
    """key=status[:note] (todo, doing, done, blocked, skipped), key=remove, or key=title (a new step's, or a new
    title); a step given with no key is keyed by its title."""
    out = []
    for item in items or []:
        if "=" not in item:
            out.append({"key": slug(item), "title": item.strip()[:300]})
            continue
        key, _, rest = item.partition("=")
        head, sep, note = rest.partition(":")
        step: dict = {"key": key.strip()[:80] or slug(rest)}
        if head.strip() in STEP_STATUSES:
            step["status"] = head.strip()
            if sep and note.strip():
                step["note"] = note.strip()[:2000]
        elif head.strip() == "remove" and not sep:
            step["remove"] = True
        elif rest.strip():
            step["title"] = rest.strip()[:300]
        out.append(step)
    return out


def cmd_list(args):
    works = call("list_works", {"includeFinished": args.all, "limit": 50})
    if not works:
        print("No work in progress.")
    here = {cfg["workId"] for cfg in attached_works()}
    for w in works:
        hold = w["hold"]
        who = ("free" if hold["state"] == "free" else
               f"{hold.get('label') or hold.get('holder')}" + (" stopped" if hold["state"] == "lapsed" else " is on it"))
        steps = f" · {w['steps']['done']}/{w['steps']['total']} steps" if w["steps"]["total"] else ""
        print(f"{w['id']}  {w['title']} · {w['status']}{steps} · {who}" + (" · this checkout's" if w["id"] in here else ""))
        if w.get("nextSteps"):
            print(f"    next: {clip(w['nextSteps'][0], 140)}")


def cmd_start(args):
    me = session()
    steps = parse_steps(args.step)
    body = {
        "title": args.title,
        **({"goal": args.goal} if args.goal else {}),
        **({"projectId": args.project_id} if args.project_id else {}),
        **({"projectId": None} if args.no_project else {}),
        **({"projectName": args.project_name} if args.project_name else {}),
        **({"brandKitId": args.brand_kit_id} if args.brand_kit_id else {}),
        **({"parentWorkId": args.parent} if args.parent else {}),
        **({"steps": steps} if steps else {}),
        "roots": parse_roots(args.root),
        **({"nextSteps": args.next} if args.next else {}),
        "session": me,
        "clientRequestId": request_id("wp-start"),
    }
    started = call("start_work", body)
    work = call("get_work", {"workId": started["workId"], "entries": 5, "brief": False, "includeState": False})
    cfg = local_config(work, parse_roots(args.root))
    attach_only(cfg)
    project = work.get("project") or {}
    print(f"Started {work['title']} ({work['id']})" + (f", in the project {project.get('name')}" if project else ", in no project")
          + f", held by {me['label']}.")
    print(f"Its own folder, for what doesn't belong in git: {resolve_root(cfg['roots'][WORK_ROOT])}")
    print("Save as you go: python3 scripts/studio-work/work.py save -m \"what was done\" --next \"what comes next\"")
    if args.save_now:
        save(cfg, kind="save", summary="Its files and code, as they stood when it started.")


def cmd_resume(args):
    found = find_work(args.work)
    me = session()
    before = read_json(work_dir(found["workId"]) / "work.json", {}) or {}
    work = call("get_work", {"workId": found["workId"], "entries": 1, "brief": False, "includeState": False})
    hold = work.get("hold") or {}
    # This checkout's own last session (a /clear, a restart) is not another's: its hold is taken back quietly.
    own = hold.get("state") == "held" and hold.get("holder") == before.get("session")
    claimed = call("claim_work", {"workId": found["workId"], "session": me, "takeOver": bool(args.take_over or own),
                                  "seconds": HOLD_SECONDS, "brief": False})
    if not claimed.get("claimed"):
        print(f"{claimed.get('holderLabel') or claimed.get('holder')} is working on this (last heard from {claimed.get('heardAt')}). "
              "It's still theirs: take it over only once it has stopped (work.py resume --take-over).")
        if not args.read_only:
            sys.exit(1)
    cfg = local_config(work, parse_roots(args.root))
    if claimed.get("claimed"):
        attach_only(cfg)
    else:
        cfg["attached"] = False  # its files only: this checkout isn't on it while another session is
        save_local(cfg)
    if not args.no_pull:
        pull(cfg, force=args.force, only=[f"{WORK_ROOT}/{CODE}"], quiet=True)
        if not args.no_code and claimed.get("claimed"):
            restore_code(cfg, automatic=True)
        note_code(cfg, quiet=True)
        pull(cfg, force=args.force)
    print(f"Its own folder (the files under {WORK_ROOT}/): {resolve_root(cfg['roots'][WORK_ROOT])}")
    brief = call("get_work", {"workId": cfg["workId"], "entries": 20})["brief"]
    print()
    print(brief)


def cmd_status(args):
    cfg = find_work(args.work)
    work = call("get_work", {"workId": cfg["workId"], "entries": args.entries})
    print(work["brief"])
    if (work_dir(cfg["workId"]) / "work.json").exists():
        cfg = known_here(cfg)
        index = index_of(cfg)
        changed, gone, skipped, _ = changes(cfg, index)
        save_index(cfg, index)
        code = code_version(cfg)
        print(f"\nOn this machine: {plural(len(changed), 'file')} changed and {len(gone)} gone since the last save"
              + (f", {len(skipped)} left out" if skipped else "")
              + (f"; the code has {plural(code.get('unpushed') or 0, 'commit')} no remote holds" if code and code.get("unpushed") else "")
              + ("; it has changes not committed" if code and code.get("dirty") else "") + "."
              + (f" Last saved {cfg['lastSave']['at']}." if cfg.get("lastSave") else ""))
        if cfg.get("codeBehind"):
            print("This checkout doesn't hold the work's code yet: python3 scripts/studio-work/work.py restore-code")


def read_summary(args) -> str:
    text = args.message or ""
    if getattr(args, "summary_file", None):
        try:
            text = Path(args.summary_file).read_text()
        except OSError:
            pass
    return text.strip()


def cmd_save(args):
    cfg = known_here(find_work(args.work))
    state = None
    try:
        if args.state_file:
            state = json.loads(Path(args.state_file).read_text())
        elif args.state:
            state = json.loads(args.state)
    except (OSError, ValueError) as failure:
        sys.exit(f"--state is a JSON object (a merge patch): {failure}")
    if state is not None and not isinstance(state, dict):
        sys.exit("--state is a JSON object (a merge patch)")
    automatic = args.kind == "auto"
    try:
        save(cfg, kind=args.kind, summary=read_summary(args), next_steps=args.next, decisions=parse_decisions(args.decision),
             questions=args.question, steps=parse_steps(args.step), state=state, base_version=args.base_version,
             status=args.status, with_files=not args.no_files, only=args.only, quiet=args.quiet,
             wait=5.0 if automatic else 120.0, release=args.release_words if args.release else None, automatic=automatic)
    except StudioError as failure:
        if args.quiet:
            print(f"{stamp()} save not made: {failure}", file=sys.stderr)
            sys.exit(0)
        sys.exit(f"Not saved: {failure.message} ({failure.code})"
                 + ("\nIts words are kept on this machine, and the next save that reaches the studio sends them." if failure.passing else ""))
    finally:
        if args.summary_file and args.delete_summary_file:
            remove(Path(args.summary_file))


def cmd_pull(args):
    cfg = find_work(args.work)
    if not (work_dir(cfg["workId"]) / "work.json").exists():
        cfg = local_config(call("get_work", {"workId": cfg["workId"], "entries": 1, "brief": False}))
        cfg["attached"] = False
        save_local(cfg)
    cfg = known_here(cfg)
    if pull(cfg, force=args.force, only=args.only)["code"]:
        note_code(cfg)


def cmd_restore_code(args):
    cfg = known_here(find_work(args.work))
    if args.mine:
        cfg["codeBehind"] = None
        save_local(cfg)
        print("This checkout's code is the work's from its next save; the code kept before stays in the work's history.")
        return
    pull(cfg, only=[f"{WORK_ROOT}/{CODE}"], quiet=True)
    if not restore_code(cfg, here=args.here, force=args.force):
        note_code(cfg, quiet=True)
        sys.exit(1)
    note_code(cfg, quiet=True)


def cmd_note(args):
    cfg = known_here(find_work(args.work))
    save(cfg, kind="note", summary=args.message, with_files=False)


def cmd_link(args):
    cfg = find_work(args.work)
    result = call("attach_to_work", {"workId": cfg["workId"], "links": [{"kind": args.kind, "id": args.id, **({"role": args.role} if args.role else {})}],
                                     "adopt": args.adopt, "session": session(), "clientRequestId": request_id("wp-link")})
    print(("Attached" if (result.get("links") or [{}])[0].get("added") else "Already attached")
          + (f"; {result.get('adopted')} put in the work's project" if result.get("adopted") else "") + ".")


def cmd_track(args):
    cfg = known_here(find_work(args.work))
    roots = parse_roots(args.roots)
    cfg["roots"].update(roots)
    save_local(cfg)
    call("save_work", {"workId": cfg["workId"], "session": session(), "kind": "note", "roots": roots,
                       "summary": "Its files are kept from " + ", ".join(f"{k} ({v})" for k, v in roots.items()) + " too.",
                       "clientRequestId": request_id("wp-track")})
    print("Tracked: " + ", ".join(f"{k} → {resolve_root(v)}" for k, v in roots.items()) + ". The next save keeps their files.")


def cmd_release(args):
    cfg = known_here(find_work(args.work))
    if not args.no_save:
        try:
            save(cfg, kind="save" if args.message else "auto", summary=args.message or "", automatic=not args.message, wait=60.0)
        except StudioError as failure:
            print(f"Not saved first: {failure.message}")
    cfg["attached"] = False
    save_local(cfg)
    result = call("release_work", {"workId": cfg["workId"], "session": session(), "summary": "Let go: " + (args.message or "stopping here.")})
    print("Let go: the next session, here or anywhere, can take it up." if result.get("released")
          else f"Not held by this session ({result.get('holderLabel') or 'nobody'} holds it); this checkout has stopped working on it.")


# ---------------------------------------------------------------- long jobs, and review gates ----------------------------------------------------------------

# How often a long job's hold is renewed: well inside the hold, so a missed renewal or two never lets it lapse.
RENEW_EVERY = int(os.environ.get("XENO_WORK_RENEW_SECONDS", str(HOLD_SECONDS // 3)))
# The largest video the studio's library takes in one upload (VIDEO_IMPORT_LIMITS, src/lib/studio-api/video-import.server.ts).
VIDEO_IMPORT_BYTES = 50 * 1024 * 1024
VIDEO_TYPES = {".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm"}


def took(seconds: float) -> str:
    seconds = round(seconds)
    hours, rest = divmod(seconds, 3600)
    minutes, seconds = divmod(rest, 60)
    return f"{hours} h {minutes} min" if hours else f"{minutes} min {seconds} s" if minutes else f"{seconds} s"


def cmd_run(args):
    """A long job held for the work. A session waiting on a job runs no tool and so no hook, and Reel 2's render
    outlived its 30-minute hold several times: here the hold is renewed every ten minutes while the job runs, the
    work's files are kept every few minutes (what the job writes into the work's folder is kept as it goes), and
    when it ends the journal says what ran and how it ended. Its exit code is this command's."""
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command:
        sys.exit("Say what to run: work.py run [-m \"what it is\"] -- <command> [its arguments]")
    cfg = known_here(find_work(args.work))
    renew(cfg)
    started = time.time()
    try:
        child = subprocess.Popen(command)
    except OSError as failure:
        sys.exit(f"Couldn't run {command[0]}: {failure}")
    renewed = kept = started
    keeping = None
    try:
        while True:
            try:
                child.wait(timeout=5)
                break
            except subprocess.TimeoutExpired:
                pass
            now = time.time()
            if now - renewed >= RENEW_EVERY:
                renew(cfg)
                renewed = now
            if args.keep_every and now - kept >= args.keep_every and (keeping is None or not keeping.is_alive()):
                # In a thread of its own, so the job is never waited on; a save under way is never started twice.
                keeping = threading.Thread(
                    target=lambda: save(cfg, kind="auto", automatic=True, quiet=True, wait=5.0), daemon=True)
                keeping.start()
                kept = now
    except KeyboardInterrupt:
        child.terminate()
        try:
            child.wait(timeout=30)
        except subprocess.TimeoutExpired:
            child.kill()
    if keeping is not None:
        keeping.join(timeout=300)
    code = child.returncode
    what = args.message or f"`{shlex.join(command)[:300]}`"
    ended = "finished" if code == 0 else f"stopped by signal {-code}" if code < 0 else f"failed (exit code {code})"
    if not args.no_save:
        try:
            save(cfg, kind="save", summary=f"Ran {what}: {ended} after {took(time.time() - started)}.", wait=120.0)
        except StudioError as failure:
            print(f"Not saved: {failure.message} ({failure.code})", file=sys.stderr)
    sys.exit(code if code >= 0 else 128 - code)


def review_copy(path: Path, out: Path, max_bytes: int) -> Path:
    """A copy of a video that fits the library's one upload: two passes of x264 at the rate that fills `max_bytes`
    with room (Reel 2's Film gate: 3 Mbit/s of picture and 128 kbit/s of sound for a 118 s film), its sound in AAC,
    its colour tags kept as BT.709."""
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        sys.exit(f"{path.name} is over the studio's {max_bytes // (1024 * 1024)} MB, and a review copy needs ffmpeg here")
    probe = json.loads(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", str(path)],
        capture_output=True, text=True, check=True).stdout)
    seconds = float(probe["format"]["duration"])
    sound = any(stream.get("codec_type") == "audio" for stream in probe.get("streams", []))
    audio_kbps = 128 if sound else 0
    # 94% of the limit for the streams; the rest for the container and the rate control's overshoot.
    video_kbps = int((max_bytes * 0.94 * 8 / 1000) / seconds) - audio_kbps
    if video_kbps < 300:
        sys.exit(f"{path.name} runs {seconds:.0f} s: no review copy of it fits {max_bytes // (1024 * 1024)} MB at a watchable rate")
    out.parent.mkdir(parents=True, exist_ok=True)
    log = out.with_suffix(".passlog")
    common = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(path), "-c:v", "libx264", "-preset", "slow",
              "-b:v", f"{video_kbps}k", "-passlogfile", str(log)]
    subprocess.run([*common, "-pass", "1", "-an", "-f", "mp4", os.devnull], check=True)
    subprocess.run([*common, "-pass", "2", "-profile:v", "high", "-pix_fmt", "yuv420p", "-color_range", "tv",
                    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
                    *(["-c:a", "aac", "-b:a", f"{audio_kbps}k"] if sound else ["-an"]),
                    "-movflags", "+faststart", str(out)], check=True)
    for leftover in out.parent.glob(f"{log.name}*"):
        remove(leftover)
    if out.stat().st_size > max_bytes:
        sys.exit(f"The review copy of {path.name} came out at {out.stat().st_size:,} bytes, over {max_bytes:,}")
    return out


def gate_file(cfg: dict | None, project: str, title: str, path: Path, max_bytes: int) -> str:
    """A file into the studio's library for a review gate, once: a video by its signed upload (a review copy where it
    is over the library's one upload), a picture by import_image. The request is named by what it sends, so asking
    again returns the first import. Returns the library's id."""
    if not path.is_file():
        sys.exit(f"{path} is not a file")
    kind = VIDEO_TYPES.get(path.suffix.lower())
    if kind and path.stat().st_size > max_bytes:
        copies = (work_dir(cfg["workId"]) if cfg else Path(tempfile.gettempdir()) / "xeno-review-copies") / "review-copies"
        digest = hashlib.sha256(path.read_bytes()).hexdigest()[:16]
        copy = copies / f"{path.stem}-{digest}-review.mp4"
        if not copy.exists():
            print(f"{path.name}: {path.stat().st_size:,} bytes is over the studio's {max_bytes // (1024 * 1024)} MB; making a review copy")
            review_copy(path, copy, max_bytes)
        print(f"{path.name}: sending the review copy, {copy.stat().st_size:,} bytes")
        path, kind = copy, "video/mp4"
    data = path.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    work = {"workId": cfg["workId"]} if cfg else {}
    if kind:
        ask = {"title": title, "mimeType": kind, "byteSize": len(data), "sha256": digest, "projectId": project, **work,
               "clientRequestId": "gate-video-" + hashlib.sha256(f"{title}\0{digest}".encode()).hexdigest()[:40]}
        out = call("import_video", ask, timeout=120)
        if out.get("status") == "upload":
            print(f"{title}: sending {len(data):,} bytes to storage")
            transfer(out["upload"]["url"], data, out["upload"].get("headers"), timeout=1800)
            out = call("import_video", ask, timeout=120)
        if out.get("status") != "imported":
            sys.exit(f"{title}: not imported ({json.dumps(out)[:300]})")
    else:
        out = call("import_image", {"title": title, "data": base64.b64encode(data).decode(), "projectId": project, **work,
                                    "clientRequestId": "gate-image-" + hashlib.sha256(f"{title}\0{digest}".encode()).hexdigest()[:40]},
                   timeout=300)
    print(f"{title}: {out['assetId']}")
    return out["assetId"]


def cmd_gate(args):
    """A project's review gates, from here: what each holds, a version of files (pictures and videos, a review copy
    made of a video over the library's one upload), and a decision on the latest version, recorded as the token's
    owner's with what it says."""
    cfg = None
    try:
        cfg = known_here(find_work(args.work)) if (args.work or attached_works()) else None
    except SystemExit:
        cfg = None
    project = args.project
    if not project and cfg:
        # The fewest entries get_work gives is one (none is refused): only the work's project is wanted here.
        work = call("get_work", {"workId": cfg["workId"], "entries": 1, "includeState": False, "brief": False})
        project = (work.get("project") or {}).get("id")
    if not project:
        sys.exit("Name the project (--project), or run it on a work that is in one")
    gates = call("list_review_gates", {"projectId": project})["gates"]
    if args.gate_command == "list":
        for gate in gates:
            print(f"{gate['name']} · {gate.get('statusLabel') or gate['status']}"
                  + (f" · last approved v{gate['lastApprovedVersion']}" if gate.get("lastApprovedVersion") else ""))
            for version in gate.get("versions", [])[: args.versions]:
                decision = (version.get("decision") or {}).get("decision")
                print(f"    v{version['number']} {version['addedAt'][:16]} · {version.get('label') or ''}"
                      + (f" · {decision}" if decision else " · in review"))
        return
    gate = next((g for g in gates if g["name"].lower() == args.gate.lower()), None)
    if gate is None and args.gate_command == "post" and args.add:
        call("add_review_gate", {"projectId": project, "name": args.gate})
        gate = next(g for g in call("list_review_gates", {"projectId": project})["gates"] if g["name"] == args.gate)
    if gate is None:
        sys.exit(f"The project has no gate called {args.gate!r}: {', '.join(g['name'] for g in gates) or 'none yet'}"
                 + (" (--add makes it)" if args.gate_command == "post" else ""))
    note = Path(args.note_file).read_text().strip() if args.note_file else (args.note or "").strip()
    if args.gate_command == "decide":
        if not gate.get("versions"):
            sys.exit(f"{gate['name']} has no version to decide on")
        latest = gate["versions"][0]
        out = call("decide_review", {"versionId": latest["id"], "decision": args.decision, "note": note,
                                     "clientRequestId": "gate-decide-" + hashlib.sha256(
                                         f"{latest['id']}\0{args.decision}\0{note}".encode()).hexdigest()[:40]})
        print(f"{gate['name']} v{latest['number']}: {args.decision}" + (" (already recorded)" if out.get("duplicate") else ""))
        return
    if not args.files:
        sys.exit("Name the files: title=path (more than one, in the order the reviewer sees them)")
    ids = []
    for pair in args.files:
        title, sep, file = pair.partition("=")
        if not sep:
            title, file = Path(pair).stem, pair
        ids.append(gate_file(cfg, project, title, Path(file).expanduser(), args.max_bytes))
    version = call("add_review_version", {
        "gateId": gate["id"], "assetIds": ids, "note": note, **({"workId": cfg["workId"]} if cfg else {}),
        "clientRequestId": "gate-version-" + hashlib.sha256("\0".join([gate["id"], *ids, note]).encode()).hexdigest()[:40]})
    print(f"{gate['name']}: version {version['number']}" + (" (already posted)" if version.get("duplicate") else ""))


# ---------------------------------------------------------------- Claude Code's hooks ----------------------------------------------------------------


def spawn(cfg: dict, *args: str):
    """A save in a process of its own, outliving the hook and the turn; what it says goes to the work's log."""
    log_path = work_dir(cfg["workId"]) / "log.txt"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    if log_path.exists() and log_path.stat().st_size > 2 * 1024 * 1024:
        os.replace(log_path, log_path.with_suffix(".old.txt"))
    detach = {"start_new_session": True} if os.name == "posix" else {"creationflags": 0x00000008 | 0x00000200}
    with open(log_path, "ab") as log:
        log.write(f"{stamp()} {' '.join(args)}\n".encode())
        log.flush()
        subprocess.Popen([sys.executable, str(Path(__file__).resolve()), *args, "--work", cfg["workId"], "--quiet"],
                         stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, cwd=str(ROOT),
                         close_fds=True, **detach)


def due(cfg: dict) -> bool:
    mark = work_dir(cfg["workId"]) / "last-auto"
    try:
        if time.time() - mark.stat().st_mtime < AUTO_EVERY:
            return False
    except OSError:
        pass
    mark.parent.mkdir(parents=True, exist_ok=True)
    mark.touch()
    return True


def turn_account(transcript: str | None, tail_bytes: int = 4 * 1024 * 1024) -> dict | None:
    """The turn as the session's own transcript has it, read from its end: what the person asked, what the agent
    said last, and the tools it used. For a turn cut short, the only account of what it was in the middle of."""
    try:
        path = Path(transcript or "")
        if not transcript or not path.is_file():
            return None
        with open(path, "rb") as handle:
            size = handle.seek(0, os.SEEK_END)
            handle.seek(max(0, size - tail_bytes))
            lines = handle.read().decode("utf-8", errors="replace").splitlines()
        if size > tail_bytes:
            lines = lines[1:]  # the first line read is cut
        events = []
        for line in lines:
            try:
                event = json.loads(line)
            except ValueError:
                continue
            if isinstance(event, dict) and event.get("type") in ("user", "assistant") and not event.get("isSidechain"):
                events.append(event)

        def blocks(event):
            content = (event.get("message") or {}).get("content")
            if isinstance(content, str):
                return [{"type": "text", "text": content}]
            return [block for block in content if isinstance(block, dict)] if isinstance(content, list) else []

        # The turn began at the person's last message: not a tool's result, nor a message the session wrote for
        # itself; a summary the session compacted its context into begins one too, but says nothing they asked.
        start, compacted = None, False
        for index in range(len(events) - 1, -1, -1):
            event = events[index]
            if event["type"] != "user" or any(b.get("type") == "tool_result" for b in blocks(event)):
                continue
            if event.get("isCompactSummary"):
                start, compacted = index, True
                break
            if event.get("isMeta") or event.get("isVisibleInTranscriptOnly"):
                continue
            if any(b.get("type") == "text" and str(b.get("text", "")).strip() for b in blocks(event)):
                start = index
                break
        turn = events[start:] if start is not None else events
        asked = None
        if start is not None and not compacted:
            asked = " ".join(str(b.get("text", "")) for b in blocks(events[start]) if b.get("type") == "text").strip()
        said, tools = [], {}
        for event in turn:
            if event["type"] != "assistant":
                continue
            for block in blocks(event):
                if block.get("type") == "text" and str(block.get("text", "")).strip():
                    said.append(str(block["text"]).strip())
                elif block.get("type") == "tool_use" and block.get("name"):
                    tools[str(block["name"])] = tools.get(str(block["name"]), 0) + 1
        return {"asked": asked, "said": said, "tools": tools, "whole": start is not None}
    except (OSError, ValueError, TypeError, AttributeError):
        return None


def tools_line(tools: dict) -> str:
    return ", ".join(f"{name} ×{count}" if count > 1 else name for name, count in sorted(tools.items(), key=lambda item: -item[1]))


def turn_file(cfg: dict, text: str) -> Path:
    path = work_dir(cfg["workId"]) / "turns" / f"{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}.txt"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    return path


def hook_session_start(data: dict):
    PATIENCE.update(timeout=8.0, tries=1)  # the session waits for this: never long
    me = session()
    lines = []
    on = attached_works()
    if on:
        budget = max(2000, 9000 // len(on))
        lines.append("Xeno Studio: this checkout is on work in progress, kept in the studio as it goes "
                     "(scripts/studio-work/work.py; docs/work.md). What follows is its record, written by earlier sessions "
                     "and people: carry it on from there rather than starting again.")
        for cfg in on:
            try:
                work = call("get_work", {"workId": cfg["workId"], "entries": 15})
                if work.get("status") in ("done", "abandoned"):
                    cfg["attached"] = False
                    save_local(cfg)
                    continue
                hold = work.get("hold") or {}
                own = hold.get("holder") in (cfg.get("session"), me["id"])
                claimed = call("claim_work", {"workId": cfg["workId"], "session": me, "takeOver": own,
                                              "seconds": HOLD_SECONDS, "brief": False})
                if claimed.get("claimed"):
                    cfg["session"] = me["id"]
                    save_local(cfg)
                    lines.append("\n" + clip(work["brief"], budget))
                    if cfg.get("codeBehind"):
                        lines.append("\nThis checkout doesn't hold the work's code yet: python3 scripts/studio-work/work.py "
                                     "restore-code (or restore-code --here, onto this branch).")
                else:
                    lines.append(f"\n{work['title']} ({cfg['workId']}): {claimed.get('holderLabel') or claimed.get('holder')} "
                                 f"is working on it now, so this session hasn't taken it up. Once that one has stopped: "
                                 f"python3 scripts/studio-work/work.py resume {cfg['workId']} --take-over\n" + clip(work["brief"], budget // 2))
            except StudioError as failure:
                lines.append(f"\n{cfg.get('title')} ({cfg['workId']}): the studio couldn't be reached ({failure.message}). "
                             f"It was last saved from here {(cfg.get('lastSave') or {}).get('at', 'never')}; carry it on in "
                             "this checkout: saves made meanwhile keep their words here and send them when the studio is back.")
        lines.append("\nThe hooks save its files every few minutes and each turn's last words as the turn ends. Say what was "
                     "done, what comes next and what was decided after every meaningful step: python3 "
                     "scripts/studio-work/work.py save -m \"...\" --next \"...\" [--decision \"what :: why\"] [--step key=done]")
    else:
        try:
            works = call("list_works", {"limit": 8})
        except StudioError:
            return
        if not works:
            return
        lines.append("Xeno Studio has work in progress, kept as it goes; what you're asked to do may be part of one. To carry "
                     "one on: python3 scripts/studio-work/work.py resume <id> (takes it up, puts its files and code back, and "
                     "prints where it stands). A new job of more than a few steps: python3 scripts/studio-work/work.py start "
                     "\"<title>\" --goal \"...\", so that it is kept as it goes.")
        for w in works:
            hold = w["hold"]
            who = ("free" if hold["state"] == "free" else
                   f"{hold.get('label')} is on it" if hold["state"] == "held" else f"{hold.get('label')} stopped")
            line = f"- {w['title']} ({w['id']}) · {w['status']} · {who}"
            if w.get("nextSteps"):
                line += f" · next: {clip(w['nextSteps'][0], 120)}"
            lines.append(line)
    print(clip("\n".join(lines), 9800))


def hook_session_end():
    """The last save, made before the session goes (it may not come back to save it), then its hold let go (only
    a holder can let a work go: another session's hold is left as it is). Each call is tried once: the session is
    going, and words that can't be sent are kept here for the next save."""
    PATIENCE.update(timeout=12.0, tries=1)
    for cfg in attached_works():
        try:
            save(cfg, kind="auto", automatic=True, quiet=True, wait=20.0, release="The session ended.")
        except StudioError:
            release_hold(cfg, "The session ended.", True)


def hook(event: str):
    try:
        raw = sys.stdin.read() if not sys.stdin.isatty() else ""
        data = json.loads(raw) if raw.strip() else {}
    except (ValueError, OSError):
        data = {}
    if not HOOKS_ON:
        return
    if not os.environ.get("CLAUDE_CODE_SESSION_ID") and isinstance(data.get("session_id"), str):
        os.environ["CLAUDE_CODE_SESSION_ID"] = data["session_id"]  # the saves this hook starts are this session's
    try:
        if event == "session-start":
            hook_session_start(data)
            return
        if event == "session-end":
            hook_session_end()
            return
        on = attached_works()
        if event == "post-tool":
            for cfg in on:
                if due(cfg):
                    spawn(cfg, "save", "--kind", "auto")
        elif event == "stop":
            text = scrub(str(data.get("last_assistant_message") or "")).strip()
            account = turn_account(data.get("transcript_path")) if on else None
            if text and account and account["tools"]:
                text = f"{clip(text, 7000)}\n\nTools used: {tools_line(account['tools'])}."
            for cfg in on:
                if text:
                    spawn(cfg, "save", "--kind", "turn", "--summary-file", str(turn_file(cfg, clip(text, 8000))), "--delete-summary-file")
                else:
                    spawn(cfg, "save", "--kind", "auto")
        elif event == "stop-failure":
            error = str(data.get("error") or "unknown")
            details = str(data.get("error_details") or data.get("last_assistant_message") or "").strip()
            text = f"The turn was cut short: {error}" + (f" ({clip(scrub(details), 400)})" if details else "") + "."
            account = turn_account(data.get("transcript_path")) if on else None
            if account:
                if account["asked"]:
                    text += f"\n\nIt had been asked: {clip(scrub(account['asked']), 800)}"
                if account["said"]:
                    text += f"\n\nWhat it said last: {clip(scrub(account['said'][-1]), 2500)}"
                if account["tools"]:
                    text += f"\n\nTools it used in the turn{'' if account['whole'] else ' (its end)'}: {tools_line(account['tools'])}."
            text += ("\n\nWhat it had done is in the files and code kept with this save and the entries before it; "
                     "the work is let go so the next session can take it up.")
            for cfg in on:
                spawn(cfg, "save", "--kind", "interrupted", "--summary-file", str(turn_file(cfg, text)), "--delete-summary-file",
                      "--release", "--release-words", f"Let go after the turn was cut short ({error}).")
        elif event == "pre-compact":
            for cfg in on:
                spawn(cfg, "save", "--kind", "auto")
    except Exception as failure:  # A hook never stops a session.
        print(f"work.py hook {event}: {failure}", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0], formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__.split("\n\n", 1)[1])
    sub = parser.add_subparsers(dest="command", required=True,
                                metavar="{list,start,resume,status,save,push,pull,restore-code,note,link,track,release,run,gate}")

    p = sub.add_parser("list", help="work in progress")
    p.add_argument("--all", action="store_true", help="finished work too")
    p.set_defaults(run=cmd_list)

    p = sub.add_parser("start", help="start a work, held by this session, and put this checkout on it")
    p.add_argument("title")
    p.add_argument("--goal", help="what it is for, and what finished looks like")
    p.add_argument("--project-id")
    p.add_argument("--project-name")
    p.add_argument("--no-project", action="store_true")
    p.add_argument("--brand-kit-id")
    p.add_argument("--parent", help="the larger work it is part of")
    p.add_argument("--root", action="append", help="name=folder its files sit under (more than once)")
    p.add_argument("--step", action="append", help="key=title, a step of its plan, in order (more than once)")
    p.add_argument("--next", action="append", help="what comes next (more than once: in order)")
    p.add_argument("--save-now", action="store_true", help="keep its roots' files and its code at once")
    p.set_defaults(run=cmd_start)

    p = sub.add_parser("resume", help="take a work up here: its files and code back, where it stands printed")
    p.add_argument("work", nargs="?")
    p.add_argument("--take-over", action="store_true", help="take it from a session that holds it (only once it has stopped)")
    p.add_argument("--read-only", action="store_true", help="put its files back even while another session holds it")
    p.add_argument("--no-pull", action="store_true")
    p.add_argument("--no-code", action="store_true", help="leave the code in this checkout as it is")
    p.add_argument("--force", action="store_true", help="the studio's files over this machine's")
    p.add_argument("--root", action="append", help="name=folder, where a root sits on this machine")
    p.set_defaults(run=cmd_resume)

    p = sub.add_parser("status", help="where a work stands, and what changed here since the last save")
    p.add_argument("--work")
    p.add_argument("--entries", type=int, default=20)
    p.set_defaults(run=cmd_status)

    for name, kind in (("save", "save"), ("push", "auto")):
        p = sub.add_parser(name, help="keep progress: what was done, and the files and code that changed" if name == "save" else "keep the files and code that changed")
        p.add_argument("--work")
        p.add_argument("-m", "--message", help="what was done since the last save")
        p.add_argument("--summary-file")
        p.add_argument("--delete-summary-file", action="store_true", help=argparse.SUPPRESS)
        p.add_argument("--next", action="append", help="what comes next (more than once: in order; replaces the work's)")
        p.add_argument("--decision", action="append", help='"what was decided :: why" (more than once)')
        p.add_argument("--question", action="append", help="what is waiting on a person (more than once; replaces the work's)")
        p.add_argument("--step", action="append", help="key=status[:note] (todo, doing, done, blocked, skipped), key=remove, or key=title")
        p.add_argument("--state", help="a change to the work's record: a JSON merge patch")
        p.add_argument("--state-file")
        p.add_argument("--base-version", type=int, help="the record's version the change was made from")
        p.add_argument("--status", choices=["active", "blocked", "paused", "done", "abandoned"])
        p.add_argument("--kind", default=kind, choices=["save", "auto", "turn", "interrupted", "note"])
        p.add_argument("--no-files", action="store_true", help="the words alone")
        p.add_argument("--only", action="append", help="only this path in the work, or under it (more than once)")
        p.add_argument("--release", action="store_true", help=argparse.SUPPRESS)
        p.add_argument("--release-words", default="", help=argparse.SUPPRESS)
        p.add_argument("--quiet", action="store_true")
        p.set_defaults(run=cmd_save)

    p = sub.add_parser("pull", help="the work's files back here")
    p.add_argument("--work")
    p.add_argument("--force", action="store_true", help="the studio's over this machine's")
    p.add_argument("--only", action="append")
    p.set_defaults(run=cmd_pull)

    p = sub.add_parser("restore-code", help="the code as the work last left it: its commit, and its changes not committed")
    p.add_argument("--work")
    p.add_argument("--here", action="store_true", help="bring its commits and changes onto this branch instead of checking out its own")
    p.add_argument("--force", action="store_true", help="even with changes of this checkout's own")
    p.add_argument("--mine", action="store_true", help="keep this checkout's code as the work's instead (the kept code stays in its history)")
    p.set_defaults(run=cmd_restore_code)

    p = sub.add_parser("note", help="a note in the work's journal")
    p.add_argument("--work")
    p.add_argument("-m", "--message", required=True)
    p.set_defaults(run=cmd_note)

    p = sub.add_parser("link", help="attach something in the studio to the work")
    p.add_argument("kind", choices=["generation", "asset", "edit", "render", "long_video", "review_gate", "storyboard", "brief",
                                    "character", "brand_kit", "composition", "thread", "section_plan", "work"])
    p.add_argument("id")
    p.add_argument("--role", help="what it is to the work (\"the delivered master\")")
    p.add_argument("--adopt", action="store_true", help="put a file or generation that is in no project in the work's")
    p.add_argument("--work")
    p.set_defaults(run=cmd_link)

    p = sub.add_parser("track", help="keep the files of more folders: name=folder")
    p.add_argument("roots", nargs="+")
    p.add_argument("--work")
    p.set_defaults(run=cmd_track)

    p = sub.add_parser("release", help="save, then let the work go, and stop working on it here")
    p.add_argument("--work")
    p.add_argument("-m", "--message", help="what to say (\"Stopping here: the animatic is next\")")
    p.add_argument("--no-save", action="store_true")
    p.set_defaults(run=cmd_release)

    p = sub.add_parser("run", help="run a long job held for the work: its hold renewed and its files kept while it runs, then saved")
    p.add_argument("--work")
    p.add_argument("-m", "--message", help="what the job is (\"Drawing 04.1 to 05.2\")")
    p.add_argument("--keep-every", type=int, default=AUTO_EVERY, help="seconds between keeping the work's files while it runs (0: at the end only)")
    p.add_argument("--no-save", action="store_true", help="no save when it ends")
    p.add_argument("command", nargs=argparse.REMAINDER, help="-- then the command and its arguments")
    p.set_defaults(run=cmd_run)

    p = sub.add_parser("gate", help="a project's review gates: list them, post a version, or decide on the latest")
    gate_sub = p.add_subparsers(dest="gate_command", required=True)
    for name in ("list", "post", "decide"):
        g = gate_sub.add_parser(name)
        g.add_argument("--work")
        g.add_argument("--project", help="the project's id (else the work's)")
        if name == "list":
            g.add_argument("--versions", type=int, default=3)
        else:
            g.add_argument("gate", help="the gate's name (\"Film\")")
            g.add_argument("--note", help="what it says")
            g.add_argument("--note-file")
        if name == "post":
            g.add_argument("files", nargs="*", help="title=path, pictures and videos, in the order the reviewer sees them")
            g.add_argument("--add", action="store_true", help="make the gate if the project has none of that name")
            g.add_argument("--max-bytes", type=int, default=VIDEO_IMPORT_BYTES, help=argparse.SUPPRESS)
        if name == "decide":
            g.add_argument("decision", choices=["approved", "changes_requested"])
    p.set_defaults(run=cmd_gate)

    p = sub.add_parser("hook")  # Claude Code's hooks (.claude/settings.json), not for people
    p.add_argument("event", choices=["session-start", "post-tool", "stop", "stop-failure", "pre-compact", "session-end"])
    p.set_defaults(run=lambda args: hook(args.event))

    args = parser.parse_args()
    try:
        args.run(args)
    except StudioError as failure:
        if args.command == "hook":
            return
        if failure.code == "UNAUTHORIZED":
            sys.exit(f"{failure.message} (UNAUTHORIZED). Set XENO_STUDIO_TOKEN to a personal token from the studio's "
                     "Settings, API access, with the read and edit scopes.")
        sys.exit(f"{failure.message} ({failure.code})")
    except KeyboardInterrupt:
        sys.exit(130)


if __name__ == "__main__":
    main()
