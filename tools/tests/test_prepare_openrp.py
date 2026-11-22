import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from prepare_openrp import prepare, required_env
from patch_pawn_linkage import PAIRS

PASSWORDS = {
    'VARKENZA_MYSQL_PASSWORD': 'example-test-mysql-secret-only',
    'VARKENZA_RCON_PASSWORD': 'example-test-rcon-secret-only',
}


class PreparationTests(unittest.TestCase):
    def fixture(self, root):
        source = Path(root) / 'upstream'
        for directory in ('gamemodes/modules/Server', 'filterscripts', 'legacy', 'Maps', 'models', 'plugins', 'scriptfiles'):
            (source / directory).mkdir(parents=True, exist_ok=True)
        (source / 'LICENSE').write_text('MIT License\n')
        (source / 'open_rp.sql').write_text('-- test database\n')
        (source / 'mysql.ini').write_text('password = 0000\n')
        (source / 'server.cfg').write_text('rcon_password 0000\n')
        (source / 'libmariadb.dll').write_bytes(b'fixture-library')
        (source / 'log-core.dll').write_bytes(b'fixture-logging')
        (source / 'gamemodes/main.pwn').write_text('#define SERVER_NAME "open.RP"\n#define WEB_URL "https://open.mp/"\n#include <rBits> // legacy\n')
        (source / 'gamemodes/modules/Server/GameModeInit.pwn').write_text('SendRconCommand("password hardcoded-legacy-secret"); // lock\n')
        # Reproduce the actual pinned upstream declarations for fail-closed patch tests.
        for relative, replacements in PAIRS.items():
            target = source / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(b"\n".join(old for old, new in replacements) + b"\n")
        (source / 'pawn.json').write_text(json.dumps({
            'entry': 'gamemodes/main.pwn',
            'dependencies': ['pawn-lang/samp-stdlib', 'Southclaws/samp-plugin-mapandreas'],
            'runtime': {'version': '0.3.DL', 'rcon_password': '0000'},
            'runtimes': [{'name': 'dev', 'rcon_password': '0000'}]
        }))
        return source

    def test_branded_staging_removes_unsafe_defaults(self):
        with tempfile.TemporaryDirectory() as root:
            src = self.fixture(root)
            output = Path(root) / 'runtime'
            prepare(src, output, PASSWORDS)
            self.assertIn('VARKENZA ROLEPLAY', (output / 'gamemodes/main.pwn').read_text())
            self.assertIn('varkenza-rp.com', (output / 'gamemodes/main.pwn').read_text())
            self.assertIn('#include <rbits>', (output / 'gamemodes/main.pwn').read_text())
            staged_server = output / 'gamemodes/modules/Server'
            staged_init = list(staged_server.glob('vkmod_*_GameModeInit.pwn'))
            self.assertEqual(len(staged_init), 1)
            self.assertNotIn('hardcoded-legacy-secret', staged_init[0].read_text())
            self.assertFalse((staged_server / 'GameModeInit.pwn').exists())
            config = json.loads((output / 'pawn.json').read_text())
            self.assertEqual(config['runtime']['version'], '0.3.DL')
            self.assertIn('philip1337/samp-plugin-mapandreas:v1.2.1', config['dependencies'])
            self.assertNotIn('Southclaws/samp-plugin-mapandreas', config['dependencies'])
            self.assertEqual(config['runtime']['rcon_password'], PASSWORDS['VARKENZA_RCON_PASSWORD'])
            self.assertIn(PASSWORDS['VARKENZA_MYSQL_PASSWORD'], (output / 'mysql.ini').read_text())
            self.assertFalse((output / 'server.cfg').exists())
            self.assertEqual((output / 'libmariadb.dll').read_bytes(), b'fixture-library')
            self.assertEqual((output / 'log-core.dll').read_bytes(), b'fixture-logging')
            self.assertEqual((src / 'gamemodes/main.pwn').read_text().splitlines()[0], '#define SERVER_NAME "open.RP"')
            with self.assertRaises(ValueError):
                prepare(src, output, PASSWORDS)
            prepare(src, output, PASSWORDS, replace=True)

    def test_reject_unsafe_credentials_and_destinations(self):
        with self.assertRaises(ValueError):
            required_env({'VARKENZA_MYSQL_PASSWORD': '0000', 'VARKENZA_RCON_PASSWORD': '1234567890123456'})
        with self.assertRaises(ValueError):
            required_env({'VARKENZA_MYSQL_PASSWORD': 'some-secret', 'VARKENZA_RCON_PASSWORD': 'short'})
        with tempfile.TemporaryDirectory() as root:
            src = self.fixture(root)
            with self.assertRaises(ValueError):
                prepare(src, src / 'runtime', PASSWORDS)


if __name__ == '__main__':
    unittest.main()
