#!/bin/sh
# Temporary attribution probe: raw diagnostics never leave this container.
ulimit -c 0
profile_dir=$(mktemp -d /tmp/metrics-profile.XXXXXX) || exit 98
trap 'rm -rf "$profile_dir"' 0
printf '[metrics-profile] action-start\n'
{
  node --prof --prof-sampling-interval=10000 --no-log-source-code \
    --logfile="$profile_dir/v8.log" --no-logfile-per-isolate \
    /metrics/source/app/action/index.mjs >"$profile_dir/action.stdout" 2>"$profile_dir/action.stderr"
  action_status=$?
} 2>"$profile_dir/shell.stderr"
printf '[metrics-profile] action-exit=%s\n' "$action_status"
if timeout 60s node --prof-process --preprocess "$profile_dir/v8.log" \
    >"$profile_dir/profile.json" 2>"$profile_dir/processor.stderr"; then
  node /metrics/sanitize-metrics-profile.cjs \
    "$profile_dir/profile.json" /metrics/metrics-module-paths.txt \
    2>"$profile_dir/sanitizer.stderr" || printf '[metrics-profile] unavailable\n'
else
  printf '[metrics-profile] unavailable\n'
fi
exit "$action_status"
