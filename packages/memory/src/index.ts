import * as fs from 'fs';
import * as path from 'path';

export interface JeticMemoryOptions {
  scope: string;
}

export interface SetOptions {
  ttl?: number; // Time-to-live in seconds
}

interface StoredValue {
  value: any;
  expiresAt?: number;
}

export class JeticMemory {
  private scope: string;
  private filePath: string;

  constructor(options: JeticMemoryOptions) {
    this.scope = options.scope;
    this.filePath = path.join(process.cwd(), '.jetic', 'memory.json');
  }

  private ensureDirectory() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private readData(): Record<string, Record<string, StoredValue>> {
    if (!fs.existsSync(this.filePath)) {
      return {};
    }
    try {
      const data = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      return {};
    }
  }

  private writeData(data: Record<string, Record<string, StoredValue>>) {
    this.ensureDirectory();
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  private cleanup(data: Record<string, Record<string, StoredValue>>) {
    let changed = false;
    const now = Date.now();
    for (const scope in data) {
      for (const key in data[scope]) {
        const item = data[scope][key];
        if (item.expiresAt && item.expiresAt <= now) {
          delete data[scope][key];
          changed = true;
        }
      }
      if (Object.keys(data[scope]).length === 0) {
        delete data[scope];
        changed = true;
      }
    }
    return changed;
  }

  public async set(key: string, value: any, options?: SetOptions): Promise<void> {
    const data = this.readData();
    this.cleanup(data);

    if (!data[this.scope]) {
      data[this.scope] = {};
    }

    const item: StoredValue = { value };
    if (options?.ttl) {
      item.expiresAt = Date.now() + options.ttl * 1000;
    }

    data[this.scope][key] = item;
    this.writeData(data);
  }

  public async get<T = any>(key: string): Promise<T | null> {
    const data = this.readData();
    const changed = this.cleanup(data);

    if (changed) {
      this.writeData(data);
    }

    if (data[this.scope] && data[this.scope][key]) {
      return data[this.scope][key].value as T;
    }

    return null;
  }

  public async delete(key: string): Promise<void> {
    const data = this.readData();
    this.cleanup(data);

    if (data[this.scope] && data[this.scope][key]) {
      delete data[this.scope][key];
      this.writeData(data);
    }
  }

  public async list(): Promise<Record<string, any>> {
    const data = this.readData();
    const changed = this.cleanup(data);
    if (changed) {
      this.writeData(data);
    }

    const scopeData = data[this.scope] || {};
    const result: Record<string, any> = {};
    for (const key in scopeData) {
      result[key] = scopeData[key].value;
    }
    return result;
  }

  public async clear(): Promise<void> {
    const data = this.readData();
    if (data[this.scope]) {
      delete data[this.scope];
      this.writeData(data);
    }
  }

  public static getAllMemory(): Record<string, any> {
    const filePath = path.join(process.cwd(), '.jetic', 'memory.json');
    if (!fs.existsSync(filePath)) return {};
    try {
      const data: Record<string, Record<string, StoredValue>> = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const result: Record<string, any> = {};
      
      const now = Date.now();
      for (const scope in data) {
        for (const key in data[scope]) {
           const item = data[scope][key];
           if (!item.expiresAt || item.expiresAt > now) {
             if (!result[scope]) result[scope] = {};
             result[scope][key] = item.value;
           }
        }
      }
      return result;
    } catch {
      return {};
    }
  }
  
  public static clearAllMemory(): void {
    const filePath = path.join(process.cwd(), '.jetic', 'memory.json');
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}
