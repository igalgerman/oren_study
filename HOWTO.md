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

At the end of a hard day, type `/retro` in the orchestrator or inspector window.

Each task opens its own window in herdr (`issue-<n>`). You can talk to it there.
When it's done, the change is tested, live on the site, and you get one line.

Once: put the Cloudflare token in `.env` (this folder). Never paste it in chat.
New main session: "read ORCHESTRATOR.md and continue".

## From the phone (also when the PC is off) — #306
Two Claude cloud sessions are always on. Their links are in the pinned issue **"Oren cloud: phone links + live status"**.
- **Oren inbox (cloud)** — write a new task, idea or bug (Hebrew is fine). It checks the backlog and opens the issue, then answers with its number.
- **Oren ask (cloud)** — ask "what is running now and what needs me?". Read-only. It reads the same pinned issue (status from the PC every 10 min) and GitHub.

How to open them: Claude app on the phone → **Code** → the session named *Oren inbox (cloud)* / *Oren ask (cloud)*. Or tap its link in the pinned issue (GitHub app).
If a session ended, the PC starts a new one by itself and the links in the pinned issue change.

בטלפון (גם כשהמחשב כבוי): באפליקציית Claude, בלשונית Code, פתח את "Oren inbox (cloud)" כדי לכתוב משימה חדשה, או את "Oren ask (cloud)" כדי לשאול מה קורה ומה מחכה לך. הקישורים נמצאים גם בנושא המוצמד "Oren cloud: phone links + live status".
