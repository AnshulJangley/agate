import os

def replace_in_file(filepath, replacements):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            
        modified = False
        for old, new in replacements.items():
            if old in content:
                content = content.replace(old, new)
                modified = True
                
        if modified:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f'Modified {filepath}')
    except Exception as e:
        print(f'Error processing {filepath}: {e}')

replacements = {
    'AGATE PLATFORM': 'AGATE PLATFORM',
    'AGATE Autonomous AI': 'AGATE Autonomous AI',
    'Official AGATE Decision Support Document.': 'Official AGATE Decision Support Document.',
    'AGATE': 'AGATE',
    'AGATE decision suite': 'AGATE decision suite',
    'title AGATE Launcher': 'title AGATE Launcher',
    'Starting AGATE': 'Starting AGATE',
    'getLogger("AGATE")': 'getLogger("AGATE")',
    'Setting up AGATE': 'Setting up AGATE',
    'AGATE - SIH 2026 Solution': 'AGATE - SIH 2026 Solution',
    '# AGATE (Nearby Wells Intelligence System)': '# AGATE (Nearby Wells Intelligence System)',
    'AGATE Nearby Wells Intelligence System': 'AGATE Nearby Wells Intelligence System',
    'AGATE <span': 'AGATE <span',
    'title="AGATE API"': 'title="AGATE API"',
    'AGATE-DOSSIER-2026': 'AGATE-DOSSIER-2026',
    'AGATE-DOSSIER-': 'AGATE-DOSSIER-',
    '': '',
    'AGATE': 'AGATE'
}

for root, _, files in os.walk('.'):
    if 'node_modules' in root or '.git' in root or 'venv' in root or 'fresh_venv' in root or '.gemini' in root or '__pycache__' in root:
        continue
    for file in files:
        if file.endswith(('.js', '.jsx', '.py', '.json', '.md', '.bat', '.txt')):
            replace_in_file(os.path.join(root, file), replacements)
