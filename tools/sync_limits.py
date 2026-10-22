#!/usr/bin/env python3
"""Sync the limits data from the shipfree repository.

The page renders ``data/limits.json``. That file is asserted in the
``shipfree`` repository and re-checked there against the platforms' own
documentation on every push. This script keeps the copy on this page in
step with it, so the two can never disagree.

Standard library only.

Usage
-----
    python tools/sync_limits.py --check    # exit 1 if out of sync
    python tools/sync_limits.py --write    # update the local copy
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCAL = ROOT / "data" / "limits.json"

SOURCE = (
    "https://raw.githubusercontent.com/AryanRajMaurya/shipfree/main/limits.json"
)
USER_AGENT = "freetier-sync/1.0 (+https://github.com/AryanRajMaurya/freetier)"


def fetch(url: str) -> str:
    """Fetch a URL and return its body as text."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:  # noqa: S310
        return response.read().decode("utf-8")


def normalise(text: str) -> str:
    """Normalise JSON so formatting differences do not count as drift."""
    return json.dumps(json.loads(text), sort_keys=True, indent=2) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", action="store_true", help="verify without writing")
    group.add_argument("--write", action="store_true", help="update the local copy")
    args = parser.parse_args(argv)

    try:
        remote = fetch(SOURCE)
    except (urllib.error.URLError, OSError) as error:
        print(f"error: could not fetch the upstream data: {error}", file=sys.stderr)
        return 2

    upstream = normalise(remote)

    if not LOCAL.exists():
        if args.write:
            LOCAL.parent.mkdir(parents=True, exist_ok=True)
            LOCAL.write_text(upstream)
            print(f"created {LOCAL.relative_to(ROOT)}")
            return 0
        print(f"error: {LOCAL.relative_to(ROOT)} does not exist", file=sys.stderr)
        return 1

    local = normalise(LOCAL.read_text())

    if local == upstream:
        print("ok: data/limits.json matches shipfree")
        return 0

    if args.write:
        LOCAL.write_text(upstream)
        print(f"updated {LOCAL.relative_to(ROOT)}")
        return 0

    print(
        "error: data/limits.json is out of date with shipfree.\n"
        "Run: python tools/sync_limits.py --write",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
