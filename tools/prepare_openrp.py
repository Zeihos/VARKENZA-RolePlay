#!/usr/bin/env python3
"""Stage a private, branded open.RP runtime without editing the upstream submodule."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import stat
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REQUIRED_DIRS = ('gamemodes', 'filterscripts', 'legacy', 'Maps', 'models', 'plugins', 'scriptfiles')
MARKER = '.varkenza-generated'


def required_env(env):
    fields = ('VARKENZA_MYSQL_PASSWORD', 'VARKENZA_RCON_PASSWORD')
    result = {}
    for name in fields:
        value = env.get(name, '')
        if not value or value in ('0000', 'password', 'changeme', 'REPLACE_ME'):
            raise ValueError(f'{name} is required and cannot be a placeholder')
        if '\n' in value or '\r' in value or '\0' in value:
            raise ValueError(f'{name} contains an invalid character')
        result[name] = value
    if len(result['VARKENZA_RCON_PASSWORD']) < 16:
        raise ValueError('VARKENZA_RCON_PASSWORD must have at least 16 characters')
    for name, default in [('VARKENZA_MYSQL_HOST', '127.0.0.1'),
                          ('VARKENZA_MYSQL_USER', 'varkenza'),
                          ('VARKENZA_MYSQL_DATABASE', 'open_rp'),
                          ('VARKENZA_MYSQL_PORT', '3306')]:
        value = env.get(name, default)
        if not value or any(c in value for c in '\r\n\0'):
            raise ValueError(f'{name} is invalid')
        result[name] = value
    if not result['VARKENZA_MYSQL_PORT'].isdigit() or not 1 <= int(result['VARKENZA_MYSQL_PORT']) <= 65535:
        raise ValueError('VARKENZA_MYSQL_PORT must be 1..65535')
    return result


def replace_one(contents, pattern, replacement, label):
    patched, count = re.subn(pattern, lambda _: replacement, contents, count=1, flags=re.MULTILINE)
    if count != 1:
        raise ValueError(f'Upstream layout changed: missing {label}; refusing unsafe patch')
    return patched


def patch_sources(destination, settings):
    pwn = destination / 'gamemodes' / 'main.pwn'
    text = pwn.read_text(encoding='utf-8-sig', errors='replace')
    text = replace_one(text, r'^#define[ \t]+SERVER_NAME[ \t]+"open\.RP"[ \t]*$',
                       '#define SERVER_NAME "VARKENZA ROLEPLAY"', 'SERVER_NAME')
    text = replace_one(text, r'^#define[ \t]+WEB_URL[ \t]+"https://open\.mp/"[ \t]*$',
                       '#define WEB_URL "https://varkenza-rp.com/"', 'WEB_URL')
    # Linux build hosts resolve includes case-sensitively; upstream has rbits.inc.
    text = replace_one(text, r'^#include[ \t]+<rBits>[ \t]*$',
                       '#include <rbits>', 'legacy rBits include')
    pwn.write_text(text, encoding='utf-8')

    init = destination / 'gamemodes' / 'modules' / 'Server' / 'GameModeInit.pwn'
    original = init.read_text(encoding='utf-8-sig', errors='replace')
    original = replace_one(original, r'^\s*SendRconCommand\("password [^"\r\n]*"\);[^\n]*$',
                           '\t// VARKENZA: never hardcode a server password in source.',
                           'hardcoded startup password')
    init.write_text(original, encoding='utf-8')

    manifest = destination / 'pawn.json'
    data = json.loads(manifest.read_text(encoding='utf-8-sig'))
    if data.get('entry') != 'gamemodes/main.pwn' or data.get('runtime', {}).get('version') != '0.3.DL':
        raise ValueError('Unsupported upstream manifest. Check runtime and Pawn entry before updating.')
    # Original upstream references a plugin with no downloadable release.
    # Use the published x86 Linux/Windows MapAndreas assets, pinned by tag.
    dependencies = data.get('dependencies', [])
    old_mapandreas = 'Southclaws/samp-plugin-mapandreas'
    if old_mapandreas not in dependencies:
        raise ValueError('Upstream MapAndreas dependency changed; review the migration')
    data['dependencies'] = [
        'philip1337/samp-plugin-mapandreas:v1.2.1' if value == old_mapandreas else value
        for value in dependencies
    ]
    data['user'], data['repo'] = 'Zeihos', 'VARKENZA-RolePlay'
    runtime = data['runtime']
    runtime['hostname'] = 'VARKENZA ROLEPLAY | Development'
    runtime['rcon_password'] = settings['VARKENZA_RCON_PASSWORD']
    for mode in data.get('runtimes', []):
        mode['hostname'] = 'VARKENZA ROLEPLAY | Development'
        mode['weburl'] = 'varkenza-rp.com'
        mode['rcon_password'] = settings['VARKENZA_RCON_PASSWORD']
        mode['announce'] = False
        mode['lanmode'] = True
    manifest.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    mysql = destination / 'mysql.ini'
    mysql.write_text(
        'hostname = {VARKENZA_MYSQL_HOST}\nusername = {VARKENZA_MYSQL_USER}\n'
        'password = {VARKENZA_MYSQL_PASSWORD}\ndatabase = {VARKENZA_MYSQL_DATABASE}\n'
        'auto_reconnect = true\nmulti_statements = false\npool_size = 3\n'
        'server_port = {VARKENZA_MYSQL_PORT}\n'.format(**settings), encoding='utf-8')
    if os.name != 'nt':
        mysql.chmod(stat.S_IRUSR | stat.S_IWUSR)
    (destination / MARKER).write_text('Private generated runtime. Do not commit.\n', encoding='utf-8')


def prepare(source, destination, env, replace=False):
    source = source.resolve()
    destination = destination.resolve()
    if source == destination or source in destination.parents or destination in source.parents:
        raise ValueError('Source and destination must not contain one another')
    if not (source / 'LICENSE').is_file() or not (source / 'pawn.json').is_file():
        raise ValueError('Upstream open.RP is missing. Run git submodule update --init --recursive')
    if any(not (source / d).is_dir() for d in REQUIRED_DIRS):
        raise ValueError('Incomplete upstream checkout: expected game directories not found')
    settings = required_env(env)
    if destination.exists():
        if not replace or not (destination / MARKER).is_file():
            raise ValueError('Destination exists. Only an earlier generated directory can be replaced with --replace')
        shutil.rmtree(destination)
    destination.mkdir(parents=True)
    try:
        for name in REQUIRED_DIRS:
            shutil.copytree(source / name, destination / name,
                            ignore=shutil.ignore_patterns('.git', '*.log', 'README.md', 'main.amx'))
        for name in ('pawn.json', 'open_rp.sql', 'LICENSE'):
            source_file = source / name
            if source_file.is_file():
                shutil.copy2(source_file, destination / name)
        # Windows plugins in the pinned upstream reference these runtime DLLs.
        # Copy them from the checked-out upstream; never vendor binary blobs here.
        for name in ('libmariadb.dll', 'log-core.dll'):
            source_file = source / name
            if source_file.is_file():
                shutil.copy2(source_file, destination / name)
        patch_sources(destination, settings)
    except Exception:
        shutil.rmtree(destination)
        raise
    return destination


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=PROJECT_ROOT / 'upstream' / 'open.RP')
    parser.add_argument('--output', type=Path, default=PROJECT_ROOT / 'build' / 'openrp')
    parser.add_argument('--replace', action='store_true')
    args = parser.parse_args(argv)
    try:
        output = prepare(args.source, args.output, os.environ, args.replace)
    except (ValueError, OSError, json.JSONDecodeError) as error:
        print(f'VARKENZA preparation failed: {error}', file=sys.stderr)
        return 1
    print(f'Prepared private development runtime at {output}')
    print('Runtime remains SA-MP 0.3.DL. Build/test compatibility before using open.mp.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
,
                       '#include <rbits>', 'legacy rBits include')
    pwn.write_text(text, encoding='utf-8')

    init = destination / 'gamemodes' / 'modules' / 'Server' / 'GameModeInit.pwn'
    original = init.read_text(encoding='utf-8-sig', errors='replace')
    original = replace_one(original, r'^\s*SendRconCommand\("password [^"\r\n]*"\);[^\n]*$',
                           '\t// VARKENZA: never hardcode a server password in source.',
                           'hardcoded startup password')
    init.write_text(original, encoding='utf-8')

    manifest = destination / 'pawn.json'
    data = json.loads(manifest.read_text(encoding='utf-8-sig'))
    if data.get('entry') != 'gamemodes/main.pwn' or data.get('runtime', {}).get('version') != '0.3.DL':
        raise ValueError('Unsupported upstream manifest. Check runtime and Pawn entry before updating.')
    # Original upstream references a plugin with no downloadable release.
    # Use the published x86 Linux/Windows MapAndreas assets, pinned by tag.
    dependencies = data.get('dependencies', [])
    old_mapandreas = 'Southclaws/samp-plugin-mapandreas'
    if old_mapandreas not in dependencies:
        raise ValueError('Upstream MapAndreas dependency changed; review the migration')
    data['dependencies'] = [
        'philip1337/samp-plugin-mapandreas:v1.2.1' if value == old_mapandreas else value
        for value in dependencies
    ]
    data['user'], data['repo'] = 'Zeihos', 'VARKENZA-RolePlay'
    runtime = data['runtime']
    runtime['hostname'] = 'VARKENZA ROLEPLAY | Development'
    runtime['rcon_password'] = settings['VARKENZA_RCON_PASSWORD']
    for mode in data.get('runtimes', []):
        mode['hostname'] = 'VARKENZA ROLEPLAY | Development'
        mode['weburl'] = 'varkenza-rp.com'
        mode['rcon_password'] = settings['VARKENZA_RCON_PASSWORD']
        mode['announce'] = False
        mode['lanmode'] = True
    manifest.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    mysql = destination / 'mysql.ini'
    mysql.write_text(
        'hostname = {VARKENZA_MYSQL_HOST}\nusername = {VARKENZA_MYSQL_USER}\n'
        'password = {VARKENZA_MYSQL_PASSWORD}\ndatabase = {VARKENZA_MYSQL_DATABASE}\n'
        'auto_reconnect = true\nmulti_statements = false\npool_size = 3\n'
        'server_port = {VARKENZA_MYSQL_PORT}\n'.format(**settings), encoding='utf-8')
    if os.name != 'nt':
        mysql.chmod(stat.S_IRUSR | stat.S_IWUSR)
    (destination / MARKER).write_text('Private generated runtime. Do not commit.\n', encoding='utf-8')


def prepare(source, destination, env, replace=False):
    source = source.resolve()
    destination = destination.resolve()
    if source == destination or source in destination.parents or destination in source.parents:
        raise ValueError('Source and destination must not contain one another')
    if not (source / 'LICENSE').is_file() or not (source / 'pawn.json').is_file():
        raise ValueError('Upstream open.RP is missing. Run git submodule update --init --recursive')
    if any(not (source / d).is_dir() for d in REQUIRED_DIRS):
        raise ValueError('Incomplete upstream checkout: expected game directories not found')
    settings = required_env(env)
    if destination.exists():
        if not replace or not (destination / MARKER).is_file():
            raise ValueError('Destination exists. Only an earlier generated directory can be replaced with --replace')
        shutil.rmtree(destination)
    destination.mkdir(parents=True)
    try:
        for name in REQUIRED_DIRS:
            shutil.copytree(source / name, destination / name,
                            ignore=shutil.ignore_patterns('.git', '*.log', 'README.md', 'main.amx'))
        for name in ('pawn.json', 'open_rp.sql', 'LICENSE'):
            source_file = source / name
            if source_file.is_file():
                shutil.copy2(source_file, destination / name)
        # Windows plugins in the pinned upstream reference these runtime DLLs.
        # Copy them from the checked-out upstream; never vendor binary blobs here.
        for name in ('libmariadb.dll', 'log-core.dll'):
            source_file = source / name
            if source_file.is_file():
                shutil.copy2(source_file, destination / name)
        patch_sources(destination, settings)
    except Exception:
        shutil.rmtree(destination)
        raise
    return destination


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=PROJECT_ROOT / 'upstream' / 'open.RP')
    parser.add_argument('--output', type=Path, default=PROJECT_ROOT / 'build' / 'openrp')
    parser.add_argument('--replace', action='store_true')
    args = parser.parse_args(argv)
    try:
        output = prepare(args.source, args.output, os.environ, args.replace)
    except (ValueError, OSError, json.JSONDecodeError) as error:
        print(f'VARKENZA preparation failed: {error}', file=sys.stderr)
        return 1
    print(f'Prepared private development runtime at {output}')
    print('Runtime remains SA-MP 0.3.DL. Build/test compatibility before using open.mp.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
