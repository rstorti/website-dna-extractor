const Ajv = require('ajv');
const ajv = new Ajv({ allErrors: true, removeAdditional: false });

const payloadSchema = {
  type: "object",
  properties: {
    success: { type: "boolean" },
    isVerified: { type: "boolean" },
    isWaybackFallback: { type: "boolean" },
    youtubeWarning: { type: ["string", "null"] },
    totalMs: { type: "number" },
    stageTimings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          stage: { type: "string" },
          elapsedMs: { type: "number" },
          durationMs: { type: "number" }
        },
        required: ["stage"]
      }
    },
    data: { type: "object" },
    mappedData: { type: ["object", "null"] },
    youtubeData: { type: ["object", "null"] },
    screenshotUrl: { type: ["string", "null"] },
    buttonStyles: { type: "array" },
    ctas: { type: "array" },
    socialMediaLinks: { type: "array" },
    featuredImages: { type: "array" },
    profilePayload: { type: ["object", "null"] }
  },
  required: ["success", "data"]
};

const validatePayload = ajv.compile(payloadSchema);

/**
 * Validates the extraction payload against the required schema.
 *
 * Enforcement policy:
 *   - If the payload is VALID: returns { valid: true }.
 *   - If the payload is INVALID: logs the errors and returns
 *     { valid: false, errors } so the caller can return a 422
 *     to the client instead of sending a malformed response.
 *
 * The caller MUST check the return value and handle invalid payloads.
 * Do NOT silently continue with an invalid payload in production.
 */
function enforcePayloadSchema(payload) {
  const valid = validatePayload(payload);
  if (!valid) {
    const errors = validatePayload.errors;
    console.error('[Schema] Payload validation failed — returning 422 to caller:', JSON.stringify(errors, null, 2));
    return { valid: false, errors };
  }
  return { valid: true };
}

module.exports = { enforcePayloadSchema };
