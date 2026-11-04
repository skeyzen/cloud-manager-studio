export interface SearchMatch {
  start: number
  end: number
}

export interface OutputSearchResult {
  matches: SearchMatch[]
  error?: string
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function searchOutput(text: string, query: string, useRegex: boolean): OutputSearchResult {
  if (!query) return { matches: [] }

  let pattern: RegExp
  try {
    pattern = new RegExp(useRegex ? query : escapeRegExp(query), 'gi')
  } catch (error) {
    return { matches: [], error: error instanceof Error ? error.message : 'Espressione regolare non valida.' }
  }

  const matches: SearchMatch[] = []
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0
    const end = start + match[0].length
    if (end > start) matches.push({ start, end })
    else pattern.lastIndex += 1
  }
  return { matches }
}