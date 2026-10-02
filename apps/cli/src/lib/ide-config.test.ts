import { addVSCodeMcpServer } from './ide-config';

describe('addVSCodeMcpServer', () => {
  it('adds the Jetic server while preserving other servers', () => {
    const result = addVSCodeMcpServer(JSON.stringify({
      servers: { github: { type: 'http', url: 'https://example.test/mcp' } },
      inputs: [{ id: 'token' }],
    }));

    expect(result.changed).toBe(true);
    expect(JSON.parse(result.content)).toEqual({
      servers: {
        github: { type: 'http', url: 'https://example.test/mcp' },
        jetic: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', 'jetic-cli', 'mcp'],
          cwd: '${workspaceFolder}',
        },
      },
      inputs: [{ id: 'token' }],
    });
  });

  it('does not change an already configured entry', () => {
    const initial = addVSCodeMcpServer().content;
    const result = addVSCodeMcpServer(initial);

    expect(result.changed).toBe(false);
    expect(result.content).toBe(initial);
  });

  it('refuses to overwrite a conflicting Jetic entry', () => {
    expect(() => addVSCodeMcpServer(JSON.stringify({
      servers: { jetic: { command: 'node', args: ['custom.js'] } },
    }))).toThrow('A different "jetic" MCP server is already configured');
  });

  it('rejects malformed or incorrectly shaped configuration', () => {
    expect(() => addVSCodeMcpServer('{')).toThrow();
    expect(() => addVSCodeMcpServer(JSON.stringify({ servers: [] }))).toThrow(
      'The "servers" property in VS Code MCP configuration must be an object.'
    );
  });
});