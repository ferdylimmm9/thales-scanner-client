import { z } from 'zod'

/**
 * Client-side implementation of the thales-scanner-bridge WebSocket contract
 * (contract v1 — see https://github.com/REPLACE_ME/thales-scanner-bridge/blob/main/CONTRACT.md).
 *
 * Every frame the bridge sends over the localhost WebSocket is one JSON
 * object matching `scannerMessageSchema`. `Contracts.cs` in the bridge repo
 * is the canonical source of truth — this is a TypeScript mirror of it, kept
 * in sync by hand (see that repo's CONTRACT.md for the versioning note).
 */

/** Reader document classes. */
export const documentTypeSchema = z.enum(['passport', 'national_id', 'drivers_license', 'other'])

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected ISO 8601 date (yyyy-MM-dd)')
  .or(z.literal(''))

export const mrzDataSchema = z.object({
  firstName: z.string(),
  middleName: z.string().nullish(),
  lastName: z.string(),
  documentNumber: z.string(),
  documentType: documentTypeSchema.catch('other'),
  dateOfBirth: isoDate,
  gender: z.enum(['M', 'F']).or(z.literal('')),
  nationality: z.string(),
  issuingCountry: z.string(),
  expiryDate: isoDate,
})

export const scanImagesSchema = z.object({
  /** base64 data URLs, e.g. "data:image/jpeg;base64,..." */
  front: z.string().nullish(),
  back: z.string().nullish(),
  portrait: z.string().nullish(),
})

export const chipDataSchema = z.object({
  present: z.boolean(),
  /** ePassport RFID passive-auth result */
  verified: z.boolean(),
})

export const documentScanResultSchema = z.object({
  mrz: mrzDataSchema,
  images: scanImagesSchema,
  chip: chipDataSchema.nullish(),
  /** ISO 8601 timestamp */
  capturedAt: z.string(),
})

/** Reader phases reported by the bridge. */
export const scannerPhaseSchema = z.enum(['idle', 'waiting_for_document', 'reading'])

/** Envelope for every WebSocket frame from the bridge. */
export const scannerMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('status'), status: scannerPhaseSchema }),
  z.object({ type: z.literal('result'), data: documentScanResultSchema }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
])

export type DocumentType = z.infer<typeof documentTypeSchema>
export type MrzData = z.infer<typeof mrzDataSchema>
export type ScanImages = z.infer<typeof scanImagesSchema>
export type ChipData = z.infer<typeof chipDataSchema>
export type DocumentScanResult = z.infer<typeof documentScanResultSchema>
export type ScannerPhase = z.infer<typeof scannerPhaseSchema>
export type ScannerMessage = z.infer<typeof scannerMessageSchema>

// ---------------------------------------------------------------------------
// Static enums — use these instead of magic strings when consuming scanner
// data. `satisfies` ties every value back to the zod schemas above, so a
// contract change that renames a value is a compile error here, not a silent
// mismatch.
// ---------------------------------------------------------------------------

/** Frame envelope discriminator. */
export const SCANNER_MESSAGE_TYPE = {
  STATUS: 'status',
  RESULT: 'result',
  ERROR: 'error',
} as const satisfies Record<string, ScannerMessage['type']>

/** Reader phases reported by `status` frames. */
export const SCANNER_PHASE = {
  IDLE: 'idle',
  WAITING_FOR_DOCUMENT: 'waiting_for_document',
  READING: 'reading',
} as const satisfies Record<string, ScannerPhase>

/** Normalized document classes in `mrz.documentType`. */
export const SCAN_DOCUMENT_TYPE = {
  PASSPORT: 'passport',
  NATIONAL_ID: 'national_id',
  DRIVERS_LICENSE: 'drivers_license',
  OTHER: 'other',
} as const satisfies Record<string, DocumentType>

/** `mrz.gender` values ('' = unspecified/unreadable). */
export const SCAN_GENDER = {
  MALE: 'M',
  FEMALE: 'F',
  UNSPECIFIED: '',
} as const satisfies Record<string, MrzData['gender']>

/**
 * Bridge-originated `error.code` values (SDK codes also pass through verbatim,
 * e.g. ERROR_CAMERA_DRIVER_ERROR — treat unknown codes as SDK pass-through).
 */
export const SCANNER_ERROR_CODE = {
  /** Read finished but produced no usable MRZ — ask the patron to re-seat the document. */
  READ_INCOMPLETE: 'READ_INCOMPLETE',
  /** Reader failed to start for a non-retryable reason; no results will come. */
  INIT_FAILED: 'INIT_FAILED',
  /** Bridge-internal bug processing one data item; the scan may still complete. */
  DATA_HANDLER_FAILED: 'DATA_HANDLER_FAILED',
  /** Scanner unplugged/held by another app at startup — the bridge retries automatically. */
  SCANNER_NOT_CONNECTED: 'SCANNER_NOT_CONNECTED',
  /** Scanner unplugged while running — check the USB connection. */
  READER_DISCONNECTED: 'READER_DISCONNECTED',
} as const
