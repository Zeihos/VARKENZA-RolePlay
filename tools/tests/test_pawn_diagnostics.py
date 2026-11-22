import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pawn_diagnostics import analyze_log, markdown


class PawnDiagnosticTests(unittest.TestCase):
    def test_count_and_group_real_pawn_errors(self):
        raw = (
            '/tmp/build/gamemodes/vkmod_GMX.pwn:42 (error 004) function "Player_SafeSpawned" is not implemented\n'
            '/tmp/build/gamemodes/vkmod_House.pwn:206 (error 017) undefined symbol "IsACop"\n'
            '/tmp/build/gamemodes/vkmod_House.pwn:743 (error 017) undefined symbol "IsACop"\n'
            'build failed with 26 compiler diagnostics\n'
        )
        errors, groups = analyze_log(raw)
        self.assertEqual(len(errors), 3)
        self.assertEqual(groups[("IsACop", "017")], 2)
        self.assertEqual(groups[("Player_SafeSpawned", "004")], 1)
        report = markdown(raw)
        self.assertIn("Total errors in captured log: **3**", report)
        self.assertIn("IsACop", report)
        self.assertIn("diagnostic limit", report)

    def test_unknown_or_empty_output_never_claims_compilation(self):
        report = markdown("no errors in visible log")
        self.assertIn("does not prove the game compiled successfully", report)
        self.assertIn("main.amx", report)


if __name__ == "__main__":
    unittest.main()
