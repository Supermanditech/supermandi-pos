/**
 * STG-279: ErrorBoundary i18n — no hardcoded strings
 */

import { readFileSync } from 'fs';
import { join } from 'path';

describe('STG-279: ErrorBoundary i18n', () => {
  const source = readFileSync(
    join(__dirname, '..', '..', 'components', 'ErrorBoundary.tsx'),
    'utf-8'
  );

  it('should import i18n', () => {
    expect(source).toContain('import i18n from');
  });

  it('should use i18n.t for title', () => {
    expect(source).toContain('i18n.t("errorBoundary.title")');
  });

  it('should use i18n.t for message', () => {
    expect(source).toContain('i18n.t("errorBoundary.message")');
  });

  it('should use i18n.t for try again button', () => {
    expect(source).toContain('i18n.t("errorBoundary.tryAgain")');
  });

  it('should not have hardcoded user-facing strings', () => {
    // These specific hardcoded strings should no longer appear as literals
    expect(source).not.toContain('"Something went wrong"');
    expect(source).not.toContain('"Try Again"');
  });
});
