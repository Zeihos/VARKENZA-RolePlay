import io
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ensure_mysql_include import ensure_include, git_blob_sha, render_include


class MySQLIncludeTests(unittest.TestCase):
    def test_verified_render_and_reuse(self):
        template = b"/* MySQL @MYSQL_PLUGIN_VERSION@ */\nnative mysql_close();\n"
        calls = []
        def fetch(url, timeout):
            calls.append((url, timeout))
            return io.BytesIO(template)
        with tempfile.TemporaryDirectory() as dirname:
            directory = Path(dirname)
            (directory / "pawn.json").write_text("{}", encoding="utf-8")
            opts = {"fetcher": fetch, "expected_blob": git_blob_sha(template)}
            target = ensure_include(directory, **opts)
            self.assertEqual(target.read_bytes(), render_include(template))
            self.assertEqual(target.read_text().count("R41-4"), 1)
            self.assertEqual(ensure_include(directory, **opts), target)
            self.assertEqual(len(calls), 2)

    def test_refuse_changed_template_or_tampered_header(self):
        template = b"@MYSQL_PLUGIN_VERSION@\n"
        with tempfile.TemporaryDirectory() as dirname:
            directory = Path(dirname)
            (directory / "pawn.json").write_text("{}", encoding="utf-8")
            def fetch(url, timeout):
                return io.BytesIO(template)
            with self.assertRaises(ValueError):
                ensure_include(directory, fetcher=fetch, expected_blob="0" * 40)
            self.assertFalse((directory / "legacy/a_mysql.inc").exists())
            target = ensure_include(directory, fetcher=fetch, expected_blob=git_blob_sha(template))
            target.write_bytes(b"R41-4\n// modified externally")
            with self.assertRaises(ValueError):
                ensure_include(directory, fetcher=fetch, expected_blob=git_blob_sha(template))

    def test_require_single_version_placeholder_and_manifest(self):
        for item in [b"", b"hello", b"@MYSQL_PLUGIN_VERSION@ @MYSQL_PLUGIN_VERSION@"]:
            with self.assertRaises(ValueError):
                render_include(item)
        with tempfile.TemporaryDirectory() as dirname:
            with self.assertRaises(ValueError):
                ensure_include(Path(dirname), fetcher=lambda url, timeout: io.BytesIO(b""))

if __name__ == "__main__":
    unittest.main()
