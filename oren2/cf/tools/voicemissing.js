#!/usr/bin/env node
/* #400 Read-only report after pregen: how many kid sentences have no recording yet, and the first 20.
   Reads pregen.js's own files (no network, writes nothing of pregen's): said.json = every sentence the game says,
   state.json done = the ones the site has audio for. Prints to the log, adds the job summary in GitHub Actions
   ($GITHUB_STEP_SUMMARY) and `missing=<n>` + `text=<line>` to $GITHUB_OUTPUT (the deploy workflow posts the line
   as the 'voice-missing' commit status, the runner dashboard shows it). Always exits 0: missing audio is not a failure.
   Usage: node oren2/cf/tools/voicemissing.js        (PREGEN_DIR=... to read another folder)                        */
const path = require('path'), fs = require('fs'), os = require('os');
const DIR = process.env.PREGEN_DIR || path.join(os.homedir(), '.cache', 'oren-pregen');
const LIST = path.join(DIR, 'said.json'), STATE = path.join(DIR, 'state.json'), SHOW = 20;
const txt = x => typeof x === 'string' ? x : x.t, idOf = x => typeof x === 'string' ? x : x.v + '|' + x.r + '|' + x.t;   // as in pregen.js
const add = (f, s) => { if (f) try { fs.appendFileSync(f, s); } catch (e) {} };
let L, done = {};
try { L = JSON.parse(fs.readFileSync(LIST, 'utf8')); } catch (e) {
  console.log('voice missing: no sentence list yet (' + LIST + '); run pregen.js first');
  add(process.env.GITHUB_STEP_SUMMARY, '### Voice recordings\nno sentence list yet (pregen did not collect)\n'); process.exit(0); }
try { done = JSON.parse(fs.readFileSync(STATE, 'utf8')).done || {}; } catch (e) {}
const miss = L.filter(x => !done[idOf(x)]);
const line = `${miss.length} of ${L.length} kid sentences have no recording yet`;
const top = miss.slice(0, SHOW).map((x, i) => `  ${i + 1}. ${txt(x)}`);
console.log('voice missing: ' + line + (miss.length > SHOW ? ` (first ${SHOW}):` : miss.length ? ':' : ''));
top.forEach(l => console.log(l));
add(process.env.GITHUB_STEP_SUMMARY, `### Voice recordings\n${line}\n` + (top.length ? '\n' + miss.slice(0, SHOW).map((x, i) => `${i + 1}. ${txt(x)}`).join('\n') + '\n' : ''));
add(process.env.GITHUB_OUTPUT, `missing=${miss.length}\ntext=${line}\n`);
