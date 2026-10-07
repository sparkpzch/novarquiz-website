import { spawnSync } from 'node:child_process';
const suites=['lobby-api.mjs','security-api.mjs','auth-emulator.mjs','lobby-rules.mjs','storage-rules.mjs'];
for(const suite of suites){
  const result=spawnSync(process.execPath,[`scripts/qa/${suite}`],{stdio:'inherit',env:process.env});
  if(result.status!==0)process.exit(result.status??1);
}
