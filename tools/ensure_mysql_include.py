#!/usr/bin/env python3
"""Install the exact MySQL R41-4 Pawn include from its original source template.

Upstream pBlueG/SA-MP-MySQL R41-4 distributes a_mysql.inc.in. The generated
a_mysql.inc is a local compiler input, NOT committed into this repository.
Only a Git-blob-hash-verified source is accepted.
"""
import argparse
import hashlib
import os
from pathlib import Path
import sys
from urllib.request import urlopen

SOURCE_COMMIT = "937e6c9f3e72d93c83806e8200361ae99e1b5dfd"
SOURCE_BLOB = "6061044afdbd88c16d37a6a0c85edce18c7cb967"
TEMPLATE_URL = (
    "https://raw.githubusercontent.com/pBlueG/SA-MP-MySQL/"
    + SOURCE_COMMIT + "/a_mysql.inc.in"
)
PLACEHOLDER = b"@MYSQL_PLUGIN_VERSION@"
RELEASE = b"R41-4"
MAX_BYTES = 65536


def git_blob_sha(content):
    return hashlib.sha1(b"blob " + str(len(content)).encode() + b"\0" + content).hexdigest()


def render_include(template):
    if template.count(PLACEHOLDER) != 1:
        raise ValueError("Unexpected R41-4 template version placeholder")
    return template.replace(PLACEHOLDER, RELEASE, 1)


def ensure_include(runtime, fetcher=urlopen, expected_blob=SOURCE_BLOB, template_url=TEMPLATE_URL):
    runtime = Path(runtime)
    if not (runtime / "pawn.json").is_file():
        raise ValueError("Expected a staged Pawn project (pawn.json)")
    target = runtime / "legacy" / "a_mysql.inc"
    if target.is_file():
        content = target.read_bytes()
        if b"@MYSQL_PLUGIN_VERSION@" in content or RELEASE not in content:
            raise ValueError("Existing a_mysql.inc is not a generated R41-4 include")
        # Verify the existing include matches precisely what a trusted template
        # would generate before reusing it, not merely a matching version label.
    with fetcher(template_url, timeout=30) as stream:
        template = stream.read(MAX_BYTES + 1)
    if len(template) > MAX_BYTES or git_blob_sha(template) != expected_blob:
        raise ValueError("MySQL R41-4 source hash mismatch; refusing unverified include")
    generated = render_include(template)
    if target.is_file():
        if target.read_bytes() != generated:
            raise ValueError("Existing a_mysql.inc differs from pinned R41-4 source")
        return target
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(target.name + ".tmp")
    try:
        temporary.write_bytes(generated)
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)
    return target


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path, default=Path("build/openrp"))
    args = parser.parse_args(argv)
    try:
        output = ensure_include(args.runtime)
    except (OSError, ValueError) as error:
        print(f"Cannot install verified MySQL Pawn include: {error}", file=sys.stderr)
        return 1
    print(f"Verified MySQL R41-4 include: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
