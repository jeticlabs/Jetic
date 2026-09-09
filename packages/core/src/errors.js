"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigError = exports.DiscoveryError = exports.JeticError = void 0;
class JeticError extends Error {
    code;
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = 'JeticError';
    }
}
exports.JeticError = JeticError;
class DiscoveryError extends JeticError {
    constructor(message) {
        super(message, 'DISCOVERY_ERROR');
        this.name = 'DiscoveryError';
    }
}
exports.DiscoveryError = DiscoveryError;
class ConfigError extends JeticError {
    constructor(message) {
        super(message, 'CONFIG_ERROR');
        this.name = 'ConfigError';
    }
}
exports.ConfigError = ConfigError;
//# sourceMappingURL=errors.js.map