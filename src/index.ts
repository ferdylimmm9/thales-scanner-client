export {
  useDocumentScanner,
  type UseDocumentScannerOptions,
  type UseDocumentScannerResult,
  type ScannerConnection,
  type ScannerProtocolError,
} from './useDocumentScanner'

export {
  // schemas
  documentTypeSchema,
  mrzDataSchema,
  scanImagesSchema,
  chipDataSchema,
  documentScanResultSchema,
  scannerPhaseSchema,
  scannerMessageSchema,
  // types
  type DocumentType,
  type MrzData,
  type ScanImages,
  type ChipData,
  type DocumentScanResult,
  type ScannerPhase,
  type ScannerMessage,
  // enums
  SCANNER_MESSAGE_TYPE,
  SCANNER_PHASE,
  SCAN_DOCUMENT_TYPE,
  SCAN_GENDER,
  SCANNER_ERROR_CODE,
} from './types'
