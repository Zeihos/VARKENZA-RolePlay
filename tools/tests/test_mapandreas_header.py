import io
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ensure_mapandreas import ensure_header, git_blob_sha


class HeaderTests(unittest.TestCase):
    def test_install_and_verify_existing_header(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "pawn.json").write_text("{}", encoding="utf-8")
            payload = b"native MapAndreas_Init(mode);\n"
            calls = []
            def fetcher(url, timeout):
                calls.append((url, timeout))
                return io.BytesIO(payload)
            expected = git_blob_sha(payload)
            target = ensure_header(root, fetcher=fetcher, expected_sha=expected)
            self.assertEqual(target.read_bytes(), payload)
            self.assertEqual(len(calls), 1)
            self.assertEqual(ensure_header(root, fetcher=fetcher, expected_sha=expected), target)
            self.assertEqual(len(calls), 1)

    def test_rejects_modified_header_and_bad_content(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "pawn.json").write_text("{}", encoding="utf-8")
            with self.assertRaises(ValueError):
                ensure_header(root, fetcher=lambda url, timeout: io.BytesIO(b"bad"))
            self.assertFalse((root / "legacy/mapandreas.inc").exists())
            (root / "legacy").mkdir()
            (root / "legacy/mapandreas.inc").write_bytes(b"untrusted")
            with self.assertRaises(ValueError):
                ensure_header(root, fetcher=lambda url, timeout: io.BytesIO(b"good"))


if __name__ == "__main__":
    unittest.main()
