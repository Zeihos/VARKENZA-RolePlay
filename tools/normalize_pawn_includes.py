#!/usr/bin/env python3
"""Fix Windows-style relative Pawn #include paths in a staged copy.

Pawn source from SA-MP is often authored on case-insensitive NTFS.
On Linux, backslashes and case differences can break nested source includes.
Only local double-quoted includes resolving to existing game files are changed;
third-party angle-bracket includes and all other code remain untouched.
"""
from pathlib import Path
import re

INCLUDE = re.compile(r'(?m)^([ \t]*#[ \t]*include[ \t]+)"([^"\r\n]+)"')


def normalize_pawn_includes(runtime):
    runtime = Path(runtime)
    main = runtime / "gamemodes"
    if not main.is_dir():
        raise ValueError("Staged game is missing gamemodes/")
    roots = [name for name in ("gamemodes", "filterscripts", "legacy") if (runtime / name).is_dir()]
    catalogs = {}
    for name in roots:
        base = runtime / name
        lookup = {}
        for file in base.rglob("*"):
            if file.is_file() and file.suffix.lower() in (".inc", ".pwn"):
                relative = file.relative_to(base).as_posix()
                key = relative.casefold()
                if key in lookup and lookup[key] != relative:
                    raise ValueError(f"Case-insensitive include collision in {name}: {relative}")
                lookup[key] = relative
        catalogs[name] = lookup

    fixes = 0
    for root in roots:
        base = runtime / root
        for source in list(base.rglob("*.pwn")) + list(base.rglob("*.inc")):
            original = source.read_text(encoding="utf-8-sig", errors="replace")
            relative_parent = source.parent.relative_to(base)
            def rewrite(match):
                nonlocal fixes
                original_path = match.group(2)
                name = original_path.replace("\\", "/")
                for folder in (root, "gamemodes", "legacy", "filterscripts"):
                    if folder not in catalogs:
                        continue
                    candidate = name
                    found = catalogs[folder].get(candidate.casefold())
                    if found:
                        # Prefer the include as seen from the project's include roots.
                        if found != original_path:
                            fixes += 1
                        return match.group(1) + '"' + found + '"'
                # Could be an external/generated include; do not guess its location.
                return match.group(0)
            updated = INCLUDE.sub(rewrite, original)
            if updated != original:
                source.write_text(updated, encoding="utf-8")
    return fixes


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path, default=Path("build/openrp"))
    args = parser.parse_args()
    print(f"Normalized {normalize_pawn_includes(args.runtime)} legacy Pawn include references")
