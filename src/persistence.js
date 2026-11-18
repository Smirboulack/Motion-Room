/** Serialize writes, coalesce queued edits per project, and retain failed writes for retry. */
export class SaveQueue {
  constructor({ write, journal = () => {}, confirm = () => {}, onStatus = () => {}, delay = 250 }) {
    Object.assign(this, { write, journal, confirm, onStatus, delay });
    this.pending = new Map(); this.failed = new Map(); this.running = null; this.timer = null;
  }

  key(record) { return record.kind + ':' + record.id; }

  enqueue(record, resolve) {
    const copy = structuredClone(record), key = this.key(copy);
    try { this.journal(copy); } catch { /* The primary save still runs when the journal is full. */ }
    const previous = this.pending.get(key);
    this.pending.set(key, { record: copy, resolvers: [...(previous?.resolvers ?? []), ...(resolve ? [resolve] : [])] });
    this.failed.delete(key);
    this.onStatus('saving');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delay);
  }

  save(record) {
    const result = new Promise(resolve => this.enqueue(record, resolve));
    void this.flush();
    return result;
  }

  flush() {
    clearTimeout(this.timer);
    if (this.running) return this.running;
    this.running = this.drain().finally(() => {
      this.running = null;
      if (this.pending.size) void this.flush();
      else clearTimeout(this.timer);
    });
    return this.running;
  }

  async drain() {
    while (this.pending.size) {
      const [key, job] = this.pending.entries().next().value;
      this.pending.delete(key);
      let success = false;
      try {
        await this.write(job.record);
        try { this.confirm(job.record); } catch { /* A confirmed database write remains successful. */ }
        this.failed.delete(key); success = true;
      } catch (error) {
        if (!this.pending.has(key)) this.failed.set(key, { record: job.record, error });
      }
      job.resolvers.forEach(resolve => resolve(success));
    }
    this.onStatus(this.failed.size ? 'error' : 'saved', this.failed.values().next().value?.error);
  }

  retry() {
    for (const { record } of [...this.failed.values()]) this.enqueue(record);
    return this.flush();
  }
}
