export class JeticError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'JeticError';
  }
}

export class DiscoveryError extends JeticError {
  constructor(message: string) {
    super(message, 'DISCOVERY_ERROR');
    this.name = 'DiscoveryError';
  }
}

export class ConfigError extends JeticError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR');
    this.name = 'ConfigError';
  }
}
