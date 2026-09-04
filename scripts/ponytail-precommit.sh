#!/bin/sh
# ponytail-review pre-commit runner: reviews staged changes for unnecessary
# complexity, headlessly, via `codex exec`.
#
# Env:
#   PONYTAIL_HOOK=0            skip the review entirely
#   PONYTAIL_HOOK_PATTERNS     pathspec patterns, space-separated (default: *.py)
#   PONYTAIL_HOOK_MAX_BYTES    max diff bytes sent to the reviewer (default: 120000)
#   PONYTAIL_HOOK_STRICT=1     ask whether to continue when findings are reported
#   PONYTAIL_DIFF_FILE         review this file instead of `git diff --cached` (testing seam)
#
# Never blocks on tool failure (missing CLI, no auth, network error) — a
# broken reviewer must not brick commits. Bypass any time with --no-verify.
set -u

[ "${PONYTAIL_HOOK:-1}" = "0" ] && exit 0
command -v codex >/dev/null 2>&1 || { echo "ponytail-review: 'codex' not on PATH, skipping."; exit 0; }

TOP="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$TOP" || exit 0

if [ -n "${PONYTAIL_DIFF_FILE:-}" ]; then
  DIFF="$(cat "$PONYTAIL_DIFF_FILE")"
else
  # shellcheck disable=SC2086
  STAGED="$(git diff --cached --name-only --diff-filter=ACM -- ${PONYTAIL_HOOK_PATTERNS:-*.py})"
  [ -z "$STAGED" ] && exit 0
  # shellcheck disable=SC2086
  DIFF="$(git diff --cached -- ${PONYTAIL_HOOK_PATTERNS:-*.py})"
fi
[ -z "$DIFF" ] && exit 0

MAX="${PONYTAIL_HOOK_MAX_BYTES:-120000}"
SIZE="$(printf '%s' "$DIFF" | wc -c)"
if [ "$SIZE" -gt "$MAX" ]; then
  DIFF="$(printf '%s' "$DIFF" | head -c "$MAX")"
  TRUNC_NOTE="(diff truncated from ${SIZE} to ${MAX} bytes)"
else
  TRUNC_NOTE=""
fi

PROMPT="$(cat <<'SKILL_EOF'
You are running ponytail-review as a pre-commit check. Review diffs for
unnecessary complexity. One line per finding: location, what to cut, what
replaces it. The diff's best outcome is getting shorter.

Rules: review ONLY the staged diff below. Do not read other files, do not
edit anything, do not fix anything — list findings only. Output ONLY the
review, no preamble.

Format: `L<line>: <tag> <what>. <replacement>.`, or `<file>:L<line>: ...`
for multi-file diffs.

Tags:
- `delete:` dead code, unused flexibility, speculative feature. Replacement: nothing.
- `stdlib:` hand-rolled thing the standard library ships. Name the function.
- `native:` dependency or code doing what the platform already does. Name the feature.
- `yagni:` abstraction with one implementation, config nobody sets, layer with one caller.
- `shrink:` same logic, fewer lines. Show the shorter form.

Example: `repo.py:L88: yagni: AbstractRepository with one implementation. Inline it until a second one exists.`

End with: `net: -<N> lines possible.`
If there is nothing to cut, say `Lean already. Ship.` and stop.

Boundaries: over-engineering and complexity only. Correctness bugs, security
holes, and performance are out of scope. A single smoke test or
assert-based self-check is the ponytail minimum, not bloat, never flag it.
SKILL_EOF
)"

MSG_FILE="$(mktemp)" || { echo "ponytail-review: cannot create tempfile, skipping."; exit 0; }
trap 'rm -f "$MSG_FILE"' EXIT INT TERM
printf '%s\n\n<staged-diff>%s\n%s\n</staged-diff>' "$PROMPT" "$TRUNC_NOTE" "$DIFF" \
  | codex exec - -s read-only -o "$MSG_FILE" >/dev/null 2>&1
CODE=$?
OUT="$(cat "$MSG_FILE" 2>/dev/null)"
rm -f "$MSG_FILE"
trap - EXIT INT TERM

echo "$OUT"
if [ $CODE -ne 0 ]; then
  echo "ponytail-review: reviewer failed (exit $CODE), not blocking."
  exit 0
fi
if [ "${PONYTAIL_HOOK_STRICT:-0}" = "1" ]; then
  case "$OUT" in
    *"Lean already. Ship."*) exit 0 ;;
    *)
      printf "ponytail-review: findings above. Continue with commit/push? [y/N] " >&2
      ANSWER=""
      if [ -r /dev/tty ]; then
        IFS= read -r ANSWER </dev/tty || ANSWER=""
      else
        echo "ponytail-review: no interactive terminal; commit cancelled." >&2
        exit 1
      fi
      case "$ANSWER" in
        [yY]|[yY][eE][sS]) exit 0 ;;
        *) echo "ponytail-review: commit cancelled." >&2; exit 1 ;;
      esac
      ;;
  esac
fi
exit 0
