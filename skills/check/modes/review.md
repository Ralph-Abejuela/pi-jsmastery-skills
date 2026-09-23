# /check review (fresh model code review)

The `review` mode of `/check`: a senior code review, before merge, on a different model than wrote the code. Follow it fully.

## What this skill does

Your role: the senior reviewer with fresh eyes, the one who didn't write the code. Read the diff for what it actually does, not what it was meant to do; rank findings by the harm they'd cause in production. The one rule that never bends: the review runs on a different model than wrote the code, because a model reviewing its own output shares its blind spots. Write severity ranked findings.

- Different model, automatically: the review runs in a subagent on a contrasting model picked from pi's scoped models. No API keys, no external setup.
- Read only on code: produces findings, never edits the code under review.
- Want a different provider? For the most independent review, switch your active model (`/model`, or your other AI tool) and run the review there; a recommendation, not machinery. The skill never sends your code anywhere itself.

Owns review findings (`docs/reviews/`). Does not write code, tests, specs, or the `AGENTS.md`/`CLAUDE.md` context files.

## Asks vs acts

Acts, with one deliberate exception: it confirms which model wrote the code before reviewing (a single MCQ, with the detected value selected by default), because the model can't reliably detect itself and a wrong guess silently breaks the cross model guarantee (see Step 1). Everything else (scoping, reviewing, writing findings) it does without asking. It states which model is reviewing so you can still redirect, and pauses if there is nothing to review (clean tree, no branch diff). The confirm is skipped when you pass an explicit `with <model>` override and detection was unambiguous.

Steering: `/check review` (default contrasting model), `/check review with <model-id>` (force a reviewer, e.g. `with openai/gpt-4o`), or `/check review uncommitted` (scope to working tree changes only).

## Artifact ownership

`docs/reviews/<YYYY-MM-DD>-<branch>.md`, created by this skill only. The subagent writes it; the main model relays a summary.

Artifact base: findings live under `docs/` by default. If `docs/` is a published docs site (`docusaurus.config.*`, `.vitepress/`, `mkdocs.yml`, Astro Starlight, or Nextra detected), use `.workflow/` instead (`.workflow/reviews/`). Always follow whichever base, `docs/` or `.workflow/`, already exists (paths here assume `docs/`).

---

## Portability (any OS, any agent)

Any Agent Skills client on macOS, Linux, or Windows:
- Commands: `git` is the only required CLI and behaves the same on every OS; run the `git` lines as shown. Other shell snippets are POSIX reference, not literal scripts: don't assume `find`, `grep`, `sed`, `cat`, `test`/`[ ]`, `ls`, `xargs`, or `for` exist. Use your agent's file tools that work on every OS (read, grep, find, write) for those, and apply branching logic yourself rather than via shell `if`/variables/redirects.
- Bundled files: referenced by paths relative to this skill's folder. The main agent resolves the folder to an absolute path (it already resolves these relative paths, so it knows the folder) and passes absolute file paths in the subagent prompt; it must not read the bundled files' contents into the main context; the subagent reads them by path. Fallback: if your client's subagents cannot read files, read and inline the contents instead.
- No subagent support? The benefit of a second model then needs you to switch your active model (or open the diff in another assistant) and run the review there; otherwise run it inline, noting the reviewer shares the author model's blind spots.

## Execution

### 1. Determine the author model, then pick a DIFFERENT reviewer

Do not rely on introspection or the "You are powered by…" system prompt line (written at session start, stale the moment the user switches with `/model`): the model cannot reliably name itself. Detect from durable pi config, then confirm.

**1a: Enumerate the models pi actually has: the only ids this skill may ever name.** Everything downstream (the detected author, every picker option, the reviewer) must be one of these ids. Gather them in this order:
1. **Scoped set (authoritative when present):** `enabledModels` in the project `.pi/settings.json`, falling back to the global `~/.pi/agent/settings.json`, an array of `provider/modelId` patterns; this is exactly what `/scoped-models` shows and Ctrl+P cycles. A list with entries is the set to use.
2. **Full set (fallback when `enabledModels` is absent/empty):** the ids `pi --list-models` prints, or ask the engineer which models `/model` lists.

Every model id you name in this flow must come out of that enumeration, verbatim: no family shorthand (`sonnet`, `opus`, `haiku`, `fable`), no model you weren't told about, nothing recalled from training. If the enumeration comes up empty, stop and ask the engineer to run `/model` and name the models (or switch to a reviewer manually); never proceed on guessed names.

