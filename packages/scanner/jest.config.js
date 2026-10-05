/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // tsc also emits compiled *.test.js into dist/ — run the TypeScript sources only.
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
