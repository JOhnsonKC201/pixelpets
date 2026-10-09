# Coding agent reactions

If you use a coding agent, the pet can follow along. It puts a paw to its chin
while the agent is thinking, taps along while it works, flinches at an error
and does a little hop when it's done.

Any agent that can run a shell command on its lifecycle events can drive it
through the bundled helper:

```bash
node agent-hook.js thinking   # paw to chin, "…" bubble
node agent-hook.js editing    # tapping, "working" spinner
node agent-hook.js error      # flinches
node agent-hook.js done       # hop and meow
node agent-hook.js idle       # back to normal
```

The helper writes one word to a status file that the pet watches
(`%TEMP%/pixelcat-agent.state`), so anything that can write that file can drive
the pet too. It reads stdin and answers `{"continue": true}`, which means it
can't block or change what your agent does.

## Setup

Run `npm run hook -- <agent>` (or `node scripts/install-hook.js <agent>`). It
prints the config for your agent with the path to your checkout already filled
in, and says at the top where to paste it.

| Agent | Config | Where it goes |
|-------|--------|---------------|
| Claude Code | [`claude-code/`](claude-code/) | merge into `~/.claude/settings.json` |
| Codex CLI | [`codex/`](codex/) | merge into `~/.codex/config.toml` |
| Cursor | [`cursor/`](cursor/) | copy to `<project>/.cursor/hooks.json` |
| Antigravity | [`antigravity/`](antigravity/) | `.agents/hooks.json` (see the notes in that folder) |
| Kiro | [`kiro/`](kiro/) | add through the Agent Hooks UI, as a "Run Command" hook |

If you copy a config by hand, replace `/ABSOLUTE/PATH/TO/pixelpets/` with the
real path to your checkout. Use forward slashes on Windows as well, for example
`node "C:/Users/you/pixelpets/agent-hook.js" working`. Hooks run from whatever
directory the agent happens to be in, so a relative path won't work.

## Which word to send

The helper accepts natural verbs and maps them to five states.

| You send | The pet |
|----------|---------|
| `thinking` (also `plan`, `start`) | thinking bubble |
| `working` (also `editing`, `writing`, `testing`, `building`, `running`, `tool`) | working spinner |
| `error` (also `failed`, `denied`) | flinches |
| `done` (also `stop`, `complete`) | happy hop |
| `idle` | back to normal |

A reasonable wiring for most agents:

| Agent event | Send |
|-------------|------|
| prompt submitted, session start | `thinking` |
| before or after a tool runs, a file edited | `working` |
| agent stopped, turn complete | `done` |

<sub>These reactions borrow ideas from two other open-source desktop pets, <a href="https://github.com/alvinunreal/openpets">openpets</a> (MIT) and <a href="https://github.com/rullerzhou-afk/clawd-on-desk">clawd-on-desk</a> (AGPL-3.0). No code was taken from either.</sub>
