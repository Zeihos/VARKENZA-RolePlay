"""Check local links in public Russian documentation without network access."""
import re
import subprocess
import unittest
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[2]
MARKDOWN = ("README.md", "CONTRIBUTING.md", "SECURITY.md")
RE_LINK = re.compile(r'\]\(([^)\s]+)(?:\s+"[^"]*")?\)|(?:src|href)="([^"]+)"')


class DocumentationLinksTests(unittest.TestCase):
    def test_local_links_resolve(self):
        documents = [ROOT / name for name in MARKDOWN] + sorted((ROOT / "docs").glob("*.md"))
        # A Git submodule is a gitlink, which checkout may leave unpopulated.
        tracked = subprocess.check_output(["git", "ls-files", "--stage"], cwd=ROOT, text=True)
        gitlinks = {
            entry.split("\t", 1)[1].strip()
            for entry in tracked.splitlines()
            if entry.startswith("160000 ")
        }
        self.assertTrue(documents)
        for document in documents:
            self.assertTrue(document.is_file(), f"Missing document: {document}")
            for match in RE_LINK.finditer(document.read_text(encoding="utf-8")):
                url = next(value for value in match.groups() if value is not None)
                if url.startswith(("http:", "https:", "mailto:", "#", "data:")):
                    continue
                relative = unquote(url.split("#", 1)[0].split("?", 1)[0])
                if not relative:
                    continue
                destination = (document.parent / relative).resolve()
                repo_relative = destination.relative_to(ROOT.resolve()).as_posix()
                with self.subTest(document=document.name, url=url):
                    self.assertTrue(
                        destination.exists() or repo_relative in gitlinks,
                        f"Broken link in {document.relative_to(ROOT)}: {url}"
                    )


if __name__ == "__main__":
    unittest.main()
