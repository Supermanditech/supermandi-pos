/**
 * STG-189: No HTML entities (&amp;, &lt;, etc.) in JSX Text components
 */

import { readFileSync } from 'fs';
import { join } from 'path';

describe('STG-189: No HTML entities in MenuScreen', () => {
  const source = readFileSync(join(__dirname, '..', '..', 'screens', 'MenuScreen.tsx'), 'utf-8');

  it('should not contain &amp; in Text components', () => {
    expect(source).not.toContain('&amp;');
  });

  it('should not contain &lt; in Text components', () => {
    expect(source).not.toContain('&lt;');
  });

  it('should not contain &gt; in Text components', () => {
    expect(source).not.toContain('&gt;');
  });

  it('should have "Help & Support" with literal ampersand', () => {
    expect(source).toContain('Help & Support');
  });
});
