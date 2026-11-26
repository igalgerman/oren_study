---
description: Take the last change off the site (revert the last merge on main, test, redeploy)
---
Show the owner the last merge commit on main (one line) and ask for a yes. On yes: `git revert -m 1 <merge>` on main, build, push (CI runs the game suites on the push and deploys when green; never run them on the PC, #284), reopen the issue with a comment. One line back.
