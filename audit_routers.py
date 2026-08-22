#!/usr/bin/env python3
"""
audit_routers.py — map FastAPI routers against frontend usage + backend cross-imports.

Run from the repo root:
    python3 audit_routers.py

Prints a per-router verdict:
    USED (frontend)        -> referenced somewhere in the frontend (fetch OR <img src>)
    KEEP (internal dep)    -> imported by another backend module (not main.py)
    CANDIDATE TO MOVE      -> no frontend reference, no backend importer

It also flags frontend references that are NOT fetch calls (e.g. image <src>),
since those are easy to miss in a fetch-only audit.
"""
import re
from pathlib import Path

REPO = Path(".").resolve()
ROUTERS_DIR = REPO / "backend" / "routers"
BACKEND_DIR = REPO / "backend"

FE_EXTS = {".js", ".jsx", ".ts", ".tsx"}
SKIP_DIRS = {"node_modules", "dist", "build", ".git", "__pycache__", "venv", ".venv", ".next"}


def skip(path: Path) -> bool:
    return any(part in SKIP_DIRS for part in path.parts)


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def iter_files(root: Path, exts):
    for p in root.rglob("*"):
        if skip(p) or not p.is_file():
            continue
        if p.suffix in exts:
            yield p


# ── 1. Collect router modules (files that define an APIRouter) ──────────────
def find_router_files():
    out = []
    for p in ROUTERS_DIR.rglob("*.py"):
        if skip(p):
            continue
        if "APIRouter" in read(p):
            out.append(p)
    return sorted(out)


# Multi-line-tolerant prefix extraction + explicit route paths
def extract_endpoints(txt: str):
    prefixes = re.findall(
        r"APIRouter\([^)]*?prefix\s*=\s*['\"]([^'\"]+)", txt, re.DOTALL
    )
    routes = re.findall(
        r"@\w+\.(?:get|post|put|patch|delete|websocket)\(\s*['\"]([^'\"]+)", txt
    )
    return prefixes, routes


def search_tokens(prefixes, routes):
    """Frontend-facing strings to look for. Prefix if present, else full route paths."""
    tokens = set()
    for pre in prefixes:
        t = pre.rstrip("/")
        if t and t != "":
            tokens.add(t)
    if not prefixes:  # no prefix -> the full path lives on each route decorator
        for r in routes:
            t = r.rstrip("/")
            if t and t != "":
                tokens.add(t)
    return sorted(tokens)


# Boundary-safe search so "/QMLPredict" does NOT match "/QMLPredictV2"
def token_regex(token: str):
    return re.compile(re.escape(token) + r"(?=[/'\"`)\s,?]|$)")


# ── 2. Scan frontend for references ─────────────────────────────────────────
def load_frontend():
    files = []
    for p in iter_files(REPO, FE_EXTS):
        if "backend" in p.parts:
            continue
        files.append((p, read(p)))
    return files


def frontend_hits(tokens, frontend):
    hits = []  # (token, relpath, line, is_fetch)
    for token in tokens:
        rx = token_regex(token)
        for path, txt in frontend:
            for ln in txt.splitlines():
                if rx.search(ln):
                    is_fetch = "fetch(" in ln or "fetch (" in ln
                    hits.append((token, path.relative_to(REPO), ln.strip(), is_fetch))
                    break  # one hit per file per token is enough
    return hits


# ── 3. Backend cross-imports (who imports this module, besides main.py) ─────
def backend_importers(stem: str, self_path: Path):
    importers = []
    rx = re.compile(r"\bimport\b.*\b" + re.escape(stem) + r"\b|\bfrom\b.*\b" + re.escape(stem) + r"\b")
    for p in BACKEND_DIR.rglob("*.py"):
        if skip(p) or p == self_path or p.name == "main.py":
            continue
        for ln in read(p).splitlines():
            if "import" in ln and rx.search(ln):
                importers.append((p.relative_to(REPO), ln.strip()))
                break
    return importers


# ── 4. Helper modules (routers/ .py files with NO APIRouter) ────────────────
def find_helper_modules(router_files):
    routers = set(router_files)
    out = []
    for p in ROUTERS_DIR.rglob("*.py"):
        if skip(p) or p in routers or p.name == "__init__.py":
            continue
        out.append(p)
    return sorted(out)


def main():
    if not ROUTERS_DIR.exists():
        print(f"!! {ROUTERS_DIR} not found. Run this from the repo root.")
        return

    frontend = load_frontend()
    print(f"Scanned {len(frontend)} frontend files "
          f"({', '.join(sorted(FE_EXTS))}).\n")

    router_files = find_router_files()
    move, keep, used = [], [], []

    for p in router_files:
        txt = read(p)
        prefixes, routes = extract_endpoints(txt)
        tokens = search_tokens(prefixes, routes)
        hits = frontend_hits(tokens, frontend)
        importers = backend_importers(p.stem, p)

        print("=" * 70)
        print(f"{p.relative_to(REPO)}")
        print(f"  prefix(es): {prefixes or '<none>'}")
        if not prefixes and routes:
            print(f"  routes:     {routes}")

        if hits:
            verdict = "USED (frontend)"
            used.append(p)
            for token, rel, line, is_fetch in hits:
                tag = "" if is_fetch else "   <-- NOT a fetch() call (img src / other?)"
                print(f"  hit: '{token}' in {rel}{tag}")
        elif importers:
            verdict = "KEEP (internal backend dependency)"
            keep.append(p)
            for rel, line in importers:
                print(f"  imported by: {rel}  ::  {line}")
        else:
            verdict = "CANDIDATE TO MOVE"
            move.append(p)
        print(f"  >> VERDICT: {verdict}")

    # Helper modules
    helpers = find_helper_modules(router_files)
    if helpers:
        print("\n" + "#" * 70)
        print("# Helper modules (no APIRouter) — check importers before moving")
        print("#" * 70)
        for h in helpers:
            importers = backend_importers(h.stem, h)
            print(f"{h.relative_to(REPO)}")
            if importers:
                for rel, line in importers:
                    print(f"  imported by: {rel}  ::  {line}")
                print("  >> KEEP (still imported)")
            else:
                print("  >> CANDIDATE TO MOVE (no importers found)")

    # Summary
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"USED (frontend):     {[str(p.relative_to(REPO)) for p in used]}")
    print(f"KEEP (internal dep): {[str(p.relative_to(REPO)) for p in keep]}")
    print(f"CANDIDATE TO MOVE:   {[str(p.relative_to(REPO)) for p in move]}")
    print("\nReminder: a 'CANDIDATE TO MOVE' still needs its import + "
          "include_router line removed from backend/main.py.")


if __name__ == "__main__":
    main()
