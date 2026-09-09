export interface JeticMemoryOptions {
    scope: string;
}
export interface SetOptions {
    ttl?: number;
}
export declare class JeticMemory {
    private scope;
    private filePath;
    constructor(options: JeticMemoryOptions);
    private ensureDirectory;
    private readData;
    private writeData;
    private cleanup;
    set(key: string, value: any, options?: SetOptions): Promise<void>;
    get<T = any>(key: string): Promise<T | null>;
    delete(key: string): Promise<void>;
    list(): Promise<Record<string, any>>;
    clear(): Promise<void>;
    static getAllMemory(): Record<string, any>;
    static clearAllMemory(): void;
}
//# sourceMappingURL=index.d.ts.map