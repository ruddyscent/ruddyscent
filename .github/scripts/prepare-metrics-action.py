"""Profile the unchanged pinned action without exporting raw diagnostic data."""

from pathlib import Path
import hashlib
import shutil
import subprocess
import sys


source = Path(sys.argv[1])
expected_revision = "65836723097537a54cd8eb90f61839426b4266b6"
revision = subprocess.check_output(
    ["git", "-C", str(source), "rev-parse", "HEAD"], text=True
).strip()
if revision != expected_revision:
    raise SystemExit("Metrics source revision does not match the reviewed version")

entrypoint = source / "source/app/action/index.mjs"
digest = hashlib.sha256(entrypoint.read_bytes()).hexdigest()
scripts = Path(__file__).parent
for name in ["metrics-profile.sh", "sanitize-metrics-profile.cjs"]:
    shutil.copyfile(scripts / name, source / name)

# Keep the original action, runtime and dependencies from the incident image.
(source / "Dockerfile").write_text(
    "FROM ghcr.io/lowlighter/metrics@sha256:"
    "257392f90340f916cb8b815026f259399f6b246d3eb7de38b58bfe7a07bd5b65\n"
    f'RUN echo "{digest}  /metrics/source/app/action/index.mjs" | sha256sum -c -\n'
    "RUN find /metrics/source /metrics/node_modules -type f -print > /metrics/metrics-module-paths.txt\n"
    "COPY metrics-profile.sh sanitize-metrics-profile.cjs /metrics/\n"
    'ENTRYPOINT ["/bin/sh", "/metrics/metrics-profile.sh"]\n'
)

# The composite action creates .env before building; exclude it and all sources.
(source / ".dockerignore").write_text(
    "*\n!Dockerfile\n!metrics-profile.sh\n!sanitize-metrics-profile.cjs\n.env\n.git\n"
)
