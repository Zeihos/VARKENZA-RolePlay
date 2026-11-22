"""Regression guards for the separate open.mp gameplay prototype.

This is a source-level assertion, not a substitute for compiling or testing
Pawn on a running server. It catches regressions in vehicle ID cleanup.
"""
from pathlib import Path
import re
import unittest

GAME = Path(__file__).resolve().parents[2] / "game/gamemodes/varkenza.pwn"


class VehicleLifecycleTests(unittest.TestCase):
    def test_destroyed_staff_vehicle_is_invalidated_before_other_handling(self):
        source = GAME.read_text(encoding="utf-8")
        start = source.index("public OnVehicleDeath(vehicleid, killerid) {")
        end = source.index("\n// All staff privileges", start)
        handler = source[start:end]
        self.assertRegex(
            handler,
            r"if \(PlayerStaffVehicle\[i\] == vehicleid\)\s*\{"
            r"\s*PlayerStaffVehicle\[i\] = INVALID_VEHICLE_ID;",
        )
        self.assertLess(
            handler.index("PlayerStaffVehicle[i] = INVALID_VEHICLE_ID;"),
            handler.index("if (PlayerGarageVehicle[i] != vehicleid) continue;"),
        )
        self.assertIn("if (!IsPlayerConnected(i)) continue;", handler)

    def test_revoked_staff_session_destroys_temporary_vehicle(self):
        source = GAME.read_text(encoding="utf-8")
        lost = source.split("stock VarkenzaLostSession(playerid) {", 1)[1]
        lost = lost.split("\npublic VarkenzaLinkReply(", 1)[0]
        self.assertIn("new staffVehicle = PlayerStaffVehicle[playerid];", lost)
        self.assertIn("PlayerStaffVehicle[playerid] = INVALID_VEHICLE_ID;", lost)
        self.assertIn("DestroyVehicle(staffVehicle);", lost)
        self.assertIn("new garageVehicle = PlayerGarageVehicle[playerid];", lost)
        self.assertIn("PlayerGarageVehicle[playerid] = INVALID_VEHICLE_ID;", lost)
        self.assertIn("DestroyVehicle(garageVehicle);", lost)
        self.assertLess(lost.index("PlayerStaffVehicle[playerid] = INVALID_VEHICLE_ID;"),
                        lost.index("DestroyVehicle(staffVehicle);"))
        self.assertLess(lost.index("PlayerGarageVehicle[playerid] = INVALID_VEHICLE_ID;"),
                        lost.index("DestroyVehicle(garageVehicle);"))

    def test_disconnect_and_staff_delete_reset_the_vehicle_reference(self):
        source = GAME.read_text(encoding="utf-8")
        disconnect = source.split("public OnPlayerDisconnect(playerid, reason) {", 1)[1]
        disconnect = disconnect.split("\npublic ", 1)[0]
        self.assertIn("DestroyVehicle(PlayerStaffVehicle[playerid])", disconnect)
        self.assertIn("PlayerStaffVehicle[playerid] = INVALID_VEHICLE_ID;", disconnect)


if __name__ == "__main__":
    unittest.main()
