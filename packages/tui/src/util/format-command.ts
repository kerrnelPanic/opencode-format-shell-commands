import { parse, type Program, type Statement } from "@aliou/sh"

/**
 * Formats a shell command for display by inserting line breaks after
 * top-level separators (`;`, `&&`, `||`, `|`) of commands longer than
 * `threshold` characters. Continuation lines are indented two spaces.
 *
 * Purely additive: only line breaks with indentation are inserted, the
 * original text is never altered, so the result always contains exactly the
 * command that will run. Operators inside quotes, parameter expansion
 * (`${#…}`), command substitution, subshells, or heredocs are not top-level
 * and never split. Commands that fail to parse are returned unchanged.
 */
export function formatShellCommand(command: string, threshold = 60): string {
  if (command.length <= threshold) return command
  let breaks: number[]
  try {
    breaks = [...topLevelBreaks(parse(command).ast, command)]
  } catch {
    return command
  }
  let out = command
  for (let i = breaks.length - 1; i >= 0; i--) out = out.slice(0, breaks[i]) + "\n  " + out.slice(breaks[i])
  return out
}

/** Insertion offsets, generated in ascending order. Nodes without position info never break. */
function* topLevelBreaks(node: Program | Statement, source: string): Generator<number> {
  if (node.type === "Program") {
    let prev: Statement | undefined
    for (const stmt of node.body) {
      // Only `;`-separated statements break; existing newlines already break,
      // and background `&` was never a break point.
      const at = stmt.pos?.offset
      if (prev && at !== undefined) {
        const gap = source.slice(prev.end?.offset ?? at, at)
        if (gap.includes(";") && !gap.includes("\n")) yield at
      }
      prev = stmt
      yield* topLevelBreaks(stmt, source)
    }
    return
  }
  const cmd = node.command
  if (cmd.type === "Logical") {
    yield* topLevelBreaks(cmd.left, source)
    const at = cmd.right.pos?.offset
    if (at !== undefined && !source.slice(cmd.left.end?.offset ?? at, at).includes("\n")) yield at
    yield* topLevelBreaks(cmd.right, source)
  } else if (cmd.type === "Pipeline") {
    let prev: Statement | undefined
    for (const part of cmd.commands) {
      const at = part.pos?.offset
      if (prev && at !== undefined && !source.slice(prev.end?.offset ?? at, at).includes("\n")) yield at
      prev = part
      yield* topLevelBreaks(part, source)
    }
  }
}
