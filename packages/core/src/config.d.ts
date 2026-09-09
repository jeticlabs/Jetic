export interface AiConfig {
    provider: string;
    model: string;
    apiKeyEnvVar: string;
}
export interface JeticConfig {
    projectRoot: string;
    jeticDir: string;
    ai?: AiConfig;
}
export declare function loadConfig(cwd?: string): JeticConfig;
export declare function saveConfig(config: JeticConfig): void;
//# sourceMappingURL=config.d.ts.map