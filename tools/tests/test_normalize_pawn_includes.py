from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from normalize_pawn_includes import normalize_pawn_includes


class RelativeIncludesTests(unittest.TestCase):
    def test_case_and_separator_are_fixed_without_rewriting_other_bytes(self):
        with tempfile.TemporaryDirectory() as dirname:
            root = Path(dirname)
            admin = root / "gamemodes/modules/Admin"
            admin.mkdir(parents=True)
            (root / "legacy").mkdir()
            (admin / "report.pwn").write_bytes(b"// actual report file\n")
            original = (
                b'// ' + "Привет".encode("cp1251") + b"\r\n"
                + b'#include "modules\\Admin\\Report.pwn"\r\n'
                + b'#include <YSI_Coding\\y_hooks>\r\n'
                + b'print("modules\\Admin\\Report.pwn");\r\n'
            )
            source = admin / "Admin.inc"
            source.write_bytes(original)
            self.assertEqual(normalize_pawn_includes(root), 1)
            patched = source.read_bytes()
            self.assertIn(b'#include "modules/Admin/report.pwn"', patched)
            self.assertIn("Привет".encode("cp1251"), patched)
            self.assertIn(b'#include <YSI_Coding\\y_hooks>', patched)
            self.assertIn(b'print("modules\\Admin\\Report.pwn");', patched)
            self.assertEqual(normalize_pawn_includes(root), 0)

    def test_refuse_missing_project_and_ambiguous_paths(self):
        with tempfile.TemporaryDirectory() as dirname:
            root = Path(dirname)
            with self.assertRaises(ValueError):
                normalize_pawn_includes(root)
            (root / "gamemodes").mkdir()
            (root / "gamemodes/Admin.inc").write_text("")
            (root / "gamemodes/admin.inc").write_text("")
            with self.assertRaises(ValueError):
                normalize_pawn_includes(root)


if __name__ == "__main__":
    unittest.main()
