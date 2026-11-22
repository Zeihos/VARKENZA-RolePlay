import hashlib
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from namespace_pawn_modules import namespace_pawn_modules


class UniquePawnModulesTests(unittest.TestCase):
    def test_prevent_same_basename_include_collision_and_preserve_original_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            game = root / 'gamemodes'
            modules = game / 'modules' / 'Systems' / 'House'
            modules.mkdir(parents=True)
            (root / 'pawn.json').write_text('{}')
            (game / 'main.pwn').write_bytes(b'#include "modules/Systems/House/House.inc"\r\n')
            (modules / 'House.inc').write_bytes(
                b'#include "modules/Systems/House/House.pwn"\r\n'
                b'#include "modules/Systems/House/Furniture.pwn"\r\n'
            )
            house = b'// ' + "Тест".encode('cp1251') + b'\r\nHouse_Exists(id) { return id > 0; }\r\n'
            (modules / 'House.pwn').write_bytes(house)
            (modules / 'Furniture.pwn').write_bytes(b'Furniture() { return House_Exists(1); }\n')
            number, patched = namespace_pawn_modules(root)
            self.assertEqual((number, patched), (2, 1))
            self.assertFalse((modules / 'House.pwn').exists())
            self.assertTrue((modules / 'House.inc').is_file())
            hashed = hashlib.sha256(b'modules/Systems/House/House.pwn').hexdigest()[:12]
            renamed = modules / f'vkmod_{hashed}_House.pwn'
            self.assertEqual(renamed.read_bytes(), house)
            self.assertIn(f'vkmod_{hashed}_House.pwn'.encode(), (modules / 'House.inc').read_bytes())
            self.assertEqual(namespace_pawn_modules(root), (0, 0))

    def test_same_leaf_different_folders_get_distinct_guards(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            game = root / 'gamemodes'
            for sub in ('modules/A', 'modules/B'):
                directory = game / sub
                directory.mkdir(parents=True)
                (directory / 'Thing.pwn').write_text('Thing() {}\n')
            (root / 'pawn.json').write_text('{}')
            (game / 'main.pwn').write_text(
                '#include "modules/A/Thing.pwn"\n'
                '#include "modules/B/Thing.pwn"\n')
            self.assertEqual(namespace_pawn_modules(root), (2, 1))
            lines = (game / 'main.pwn').read_text().splitlines()
            self.assertNotEqual(lines[0], lines[1])
            self.assertTrue(all('vkmod_' in line for line in lines))

    def test_fail_closed_when_destination_already_exists(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            game = root / 'gamemodes'
            game.mkdir()
            (root / 'pawn.json').write_text('{}')
            (game / 'main.pwn').write_text('#include "House.pwn"\n')
            (game / 'House.pwn').write_text('House() {}\n')
            digest = hashlib.sha256(b'House.pwn').hexdigest()[:12]
            (game / f'vkmod_{digest}_House.pwn').write_text('unexpected')
            with self.assertRaisesRegex(ValueError, "target exists"):
                namespace_pawn_modules(root)
            self.assertEqual((game / 'main.pwn').read_text(), '#include "House.pwn"\n')


if __name__ == '__main__':
    unittest.main()
