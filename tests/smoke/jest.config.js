/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/specs/**/*.smoke.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/.tmp/'],
  globalSetup: '<rootDir>/harness/global-setup.ts',
  // Every test spawns the 13 MB CLI bundle (~1.5–3 s per process on Windows).
  testTimeout: 120_000,
};
