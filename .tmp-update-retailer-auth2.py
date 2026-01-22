from pathlib import Path

path = Path('/var/supermandi/backend/services/auth-service/src/routes/retailerAuth.ts')
text = path.read_text()
lines = text.splitlines()
out = []
i = 0
while i < len(lines):
    line = lines[i]
    if 'accessToken: tokenPair.accessToken' in line:
        line = line.replace('accessToken', 'token', 1)
    if line.strip() == 'store: {' and 'tokenPair.accessToken' in '\n'.join(lines[max(0, i - 20):i]):
        indent = line[:line.index('store: {')]
        out.append(line)
        out.append(f"{indent}  storeId: store.id,")
        out.append(f"{indent}  storeCode: store.code,")
        out.append(f"{indent}  storeName: store.name,")
        i += 1
        while i < len(lines):
            if lines[i].strip() == '},':
                out.append(lines[i])
                break
            i += 1
        i += 1
        continue
    out.append(line)
    i += 1

updated = '\n'.join(out) + '\n'
if updated != text:
    backup = path.with_suffix('.ts.bak.jwtfix2')
    backup.write_text(text)
    path.write_text(updated)
