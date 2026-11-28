# PC setup

One command on a new or formatted Windows PC (PowerShell 5.1 or 7, from a checkout):

    powershell -File tools\setup\setup.ps1 -Install

- Checks git, gh, node 22, claude, miniforge python, herdr; `-Install` adds the missing ones via winget.
- Makes the work folder, the `bin\python3` shim and an empty `%USERPROFILE%\.oren`; clones the repos, fixes an old `origin`.
- Starts herdr and the control sessions, installs the tasks `Oren recover` and `Oren beatcheck`, prints OK / FIXED / MISSING per step.
- Safe to run again ("nothing to do"); `-DryRun` only prints the plan (CI runs it with mocks, #868); the repo name comes from `repo` in `tools/runner/config.toml` (or `-Repo owner/name`).
- Stays manual: `gh auth login`, the two herdr spaces (`control_space`, `herdr_space`), secrets (checked by `setup.ps1 -Check`, which only tests that the files exist), Claude Code settings and plugins.
