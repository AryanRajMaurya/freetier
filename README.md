<p align="center">
  <b>Will It Fit?</b><br>
  <i>The free-tier planner for AI services.</i>
</p>

<p align="center">
  <a href="https://github.com/AryanRajMaurya/freetier"><img src="https://img.shields.io/badge/limits-machine--verified-success" alt="Limits verified"></a>
  <a href="https://github.com/AryanRajMaurya/freetier"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License"></a>
  <a href="https://github.com/AryanRajMaurya/freetier"><img src="https://img.shields.io/badge/deploy-GitHub%20Pages-4f46e5" alt="Deploy"></a>
</p>

---

## The idea

A free tier is not a smaller paid tier. It is a **different shape**.

Some work fits that shape beautifully — streaming a model response costs
almost no CPU, because time spent waiting on a socket is not CPU time — and
other work cannot fit at all, no matter how you arrange it.

Most people find this out by hitting a limit in production. This page exists
so you can find out before you ship.

## What it does

- **Every limit that matters**, with the note explaining *why* it matters.
- **A platform decision matrix** — when each one is the right answer.
- **A workload check** — enter your requests per day, CPU per request and
  state, and see which execution tier fits and which one breaks, and on which
  limit.

## The part that makes it different

**The numbers are checked by CI, not remembered.**

`data/limits.json` is asserted in the
[shipfree](https://github.com/AryanRajMaurya/shipfree) repository, where a
harness fetches each platform's own documentation source, parses its limit
tables and compares every asserted value. If a limit changes upstream, that
build fails and prints the upstream text next to the value that is now wrong.

A weekly job does the same check and opens an issue when something moves.

A stale limit is worse than no limit, because it produces a deployment that
looks correct and isn't. This page has no hard-coded numbers at all — it
renders whatever `limits.json` says, and a second workflow keeps that file
in step with `shipfree`.

## Use it as a skill

The same guidance is available as an Agent Skill, so any AI coding agent can
apply it while it writes your deployment:

```bash
/plugin marketplace add AryanRajMaurya/shipfree
/plugin install shipfree@shipfree
```

## Local development

The page is static — no build step, no toolchain, no dependencies. Serve the
directory over HTTP (the page fetches its data, so `file://` will not work):

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Keeping the data honest

```bash
python tools/sync_limits.py --check   # verify against shipfree
python tools/sync_limits.py --write   # update the local copy
```

CI runs the check on every push and weekly, so the page cannot silently fall
behind the verified data.

## License

MIT — see [LICENSE](LICENSE).

Built by [Aryan Raj Maurya](https://github.com/AryanRajMaurya).
