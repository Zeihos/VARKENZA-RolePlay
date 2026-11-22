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

    def test_all_staff_revocation_paths_clean_up_temporary_vehicle(self):
        source = GAME.read_text(encoding="utf-8")
        helper = source.split("stock VarkenzaRevokeStaff(playerid) {", 1)[1].split("\nstock VarkenzaLostSession(", 1)[0]
        self.assertIn("PlayerStaff[playerid] = false;", helper)
        self.assertIn("if (PlayerSpectating[playerid]) VarkenzaStopSpectating(playerid);", helper)
        self.assertIn("new vehicleid = PlayerStaffVehicle[playerid];", helper)
        self.assertLess(helper.index("PlayerStaffVehicle[playerid] = INVALID_VEHICLE_ID;"),
                        helper.index("DestroyVehicle(vehicleid);"))
        lost = source.split("stock VarkenzaLostSession(playerid) {", 1)[1].split("\npublic VarkenzaLinkReply(", 1)[0]
        self.assertIn("VarkenzaRevokeStaff(playerid);", lost)
        self.assertIn("PlayerGarageVehicle[playerid] = INVALID_VEHICLE_ID;", lost)
        self.assertIn("DestroyVehicle(garageVehicle);", lost)
        ping = source.split("public VarkenzaPingReply(", 1)[1].split("\npublic VarkenzaAckReply(", 1)[0]
        self.assertIn('if (!strcmp(commandId, "STAFF_OFF")) VarkenzaRevokeStaff(playerid);', ping)
        staff_off = source.split("public VarkenzaStaffOffReply(", 1)[1].split("\npublic VarkenzaStaffCommandReply(", 1)[0]
        self.assertIn("if (response_code != 200) return SendClientMessage", staff_off)
        self.assertEqual(staff_off.count("VarkenzaRevokeStaff(playerid);"), 2)
        staff_cmd = source.split("public VarkenzaStaffCommandReply(", 1)[1]
        self.assertIn("if (response_code == 401 || response_code == 403) VarkenzaRevokeStaff(playerid);", staff_cmd)

    def test_disconnect_and_staff_delete_reset_the_vehicle_reference(self):
        source = GAME.read_text(encoding="utf-8")
        disconnect = source.split("public OnPlayerDisconnect(playerid, reason) {", 1)[1]
        disconnect = disconnect.split("\npublic ", 1)[0]
        self.assertIn("DestroyVehicle(PlayerStaffVehicle[playerid])", disconnect)
        self.assertIn("PlayerStaffVehicle[playerid] = INVALID_VEHICLE_ID;", disconnect)


if __name__ == "__main__":
    unittest.main()
