/**
 * ProofView shared JSDoc typedefs.
 *
 * @description
 * This file provides common data shapes used across the server.
 * It contains no runtime logic—only documentation/types for tooling,
 * readability, and scalable refactors later (e.g., swapping storage engines).
 *
 * @module types
 */

/**
 * @typedef {"open"|"click"|"download"|"read_confirm"} EventType
 */

/**
 * @typedef {Object} ProofViewEvent
 * @description A single tracking event captured by the server.
 * @property {number} at - Unix timestamp in milliseconds.
 * @property {EventType} type - Event type (open/click/download/read_confirm).
 * @property {string} messageId - Logical ID for the message/email being tracked.
 * @property {string|null} recipientId - Optional recipient identifier (per-recipient tracking).
 * @property {Object} meta - Additional metadata captured from the request.
 * @property {string} [meta.ua] - User-Agent string (may be proxy).
 * @property {string} [meta.ip] - Remote IP as seen by server (may be proxy).
 * @property {string} [meta.mode] - Image mode: pixel|logo|signature.
 * @property {string} [meta.url] - Redirect target for link events.
 * @property {string} [meta.file] - Filename/key for document events.
 */

/**
 * @typedef {Object} MessageCounters
 * @description Aggregate counters for a messageId.
 * @property {number} opens
 * @property {number} clicks
 * @property {number} downloads
 * @property {number|null} lastOpenAt
 * @property {number|null} lastClickAt
 * @property {number|null} lastDownloadAt
 */

/**
 * @typedef {Object} Db
 * @description Minimal DB shape used by the prototype JSON store.
 * @property {ProofViewEvent[]} events
 * @property {Record<string, MessageCounters>} counters
 */

/**
 * @typedef {Object} TokenPayload
 * @description Data embedded into a signed token.
 * @property {string} messageId
 * @property {string|null} [recipientId]
 * @property {"pixel"|"logo"|"signature"} [mode]
 * @property {string} [url] - For link tracking redirect target.
 * @property {string} [file] - For document tracking filename/key.
 * @property {number} [exp] - Expiry in ms since epoch.
 */

module.exports = {};
