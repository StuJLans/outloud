/**
 * Process text for TTS - strip code blocks, clean up markdown, etc.
 */
export function processTextForSpeech(
  text: string,
  options: { excludeCodeBlocks?: boolean; maxLength?: number } = {}
): string {
  let result = text;

  // Remove code blocks if configured
  if (options.excludeCodeBlocks !== false) {
    // Remove fenced code blocks (```...```)
    result = result.replace(/```[\s\S]*?```/g, " code block omitted ");

    // Remove inline code (`...`)
    result = result.replace(/`[^`]+`/g, (match) => {
      // Keep very short inline code (likely variable names worth mentioning)
      const code = match.slice(1, -1);
      return code.length <= 20 ? code : " code ";
    });
  }

  // Clean up markdown formatting
  result = result
    // Headers
    .replace(/^#{1,6}\s+/gm, "")
    // Bold/italic
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    // Links - keep link text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Horizontal rules
    .replace(/^[-*_]{3,}$/gm, "")
    // List markers
    .replace(/^[\s]*[-*+]\s+/gm, "")
    .replace(/^[\s]*\d+\.\s+/gm, "")
    // Multiple newlines to single
    .replace(/\n{3,}/g, "\n\n")
    // Multiple spaces to single
    .replace(/  +/g, " ")
    .trim();

  // Truncate if too long
  if (options.maxLength && result.length > options.maxLength) {
    result = result.slice(0, options.maxLength);
    // Try to end at a sentence
    const lastPeriod = result.lastIndexOf(".");
    if (lastPeriod > options.maxLength * 0.8) {
      result = result.slice(0, lastPeriod + 1);
    }
    result += " ... Response truncated for speech.";
  }

  return result;
}

/**
 * Extract the last assistant text from a Claude Code transcript
 *
 * We want the FINAL text the user sees, which means:
 * 1. Find all assistant messages
 * 2. Collect all text blocks from them
 * 3. Return only the LAST text block (the final thing said)
 */
export function extractLastAssistantMessage(
  transcriptLines: string[]
): string | null {
  // Collect all assistant text blocks in order
  const allTextBlocks: string[] = [];

  for (const line of transcriptLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const entry = JSON.parse(trimmed);

      // Look for assistant messages with content
      if (entry.type === "assistant" && entry.message?.content) {
        // Extract text blocks from this message
        for (const block of entry.message.content) {
          if (block.type === "text" && block.text) {
            allTextBlocks.push(block.text);
          }
        }
      }
    } catch {
      // Skip invalid JSON lines
      continue;
    }
  }

  // Return the last text block (the final message to the user)
  if (allTextBlocks.length > 0) {
    return allTextBlocks[allTextBlocks.length - 1];
  }

  return null;
}
