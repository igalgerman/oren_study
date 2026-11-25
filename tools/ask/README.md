# ask: Hebrew questions to the owner in the browser (RTL page)

1. Write `questions.json` in Hebrew (nikud NOT needed, parent-facing). Fields: `title`, `intro`,
   `questions[]` with `id`, `text`, and either `options` (+ `multi`, `other`) or `free: true`.
2. Run: `C:\Users\97254\miniforge3\python.exe tools/ask/ask.py questions.json` (blocks; opens the browser).
3. Stdout is `{"answers": {id: answer}}` (a list for multi). Also saved as `questions.answers.json`.
   Timeout (`--timeout-min N`, default 60) prints `{"timeout": true}` and exits 3.
4. Read the answers; if something is still open, write a new file and run the next round.
One round at a time, short question lists. `ASK_NO_BROWSER=1` skips opening the browser (URL goes to stderr).
Test: `node tools/ask/test/run.js`.
