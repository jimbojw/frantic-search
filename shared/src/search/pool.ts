// SPDX-License-Identifier: Apache-2.0

export class BufferPool {
  private free: Uint8Array[] = [];
  private size: number;

  constructor(cardCount: number) {
    this.size = cardCount;
  }

  acquire(): Uint8Array {
    const buf = this.free.pop();
    if (buf) {
      buf.fill(0);
      return buf;
    }
    return new Uint8Array(this.size);
  }

  release(buf: Uint8Array): void {
    this.free.push(buf);
  }
}
