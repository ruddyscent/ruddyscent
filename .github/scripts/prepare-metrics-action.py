"""Bound the pinned action's private diagnostic buffer before its local build."""

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
original = "      console.debug = message => debugged.push(message)"
replacement = """      // Retain bounded diagnostics without streaming private repository metadata.
      console.debug = message => {
        const text = typeof message === "string" ? message : "[non-string diagnostic omitted]"
        if (debugged.length === 1000)
          debugged.shift()
        debugged.push(Buffer.from(text.slice(0, 2048)).toString())
      }"""
content = entrypoint.read_text()
if content.count(original) != 1:
    raise SystemExit("Metrics diagnostic buffer no longer matches the reviewed source")
entrypoint.write_text(content.replace(original, replacement))

# Preserve the incident image's runtime and dependencies; change only the logger.
# Check the base image's entrypoint against the pinned source before replacing it.
digest = hashlib.sha256(content.encode()).hexdigest()
(source / "Dockerfile").write_text(
    "FROM ghcr.io/lowlighter/metrics@sha256:"
    "257392f90340f916cb8b815026f259399f6b246d3eb7de38b58bfe7a07bd5b65\n"
    f'RUN echo "{digest}  /metrics/source/app/action/index.mjs" | sha256sum -c -\n'
    "COPY source/app/action/index.mjs /metrics/source/app/action/index.mjs\n"
    "COPY metrics-array-diagnostics.cjs /metrics/metrics-array-diagnostics.cjs\n"
    "RUN find /metrics/source /metrics/node_modules -type f -print > /metrics/metrics-module-paths.txt\n"
    'ENTRYPOINT ["node", "--require", "/metrics/metrics-array-diagnostics.cjs", "/metrics/source/app/action/index.mjs"]\n'
)
shutil.copyfile(
    Path(__file__).with_name("metrics-array-diagnostics.cjs"),
    source / "metrics-array-diagnostics.cjs",
)

# The composite action creates .env before building. Send only the patched file.
dockerignore = source / ".dockerignore"
dockerignore.write_text(
    "*\n!Dockerfile\n!source/\nsource/*\n!source/app/\nsource/app/*\n"
    "!source/app/action/\nsource/app/action/*\n"
    "!source/app/action/index.mjs\n!metrics-array-diagnostics.cjs\n.env\n.git\n"
)
