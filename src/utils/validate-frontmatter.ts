/**
 * Frontmatter validation utility.
 *
 * Parses YAML frontmatter between `---` delimiters and validates
 * that required fields are present and non-empty.
 *
 * @module utils/validate-frontmatter
 */

import yaml from 'js-yaml';

export interface FrontmatterValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate YAML frontmatter in a markdown file's content.
 *
 * @param content - Full file content (may or may not have frontmatter)
 * @param requiredFields - Field names that must be present
 * @returns Validation result with errors and warnings
 */
export function validateFrontmatter(
  content: string,
  requiredFields: string[],
): FrontmatterValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for frontmatter block: must start with --- on the first line
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);

  if (!fmMatch) {
    if (requiredFields.length > 0) {
      errors.push('No frontmatter block found (expected --- delimiters at start of file)');
    }
    return { valid: errors.length === 0, errors, warnings };
  }

  // Parse the YAML inside the delimiters
  let parsed: Record<string, unknown>;
  try {
    const raw = yaml.load(fmMatch[1]);
    parsed = (raw !== null && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  } catch (err) {
    errors.push(`Frontmatter YAML parse error: ${err instanceof Error ? err.message : String(err)}`);
    return { valid: false, errors, warnings };
  }

  // Check required fields
  for (const field of requiredFields) {
    if (!(field in parsed)) {
      errors.push(`Missing required frontmatter field: "${field}"`);
    } else {
      const value = parsed[field];
      // Warn on empty/null/blank values
      if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
        warnings.push(`Frontmatter field "${field}" is empty`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
