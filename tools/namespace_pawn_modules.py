#!/usr/bin/env python3
"""Give staged Pawn modules unique basenames to avoid -Z+ include-guard clashes.

pawncc's legacy _inc_ guard is based on a filename, not its directory. For
example, House.inc can suppress a subsequent House.pwn include, leaving
forward declarations without implementations. This script modifies only
the generated runtime copy, never the upstream Git submodule.

Existing source encoding and byte order are preserved.
"""
from pathlib import Path
import hashlib
import re

LOCAL_INCLUDE = re.compile(rb'(?m)^([ \t]*#[ \t]*include[ \t]+)"([^"\r\n]+)"')
RENAMED = re.compile(r'^vkmod_[0-9a-f]{12}_')


def namespace_pawn_modules(runtime):
    runtime = Path(runtime)
    game = runtime / 'gamemodes'
    if not (runtime / 'pawn.json').is_file() or not (game / 'main.pwn').is_file():
        raise ValueError('Expected staged pawn.json and gamemodes/main.pwn')
    paths = sorted(
        (p for p in game.rglob('*') if p.is_file() and p.suffix.lower() == '.pwn'
         and p != game / 'main.pwn' and not RENAMED.match(p.name)),
        key=lambda p: p.as_posix()
    )
    name_map = {}
    targets = {}
    for source in paths:
        relative = source.relative_to(game).as_posix()
        digest = hashlib.sha256(relative.encode('utf-8')).hexdigest()[:12]
        new_name = f'vkmod_{digest}_{source.name}'
        destination = source.with_name(new_name)
        if destination.exists():
            raise ValueError(f'Unexpected staged target exists: {destination}')
        name_map[relative.casefold()] = destination.relative_to(game).as_posix()
        targets[source] = destination

    changes = {}
    for source in game.rglob('*'):
        if not source.is_file() or source.suffix.lower() not in ('.inc', '.pwn'):
            continue
        original = source.read_bytes()

        def rewrite(match):
            try:
                name = match.group(2).decode('ascii').replace('\\', '/')
            except UnicodeDecodeError:
                return match.group(0)
            target = name_map.get(name.casefold())
            if target is None:
                try:
                    relative = (source.parent / name).relative_to(game).as_posix()
                except ValueError:
                    return match.group(0)
                target = name_map.get(relative.casefold())
            if target is None:
                return match.group(0)
            # The upstream has root-relative "modules/..." includes. Preserve
            # that lookup convention while giving the leaf a unique basename.
            if name.startswith('modules/'):
                new_ref = target
            else:
                new_ref = target.split('/')[-1]
            return match.group(1) + b'"' + new_ref.encode('ascii') + b'"'

        amended = LOCAL_INCLUDE.sub(rewrite, original)
        if amended != original:
            changes[source] = amended

    # Reject an ambiguous source before any mutation.
    for source, destination in targets.items():
        if not source.exists() or destination.exists():
            raise ValueError(f'Unsafe module rename: {source}')
    for source, amended in changes.items():
        source.write_bytes(amended)
    for source, destination in targets.items():
        source.rename(destination)
    return len(targets), len(changes)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=Path('build/openrp'))
    args = parser.parse_args()
    result = namespace_pawn_modules(args.runtime)
    print(f'Unique Pawn modules: renamed {result[0]} files; rewrote {result[1]} include sources')
