// Uses only the Python standard library, available in this development environment.
import {execFileSync} from 'node:child_process';
execFileSync('python',['-c',`
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
with ZipFile('public/baixatudo-extension.zip','w',ZIP_DEFLATED) as z:
 for f in Path('extension').iterdir():
  if f.is_file(): z.write(f,f.name)
Path('entregas').mkdir(exist_ok=True)
files=['index.html','server.mjs','package.json','package-lock.json','README.md','VERIFICACAO.md','THIRD_PARTY_NOTICES.md','vercel.json','.gitignore']
with ZipFile('entregas/baixatudo-studio.zip','w',ZIP_DEFLATED) as z:
 for f in files:
  if Path(f).is_file(): z.write(f)
 for folder in ['src','public','extension','tests','scripts','engine','api']:
  for f in Path(folder).rglob('*'):
   if f.is_file(): z.write(f)
`],{stdio:'inherit'});
console.log('Pacotes preparados: public/baixatudo-extension.zip e entregas/baixatudo-studio.zip');
