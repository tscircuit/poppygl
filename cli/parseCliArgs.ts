export type ParsedArgs = {
  _: string[]
  [key: string]: string | boolean | string[]
}

export function parseCliArgs(args: string[]): ParsedArgs {
  const out: ParsedArgs = { _: [] }
  for (let i = 0; i < args.length; i++) {
    const tok = args[i]!
    if (tok.startsWith("--")) {
      const key = tok.slice(2)
      const next = args[i + 1]
      if (next && !next.startsWith("--")) {
        out[key] = next
        i++
      } else {
        out[key] = true
      }
    } else {
      out._.push(tok)
    }
  }
  return out
}
