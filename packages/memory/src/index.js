"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.JeticMemory = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class JeticMemory {
    scope;
    filePath;
    constructor(options) {
        this.scope = options.scope;
        this.filePath = path.join(process.cwd(), '.jetic', 'memory.json');
    }
    ensureDirectory() {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }
    readData() {
        if (!fs.existsSync(this.filePath)) {
            return {};
        }
        try {
            const data = fs.readFileSync(this.filePath, 'utf-8');
            return JSON.parse(data);
        }
        catch (err) {
            return {};
        }
    }
    writeData(data) {
        this.ensureDirectory();
        fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    }
    cleanup(data) {
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
    async set(key, value, options) {
        const data = this.readData();
        this.cleanup(data);
        if (!data[this.scope]) {
            data[this.scope] = {};
        }
        const item = { value };
        if (options?.ttl) {
            item.expiresAt = Date.now() + options.ttl * 1000;
        }
        data[this.scope][key] = item;
        this.writeData(data);
    }
    async get(key) {
        const data = this.readData();
        const changed = this.cleanup(data);
        if (changed) {
            this.writeData(data);
        }
        if (data[this.scope] && data[this.scope][key]) {
            return data[this.scope][key].value;
        }
        return null;
    }
    async delete(key) {
        const data = this.readData();
        this.cleanup(data);
        if (data[this.scope] && data[this.scope][key]) {
            delete data[this.scope][key];
            this.writeData(data);
        }
    }
    async list() {
        const data = this.readData();
        const changed = this.cleanup(data);
        if (changed) {
            this.writeData(data);
        }
        const scopeData = data[this.scope] || {};
        const result = {};
        for (const key in scopeData) {
            result[key] = scopeData[key].value;
        }
        return result;
    }
    async clear() {
        const data = this.readData();
        if (data[this.scope]) {
            delete data[this.scope];
            this.writeData(data);
        }
    }
    static getAllMemory() {
        const filePath = path.join(process.cwd(), '.jetic', 'memory.json');
        if (!fs.existsSync(filePath))
            return {};
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            const result = {};
            const now = Date.now();
            for (const scope in data) {
                for (const key in data[scope]) {
                    const item = data[scope][key];
                    if (!item.expiresAt || item.expiresAt > now) {
                        if (!result[scope])
                            result[scope] = {};
                        result[scope][key] = item.value;
                    }
                }
            }
            return result;
        }
        catch {
            return {};
        }
    }
    static clearAllMemory() {
        const filePath = path.join(process.cwd(), '.jetic', 'memory.json');
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
}
exports.JeticMemory = JeticMemory;
//# sourceMappingURL=index.js.map