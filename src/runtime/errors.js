export const hex = n => '0x' + (n >>> 0).toString(16).padStart(8, '0');
export class RuntimeFault extends Error {
  constructor(code, message, detail = {}) { super(message); this.name = 'RuntimeFault'; this.code = code; this.detail = detail; }
  toJSON() { return {code: this.code, message: this.message, detail: this.detail}; }
}
export function requireThat(condition, code, message, detail) {
  if (!condition) throw new RuntimeFault(code, message, detail);
}