**1b: Detect the author model (best effort).** The author model is whatever is generating code in this session. On pi, read `defaultProvider` / `defaultModel` from the project `.pi/settings.json`, else the global `~/.pi/agent/settings.json` (saved when the engineer presses Ctrl+S in `/model`); a model id is `provider/modelId` or a bare id that resolves within the enumeration. If the config names a model that isn't in the enumeration, trust the enumeration and ask. On other agents, read their equivalent config. Use the system prompt value only as a weak hint of last resort, possibly stale.

**1c: Confirm the author model (one question).** A wrong guess silently reviews code with the same model and defeats the skill, so confirm before spawning. Preselect the detected model as the recommended option. Present via your agent's interactive option picker, or as plain text options with the same choices if it has none:

```
"Which model wrote this code? I'll review on a different one."
  header: "Author model"
  options:
    - label: "<detected model id from 1a> (detected, recommended)"
      description: "I'll review with <a reviewer candidate from 1a> for a fresh perspective"
    - label: "<another model id from 1a>"
      description: "Review will run on <its contrasting candidate>"
    - label: "<one more model id from 1a>"
      description: "Review will run on <its contrasting candidate>"
```

Skip the question only when detection was unambiguous and the user passed an explicit `with <model>` reviewer override (the override settles which model reviews). Otherwise ask.

**1d: Pick the contrasting reviewer from the enumeration, never by name.** Reviewer candidates are the enumerated ids (1a) minus the author id. There is no mapping table and no family math: the candidates are the ids themselves, one of which is spawned.

- Present the reviewer choice to the engineer as a picker built from the candidate ids and mark one `(recommended)`: prefer a candidate the enumeration itself signals as capable (an id that signals reasoning capability, or a non flash/lite/mini/fast id when the list shows that distinction); with no way to rank, recommend the first candidate after the author in the enumeration order. The engineer can pick any candidate.
- Rules:
  - The reviewer must never be the same model id as the author: the one invariant this skill exists to guarantee. Compare resolved ids, not aliases.
  - Never review on a flash/lite/mini/fast tier id when a stronger candidate exists in the enumeration; review needs strong reasoning.
  - No candidate differs (a scoped set with one model, or a client whose subagents inherit the parent's model, e.g. Antigravity's `invoke_subagent`, which runs on the parent model) → run the review inline on the author's model and say so plainly: a degraded review that shares the author's blind spots, not the guarantee a second model gives. When independence matters, prefer switching your active model (below) over accepting a review on the same model.
  - If the user passed `with <model>`: honor it only if it differs from the author AND is in the enumeration (pi must be able to spawn it). If it names the author's own model, refuse and explain: "That's the model that wrote the code. Reviewing with it shares its blind spots. Using `<a candidate id>` instead."
- State the final choice plainly before spawning, with the real ids from the enumeration:
  > "Author on `<author id>`; running the review on `<reviewer id>`, a second model catches what the author model is blind to."

Want a different provider (GPT, Gemini)? Don't wire up API keys; switch your active model in your AI tool (`/model` on pi, or open the change in your other assistant) and run the review there. The skill recommends this in its closing note for high stakes changes; it never sends your code anywhere itself.

### 2. Scope the change set (cheap, names only, let the subagent read the diff)

Keep the main context lean: gather file names and the base ref only. The subagent runs the actual `git diff` and reads files. Choose a mode (apply the branching logic yourself, not via shell `if`/variables):
- Base branch `BASE`: `git rev-parse --verify main`; on success use `main`, otherwise `master`.
- Current branch `CUR`: `git rev-parse --abbrev-ref HEAD`.
- If `CUR` equals `BASE` (working directly on the base branch) → `MODE=uncommitted`. Gather changed names with `git diff --name-only HEAD` plus untracked files via `git ls-files --others --exclude-standard`.
- Otherwise (feature branch: review everything that differs from the base, the equivalent of a PR) → `MODE=branch`. Resolve the merge base with `git merge-base "$BASE" HEAD`, then gather names with `git diff --name-only <merge-base>` (committed since the branch, plus uncommitted) plus untracked files via `git ls-files --others --exclude-standard`.

If the user passed `uncommitted`, force `MODE=uncommitted` regardless of branch.

Remove duplicates from the file list. Exclude lock files and generated output (`dist/`, `build/`, `.next/`, `coverage/`) from the count, but the subagent still sees the full diff.

If the change set is empty: stop and tell the engineer there's nothing to review (make a change first, or point /check review at a branch). Do not spawn.

### 3. Gather lightweight pointers (do NOT read heavy files here)

