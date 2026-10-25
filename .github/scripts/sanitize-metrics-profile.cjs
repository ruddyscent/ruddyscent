"use strict"

const fs = require("node:fs")

try {
  if (fs.statSync(process.argv[2]).size > 256 * 1024 * 1024)
    throw new Error()
  const profile = JSON.parse(fs.readFileSync(process.argv[2], "utf8"))
  const allowed = new Set(fs.readFileSync(process.argv[3], "utf8").split("\n"))
  if (!Array.isArray(profile.code) || !Array.isArray(profile.ticks))
    throw new Error()
  const positions = profile.code.map(code => {
    if (code.type !== "JS" || typeof code.name !== "string")
      return null
    const match = code.name.match(/(?:^| )(?:file:\/\/)?(\/metrics\/(?:source|node_modules)\/[^\r\n]*):(\d+):(\d+)$/)
    if (!match || !allowed.has(match[1]))
      return null
    const line = Number(match[2]), column = Number(match[3])
    if (!Number.isSafeInteger(line) || line < 1 || !Number.isSafeInteger(column) || column < 1)
      return null
    return {module: match[1], line, column}
  })
  const ticks = profile.ticks.slice(-200)
  const counts = new Map()
  let attributed = 0
  for (const tick of ticks) {
    if (!Array.isArray(tick.s) || tick.s.length % 2)
      throw new Error()
    for (let index = 0; index < tick.s.length; index += 2) {
      const code = tick.s[index]
      // V8 marks unresolved native addresses with -1; they have no location.
      if (code === -1)
        continue
      if (!Number.isSafeInteger(code) || code < 0 || code >= positions.length)
        throw new Error()
      const position = positions[code]
      if (!position)
        continue
      const key = JSON.stringify(position)
      counts.set(key, (counts.get(key) || 0) + 1)
      attributed++
      break
    }
  }
  // Build the complete sanitized report before writing any output.
  let output = `[metrics-profile] ticks=${ticks.length} attributed=${attributed}\n`
  for (const [key, count] of [...counts].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    const {module, line, column} = JSON.parse(key)
    output += `[metrics-profile] samples=${count} module=${module} line=${line} column=${column}\n`
  }
  fs.writeSync(1, output)
}
catch {
  process.exitCode = 1
}
