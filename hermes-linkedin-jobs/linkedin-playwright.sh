#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PYTHON_EXE="$REPO_DIR/codex-hermes-api/.venv/Scripts/python.exe"

to_windows_path() {
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$1"
  elif command -v wslpath >/dev/null 2>&1; then
    wslpath -w "$1"
  else
    printf '%s\n' "$1"
  fi
}

is_wsl() {
  [[ -r /proc/version ]] && grep -qiE 'microsoft|wsl' /proc/version
}

if [[ ! -x "$PYTHON_EXE" ]]; then
  PYTHON_EXE="python"
fi

export HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
export AGENT_BROWSER_PROFILE="${AGENT_BROWSER_PROFILE:-C:\\Users\\admin\\.hermes\\browser-profiles\\linkedin-default}"

case "${1:-}" in
  open-login|status|open-jobs|jobs|draft)
    ;;
  *)
    echo "Usage:"
    echo "  ./hermes-linkedin-jobs/linkedin-playwright.sh status"
    echo "  ./hermes-linkedin-jobs/linkedin-playwright.sh jobs"
    echo "  ./hermes-linkedin-jobs/linkedin-playwright.sh draft --job-title \"Payroll Manager\""
    exit 2
    ;;
esac

SCRIPT_FOR_PY="$SCRIPT_DIR/linkedin_job_post.py"
if [[ "$PYTHON_EXE" == *.exe ]]; then
  SCRIPT_FOR_PY="$(to_windows_path "$SCRIPT_FOR_PY")"
fi

PROFILE_NAME="${LINKEDIN_PROFILE_NAME:-default}"

if is_wsl && [[ "$PYTHON_EXE" == *.exe ]]; then
  echo "This runner must be launched with Git Bash on Windows, not WSL bash."
  echo "Use: \"C:\\Program Files\\Git\\bin\\bash.exe\" ./hermes-linkedin-jobs/linkedin-playwright.sh $*"
  exit 2
fi

if [[ "${1:-}" == "jobs" ]]; then
  set -- open-jobs "${@:2}"
fi

exec "$PYTHON_EXE" "$SCRIPT_FOR_PY" \
  --profile-name "$PROFILE_NAME" \
  "$@"
