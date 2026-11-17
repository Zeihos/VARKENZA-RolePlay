#!/usr/bin/env python3
"""Install a verified legacy MapAndreas Pawn header into a staged local runtime.

The pinned upstream plugin release contains the x86 binaries but sampctl may
not expose mapandreas.inc as a compiler include. Never copy an unverified
header into the runtime. The third-party source is fetched, not vendored.
"""
import argparse
import hashlib
import os
from pathlib import Path
import sys
from urllib.request import urlopen

PINNED_COMMIT = "92b93aa44d2640249d97adde3ec7798ce4f36b79"
EXPECTED_BLOB = "be0116185338bdde63c86405d703e889e6f20a61"
URL = (
    "https://raw.githubusercontent.com/philip1337/samp-plugin-mapandreas/"
    + PINNED_COMMIT + "/include/mapandreas.inc"
)
MAX_BYTES = 65536


def git_blob_sha(content):
    prefix = b"blob " + str(len(content)).encode("ascii") + b"\x00"
    return hashlib.sha1(prefix + content).hexdigest()


def ensure_header(runtime, fetcher=urlopen, expected_sha=EXPECTED_BLOB):
    runtime = Path(runtime)
    if not (runtime / "pawn.json").is_file():
        raise ValueError("Expected a staged Pawn runtime with pawn.json")
    target = runtime / "legacy" / "mapandreas.inc"
    if target.is_file():
        if git_blob_sha(target.read_bytes()) != expected_sha:
            raise ValueError("Existing mapandreas.inc differs from pinned v1.2.1")
        return target
    with fetcher(URL, timeout=30) as response:
        payload = response.read(MAX_BYTES + 1)
    if len(payload) > MAX_BYTES or git_blob_sha(payload) != expected_sha:
        raise ValueError("MapAndreas header failed pinned Git blob integrity check")
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(target.name + ".tmp")
    try:
        temporary.write_bytes(payload)
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)
    return target


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path, default=Path("build/openrp"))
    args = parser.parse_args(argv)
    try:
        path = ensure_header(args.runtime)
    except (OSError, ValueError, RuntimeError) as err:
        print("MapAndreas include unavailable:", err, file=sys.stderr)
        return 1
    print("Verified MapAndreas include:", path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