Paths and cheap signals only; the subagent reads on demand. Using your file tools: list the 3 most recent spec files under `docs/specs/` (paths only), and resolve the test signal, one of three states, not a yes/no:
- `TESTS = configured`: `test-preferences.json` sets `"tool"` to a framework (a runner is set up). Judge test adequacy normally.
- `TESTS = none-by-design`: `test-preferences.json` has `"tool": null` and a `"gate"` (e.g. `"typecheck+verify"`), or the nearest `AGENTS.md`/governing spec states a "no test runner" convention. Deliberate: the gate is typecheck + `/check verify`, not a suite.
- `TESTS = none-yet`: no `test-preferences.json` at all, and no stated convention. A genuine gap.

Pass to the subagent: project context contents inline (read `AGENTS.md`, canonical, or `CLAUDE.md` as fallback; short), the 3 recent spec paths, the base ref and merge base, and the diff scope. The subagent reads a governing spec's **build spec sections only** (`index.md`: Requirements, Decision, the design section, Consequences), the contract to review against; not `rationale.md` (decision history), unless a specific finding hinges on the reasoning. It runs `git diff` itself and reads the changed files and their tests.

### 4. Spawn the review subagent: on the contrasting reviewer

Resolve this skill's folder to an absolute path (you, the main agent, already resolve these relative paths, so you know the folder) and pass the absolute paths of two bundled files in the spawn prompt: `review-agent-prompt.md` (the spawn template) and `review-guide.md` (the rubric). Do not read their contents into the main context; the subagent's first action is to `Read` `review-agent-prompt.md` by path and follow it. Pass the dynamic values as a labeled list in the spawn prompt (`Placeholder values: ...`). Fallback: if your client's subagents cannot read files, read both files and inline their contents into a filled prompt instead (the old behavior). Then spawn:

- `model`: the reviewer model chosen in Step 1 (different model from the author)
- `description`: `"Review: <N> changed files on <reviewer-model>"`
- Tools: `read`, `grep`, `find`, `bash`, `write`, no `edit` (the reviewer reports, it does not change code)
- `prompt`: the absolute path to `review-agent-prompt.md` (Read it first, then follow it), plus `Placeholder values:`, a labeled list supplying:
  1. `REVIEW_GUIDE`: the absolute path to `review-guide.md` (the subagent reads it as its rubric)
  2. Diff scope: `MODE`, `BASE`, `MERGE_BASE`, and the changed file list with the exact `git diff` command to run
  3. Project context contents (inline), `AGENTS.md` or `CLAUDE.md` fallback, the conventions the review must enforce
  4. Recent spec paths (read if relevant), or inline the relevant spec text if your client gives subagents no file access
  5. The test signal (`configured` / `none-by-design` / `none-yet`) so it judges test adequacy correctly; never nag for tests on a `none-by-design` project
  6. Output path for findings: `docs/reviews/<date>-<branch>.md`

### 5. Relay the result

If the subagent errored or wrote no findings file, report the failure and offer to run it again; don't relay an empty or fabricated review. Otherwise it writes the findings file and returns a compact summary. Relay:

```
## /check review <feature> Â· <Approve | Approve with nits | Changes requested | Blocked>

Blockers (<count>) Â· fix before merge:
- <file:line Â· one line>
Major (<count>):
- <file:line Â· one line>
<count> minor/nits · strengths: <one line> · reviewed by <reviewer-model> over <N> files. Full findings in docs/reviews/<date>-<branch>.md.
```

Lead with the verdict; show every blocker and major (they are the action); collapse minors/nits, strengths, and the reviewer/scope to the one tail line plus the file pointer. Zero blockers and zero majors → just the verdict line and the tail, nothing more.

For a high stakes change (verdict was Blocked or Changes requested, or the change is high/critical severity), append one line:
> "For an independent second opinion from a different provider, switch your model with `/model` (or paste the diff into another assistant) and run /check review again, no API keys needed."

**Tick the scope box (closing gate).** If the reviewed feature has a row in `docs/scope/`, tick its `Review it` box (the review ran; the box marks that, not that it passed) and confirm it in the report: "Scope: ticked `Review it`." No matching row → say so ("no scope row matched `<feature>`, tick it manually or enroll it"). This is the only scope edit review makes; it writes no code, tests, or specs.

This skill is complete after relaying. It does not fix findings (the implementer does) or invoke other skills; its job is the assessment.

---

## Reference files (in this skill's folder; relative paths)

- `review-agent-prompt.md`: lean spawn template; the main model passes its absolute path in the spawn prompt and the subagent reads and follows it
- `review-guide.md`: rubric, severity, findings format. The main model passes its absolute path in the subagent prompt; the subagent reads it (inline its text only if your client's subagents cannot read files).
