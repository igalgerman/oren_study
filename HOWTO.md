# How to work (owner)

Open Claude in `C:\work\Oren_study\a` and type:

| I want to… | Type |
|---|---|
| add a new idea (Claude asks me questions first) | `/idea <a few words>` |
| report a bug | `/bug <what's wrong, where>` |
| add a clear task | `/task <the task>` |
| run the backlog now | `/go` |
| see what's going on | `/status` |
| take the last change off the site | `/undo` |

The inspector and executor role files live in the repo in `docs/roles/`.
New or formatted PC: `powershell -File tools\setup\setup.ps1 -Install` rebuilds the setup, see `docs/setup.md`.

At the end of a hard day, type `/retro` in the orchestrator or inspector window.

Each task opens its own window in herdr (`issue-<n>`). You can talk to it there.
When it's done, the change is tested, live on the site, and you get one line.

Once: put the Cloudflare token in `.env` (this folder). Never paste it in chat.
New main session: "read ORCHESTRATOR.md and continue".

## From the phone (also when the PC is off) — #306
Two Claude cloud sessions are always on. Their links are in the pinned issue **"Cloud desks: phone links"**.
- **Game inbox (cloud)** — write a new task, idea or bug (Hebrew is fine). It checks the backlog and opens the issue, then answers with its number.
- **Game ask (cloud)** — ask "what is running now and what needs me?". Read-only. It reads the issue and PR lists on GitHub (the live panel is on the PC).

How to open them: Claude app on the phone → **Code** → the session named *Game inbox (cloud)* / *Game ask (cloud)*. Or tap its link in the pinned issue (GitHub app).
If a session ended, the PC starts a new one by itself and the links in the pinned issue change.

בטלפון (גם כשהמחשב כבוי): באפליקציית Claude, בלשונית Code, פתח את "Game inbox (cloud)" כדי לכתוב משימה חדשה, או את "Game ask (cloud)" כדי לשאול מה קורה ומה מחכה לך. הקישורים נמצאים גם בנושא המוצמד "Cloud desks: phone links".

Short control session contexts (#923): to give a control session a fresh start, run `python tools/runner/recover.py refresh <role>` (orchestrator, inbox, inspector or executor). It refuses while the role is busy.

## Console in the Claude chat (#885)
Project 'קונסולה' instructions (claude.ai): "זו הקונסולה שלי. בפתיחת כל שיחה, וכל פעם שאני כותב 'שאלות', הפעל את הכלי show_questions והצג את הכרטיס. אל תענה על שאלה במקומי, אל תנחש תשובה ואל תקרא ל-answer_question. כתוב עברית קצרה."
Secrets (Cloudflare Pages > oren-game): CONSOLE_OWNER_EMAIL, CONSOLE_MAIL_KEY (Resend API key), CONSOLE_SIGN_KEY (`openssl rand -hex 32`). Connector URL: https://oren-game.pages.dev/mcp
