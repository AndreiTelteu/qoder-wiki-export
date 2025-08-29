"use strict";
/**
 * Type definitions for Qoder Wiki Export extension
 * Defines interfaces for Qoder API integration, export functionality, and VSCode extension usage
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExportErrorType = void 0;
var ExportErrorType;
(function (ExportErrorType) {
    ExportErrorType["QODER_NOT_AVAILABLE"] = "qoder_not_available";
    ExportErrorType["AUTHENTICATION_FAILED"] = "authentication_failed";
    ExportErrorType["API_ERROR"] = "api_error";
    ExportErrorType["FILE_SYSTEM_ERROR"] = "file_system_error";
    ExportErrorType["CONVERSION_ERROR"] = "conversion_error";
    ExportErrorType["USER_CANCELLED"] = "user_cancelled";
})(ExportErrorType = exports.ExportErrorType || (exports.ExportErrorType = {}));
//# sourceMappingURL=qoder.js.map