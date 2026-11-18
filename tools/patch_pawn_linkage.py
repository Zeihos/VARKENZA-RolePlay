#!/usr/bin/env python3
"""Resolve confirmed Pawn cross-module references in a staged open.RP copy.

The upstream files are never edited. Routines with 'forward' declarations
must use matching 'public' definitions; late includes need declarations or
reordering. No dummy implementations, removed calls, or fake AMX binaries.
"""
import argparse
from pathlib import Path
import sys

G = "gamemodes/modules/"
PAIRS = {
    G + "Player/SaveLoad/player_crashes.pwn": [
        (b"\nbool:Player_SafeSpawned(playerid)\n",
         b"\npublic bool:Player_SafeSpawned(playerid)\n"),
    ],
    G + "Systems/Vehicles/Vehicles_Core.pwn": [
        (b"\nbool: Vehicle_Exists(type, vehicleid)\n",
         b"\npublic bool: Vehicle_Exists(type, vehicleid)\n"),
    ],
    G + "Systems/House/House.pwn": [
        (b"\nbool: House_Exists(houseid)\n",
         b"\npublic bool: House_Exists(houseid)\n"),
        (b"\nPlayer_InHouse(playerid)\n",
         b"\npublic Player_InHouse(playerid)\n"),
        (b"\nPlayer_HouseArea(playerid)\n",
         b"\npublic Player_HouseArea(playerid)\n"),
    ],
    G + "Systems/House/House.inc": [
        (
            b'#include "modules/Systems/House/Furniture.pwn"\n'
            b'#include "modules/Systems/House/ExteriorFurniture.pwn"\n'
            b'#include "modules/Systems/House/HouseStorage.pwn"\n',
            b'#include "modules/Systems/House/HouseStorage.pwn"\n'
            b'#include "modules/Systems/House/Furniture.pwn"\n'
            b'#include "modules/Systems/House/ExteriorFurniture.pwn"\n',
        ),
    ],
    G + "Systems/Bizz/BizzFurniture.pwn": [
        (b"\nRotateBizzFurDoor(biznisid, playerid)\n",
         b"\npublic RotateBizzFurDoor(biznisid, playerid)\n"),
    ],
    G + "Systems/Factions/Factions.pwn": [
        (b"\nstock SendRadioMessage(member, color, sstring[])\n",
         b"\npublic SendRadioMessage(member, color, sstring[])\n"),
    ],
    G + "Systems/Systems_Header.inc": [
        (
            b"\n// Faction - Law Duty\n",
            b"\n// VARKENZA: used before the Factions/Bizz module definitions.\n"
            b"forward SendRadioMessage(member, color, sstring[]);\n"
            b"forward RotateBizzFurDoor(biznisid, playerid);\n"
            b"\n// Faction - Law Duty\n",
        ),
    ],
}


def patch_linkage(runtime):
    runtime = Path(runtime)
    if not (runtime / "pawn.json").is_file():
        raise ValueError("Missing staged pawn.json; prepare the runtime first")
    changes = {}
    for name, replacements in PAIRS.items():
        path = runtime / name
        if not path.is_file():
            raise ValueError(f"Expected upstream game file is missing: {name}")
        before = path.read_bytes()
        result = before
        for old, new in replacements:
            if result.count(new) == 1:
                # Re-running a staged build must not mutate files twice.
                continue
            elif result.count(old) == 1:
                result = result.replace(old, new, 1)
            else:
                raise ValueError(f"Unrecognized upstream signature in {name}: {old[:70]!r}")
        if result != before:
            changes[path] = result
    # Validate all signatures before writing anything. Do not partially patch.
    for path, result in changes.items():
        path.write_bytes(result)
    return len(changes)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path, default=Path("build/openrp"))
    args = parser.parse_args(argv)
    try:
        updated = patch_linkage(args.runtime)
    except (OSError, ValueError) as error:
        print(f"Cannot repair staged Pawn linkage: {error}", file=sys.stderr)
        return 1
    print(f"Patched {updated} staged Pawn files (upstream unchanged)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
