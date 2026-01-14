/**
 * Locale Middleware - I18N-008
 *
 * Extracts locale from Accept-Language header and adds it to request object.
 * Supports: en (English), hi (Hindi)
 * Default: en
 */

import type { Request, Response, NextFunction } from "express";
import { isLocaleSupported, type SupportedLocale } from "../services/translationService";

// Extend Express Request to include locale
declare global {
  namespace Express {
    interface Request {
      locale: SupportedLocale;
    }
  }
}

/**
 * Parse Accept-Language header and return the best matching supported locale
 *
 * Examples:
 * - "hi-IN,hi;q=0.9,en;q=0.8" -> "hi"
 * - "en-US,en;q=0.9" -> "en"
 * - "fr,de" -> "en" (default, no match)
 * - undefined -> "en"
 */
function parseAcceptLanguage(header: string | undefined): SupportedLocale {
  if (!header) return "en";

  // Split by comma and process each language tag
  const languages = header.split(",").map((lang) => {
    const parts = lang.trim().split(";");
    const tag = parts[0].trim().toLowerCase();

    // Extract quality value (default 1.0)
    let quality = 1.0;
    for (const part of parts.slice(1)) {
      const match = part.trim().match(/^q=([0-9.]+)$/);
      if (match) {
        quality = parseFloat(match[1]);
        break;
      }
    }

    // Extract primary language code (e.g., "hi-IN" -> "hi")
    const primaryLang = tag.split("-")[0];

    return { lang: primaryLang, quality };
  });

  // Sort by quality (highest first)
  languages.sort((a, b) => b.quality - a.quality);

  // Find first supported locale
  for (const { lang } of languages) {
    if (isLocaleSupported(lang)) {
      return lang as SupportedLocale;
    }
  }

  // Default to English
  return "en";
}

/**
 * Express middleware that extracts locale from Accept-Language header
 */
export function localeMiddleware(req: Request, res: Response, next: NextFunction): void {
  const acceptLanguage = req.headers["accept-language"];
  req.locale = parseAcceptLanguage(acceptLanguage);
  next();
}

/**
 * Get locale from request, with fallback
 */
export function getRequestLocale(req: Request): SupportedLocale {
  return req.locale || "en";
}

export default localeMiddleware;
