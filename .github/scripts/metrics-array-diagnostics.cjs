// Temporary allocation diagnostic. Never print array values or raw stack traces.
"use strict"

const fs = require("node:fs")
const {isProxy} = require("node:util").types
const NativeError = Error
const modules = new Set(fs.readFileSync("/metrics/metrics-module-paths.txt", "utf8").split("\n"))
const push = Array.prototype.push
const limit = 1024 * 1024
let reporting = false

function emit(message) {
  try {
    fs.writeSync(2, `[metrics-allocation] ${message}\n`)
  }
  catch {
    // Reporting must never enter the action's private-debug error handler.
  }
}

Array.prototype.push = function (...values) {
  if (!reporting && !isProxy(this) && Array.isArray(this) && this.length + values.length > limit) {
    reporting = true
    emit(`oversized-push length=${this.length} added=${values.length} limit=${limit}`)
    // Only fixed application/dependency locations are relevant. Omit function
    // names, messages, arbitrary filenames and all other stack content.
    let frames = 0
    const formatter = Object.getOwnPropertyDescriptor(NativeError, "prepareStackTrace")
    try {
      // Obtain native CallSites, bypassing any custom stack text formatter.
      Object.defineProperty(NativeError, "prepareStackTrace", {
        value: (_, sites) => sites, configurable: true, writable: true,
      })
      for (const site of new NativeError("allocation diagnostic").stack) {
        const filename = site.getFileName()
        if (typeof filename !== "string")
          continue
        const module = filename.replace(/^file:\/\//, "")
        // This exact allowlist was generated from the pinned image at build time.
        if (!modules.has(module))
          continue
        const line = site.getLineNumber(), column = site.getColumnNumber()
        if (!Number.isSafeInteger(line) || !Number.isSafeInteger(column))
          continue
        emit(`module=${module} line=${line} column=${column}`)
        if (++frames === 12)
          break
      }
    }
    catch {
      emit("stack-unavailable")
    }
    finally {
      try {
        if (formatter)
          Object.defineProperty(NativeError, "prepareStackTrace", formatter)
        else
          delete NativeError.prepareStackTrace
      }
      catch {
        // Exit below is mandatory, even if a third party locked the formatter.
      }
    }
    emit(`stopped exit=77 frames=${frames}`)
    // Throwing would enter the action's error handler and expose its debug log.
    process.exit(77)
  }
  return Reflect.apply(push, this, values)
}

emit(`started limit=${limit}`)
setInterval(() => {
  const {rss, heapUsed, heapTotal, external, arrayBuffers} = process.memoryUsage()
  emit(`memory rss=${rss} heapUsed=${heapUsed} heapTotal=${heapTotal} external=${external} arrayBuffers=${arrayBuffers}`)
}, 30000).unref()
