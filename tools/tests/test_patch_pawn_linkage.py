from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from patch_pawn_linkage import PAIRS, patch_linkage


def fixture(root):
    (root / "pawn.json").write_text("{}", encoding="utf-8")
    for name, replacements in PAIRS.items():
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        data = b"// synthetic upstream fixture\n" + b"\n".join(old for old, new in replacements)
        target.write_bytes(data + b"\n")
    return root


class LinkagePatchTests(unittest.TestCase):
    def test_real_function_definitions_remain_and_patch_is_repeatable(self):
        with tempfile.TemporaryDirectory() as dirname:
            root = fixture(Path(dirname))
            prior = {name: (root / name).read_bytes() for name in PAIRS}
            self.assertEqual(patch_linkage(root), len(PAIRS))
            for name, patterns in PAIRS.items():
                result = (root / name).read_bytes()
                self.assertNotEqual(result, prior[name], name)
                for old, new in patterns:
                    self.assertIn(new, result, name)
                # Avoid corrupted non-ASCII source data in future changes.
            self.assertEqual(patch_linkage(root), 0)

    def test_abort_before_writing_if_source_is_modified(self):
        with tempfile.TemporaryDirectory() as dirname:
            root = fixture(Path(dirname))
            name = list(PAIRS)[-1]
            (root / name).write_bytes(b"// unexpected upstream header format")
            originals = {p: (root / p).read_bytes() for p in PAIRS}
            with self.assertRaisesRegex(ValueError, "Unrecognized upstream"):
                patch_linkage(root)
            for path, content in originals.items():
                self.assertEqual((root / path).read_bytes(), content)

    def test_require_prepared_runtime(self):
        with tempfile.TemporaryDirectory() as dirname:
            with self.assertRaisesRegex(ValueError, "pawn.json"):
                patch_linkage(Path(dirname))


if __name__ == "__main__":
    unittest.main()
