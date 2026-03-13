/**
 * Base class for all source connectors.
 *
 * Every connector (database, Slack, S3, etc.) extends this and implements
 * the four core methods. The sync runner calls these in order:
 *   1. check()    — validate config/credentials
 *   2. discover() — list available streams
 *   3. read()     — yield records + state checkpoints
 */
class SourceConnector {
  constructor(config, credentials = {}) {
    this.config = config;
    this.credentials = credentials;
  }

  /**
   * Returns a JSON Schema object describing this connector's configuration.
   * Fields marked `secret: true` are stored encrypted.
   */
  static configSchema() {
    throw new Error('configSchema() must be implemented by subclass');
  }

  /**
   * Validate that the configuration and credentials work.
   * @returns {{ ok: boolean, error?: string }}
   */
  async check() {
    throw new Error('check() must be implemented by subclass');
  }

  /**
   * Discover available streams/resources from the source.
   * @returns {Array<{ name: string, schema?: object, supportedSyncModes: string[] }>}
   */
  async discover() {
    throw new Error('discover() must be implemented by subclass');
  }

  /**
   * Async generator that yields records and state checkpoints.
   *
   * Records:     { stream: string, record: object }
   * Checkpoints: { state: object }
   *
   * @param {object|null} state - Opaque state from last completed sync (null on first run)
   * @param {{ streams?: string[], syncType: 'full'|'incremental' }} options
   */
  async *read(state, options) {
    throw new Error('read() must be implemented by subclass');
  }
}

export { SourceConnector };
