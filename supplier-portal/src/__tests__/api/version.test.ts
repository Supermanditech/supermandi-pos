/**
 * Test for the /api/version route handler
 * Tests the Next.js API route that returns build info
 */

// Mock next/server's NextResponse before importing the route
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => {
      const responseBody = JSON.stringify(body);
      return {
        status: init?.status || 200,
        json: async () => JSON.parse(responseBody),
      };
    },
  },
}));

import { GET } from '../../app/api/version/route';

describe('GET /api/version', () => {
  it('returns a JSON response', async () => {
    const response = await GET();
    expect(response).toBeDefined();
    expect(response.status).toBe(200);
  });

  it('returns portal as supplier', async () => {
    const response = await GET();
    const data = await response.json();
    expect(data.portal).toBe('supplier');
  });

  it('returns commit field', async () => {
    const response = await GET();
    const data = await response.json();
    expect(data).toHaveProperty('commit');
    expect(typeof data.commit).toBe('string');
  });

  it('returns buildTime field', async () => {
    const response = await GET();
    const data = await response.json();
    expect(data).toHaveProperty('buildTime');
    expect(typeof data.buildTime).toBe('string');
  });

  it('returns unknown commit when env var not set', async () => {
    const originalSha = process.env.NEXT_PUBLIC_GIT_SHA;
    const originalBuildSha = process.env.NEXT_PUBLIC_BUILD_SHA;
    delete process.env.NEXT_PUBLIC_GIT_SHA;
    delete process.env.NEXT_PUBLIC_BUILD_SHA;

    const response = await GET();
    const data = await response.json();
    expect(data.commit).toBe('unknown');

    process.env.NEXT_PUBLIC_GIT_SHA = originalSha;
    process.env.NEXT_PUBLIC_BUILD_SHA = originalBuildSha;
  });
});
