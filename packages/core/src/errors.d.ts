export declare class JeticError extends Error {
    code: string;
    constructor(message: string, code: string);
}
export declare class DiscoveryError extends JeticError {
    constructor(message: string);
}
export declare class ConfigError extends JeticError {
    constructor(message: string);
}
//# sourceMappingURL=errors.d.ts.map