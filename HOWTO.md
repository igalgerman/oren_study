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
