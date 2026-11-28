# החזרת סודות אחרי מחשב חדש

הסודות אף פעם לא נמצאים ב-repo. אחרי מחשב חדש או פורמט צריך להחזיר אותם ביד.
לבדיקה: `powershell -File tools\setup\setup.ps1 -Check` (מדפיס רק present / missing / empty, אף פעם לא ערך; יוצא 1 אם חסר משהו חובה).
הרשימה כאן ובסקריפט זהה: הטבלה `$SecretItems` ב-`tools/setup/setup.ps1`, שורה לכל פריט.

**לעולם לא מדביקים סוד בצ'אט או ב-issue.**

| פריט | מה זה | איך משיגים שוב | לאן שמים |
|---|---|---|---|
| `app.pem` | מפתח פרטי של ה-GitHub App | הגדרות ה-App ב-GitHub, "Generate a new private key" | `%USERPROFILE%\.oren\app.pem` (המפתח `github_app_key` ב-config) |
| `telegram.env` | טוקן הבוט ומספר הצ'אט | BotFather או הבוט הקיים: טוקן; מספר הצ'אט מהבוט | `%USERPROFILE%\.oren\telegram.env`, שתי שורות: `TELEGRAM_BOT_TOKEN=...` ו-`TELEGRAM_CHAT_ID=...` |
| `diag.key` | מפתח קריאה ליומן המשחק | הסוד של Pages או הסביבה בענן (אותו מפתח קריאה) | `%USERPROFILE%\.oren\diag.key` |
| `private_names.txt` | רשימת השמות שמוסתרים מ-GitHub | הגיבוי הפרטי שלך (לא ב-repo) | `%USERPROFILE%\.oren\private_names.txt` |
| `playlog` | תיקיית יומן המשחק הפרטי (אופציונלי) | הגיבוי הפרטי שלך; בלי גיבוי היא נבנית מחדש מאפס | `%USERPROFILE%\.oren\playlog\` |
| `.env` | טוקן Cloudflare, רק לפריסה ידנית (אופציונלי; ב-CI יש סוד של ה-repo) | לוח הבקרה של Cloudflare, API Tokens, עם ההרשאות שרשומות בראש `oren2/cf/tools/deploy.sh` | `.env` בתיקיית ה-checkout: `CLOUDFLARE_API_TOKEN=...` |
| `gh-login` | התחברות ל-GitHub | `gh auth login` | נשמר על ידי gh |
| `claude-login` | התחברות ל-Claude Code (צריך ל-Remote Control ולסשנים בענן) | `claude /login` | נשמר על ידי claude |
| `app-ids` | המספרים של ה-GitHub App | כבר ב-`tools/runner/config.toml` (`github_app_id`, `github_app_installation_id`), לא סוד | אין מה להעתיק; הבדיקה רק מוודאת שהם שם |
