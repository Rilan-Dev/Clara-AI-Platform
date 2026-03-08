# Document Ingestion Pipeline Enhancements

## 1. Overview
This document details the enhancements for the document ingestion pipeline to support robust, scalable, and error-tolerant processing of various file formats.

## 2. Pipeline Architecture

### 2.1 File Upload & Validation
*   **Secure Upload**: Use presigned URLs (S3/R2) to upload files directly from the client, bypassing the server for large files.
*   **Validation**:
    *   **Type Check**: Verify MIME types (magic numbers) to prevent spoofing.
    *   **Size Limit**: Enforce max file size (e.g., 50MB) based on plan.
    *   **Virus Scan**: Integrate ClamAV or cloud-native scanning (AWS Macie/GuardDuty) for uploaded files.

### 2.2 Parsing Strategy
*   **PDF**:
    *   **Standard**: `pdf-parse` (fast, text extraction).
    *   **Scanned/Complex**: Fallback to OCR (Tesseract or Cloud Vision API) if text density is low.
*   **Office Documents**:
    *   **DOCX**: `mammoth` for clean HTML/Markdown conversion.
    *   **XLSX/CSV**: `xlsx` or `papaparse` to extract structured data. Convert rows to meaningful text chunks (e.g., "Row 1: Column A is X, Column B is Y").
*   **Text/Markdown**: Direct reading.

### 2.3 Intelligent Chunking
*   **Recursive Character Splitting**:
    *   Split by paragraphs (`\n\n`), then sentences (`. `), then words.
    *   **Chunk Size**: ~500-1000 tokens (approx. 2000-4000 chars).
    *   **Overlap**: 10-20% (approx. 200-400 chars) to maintain context across boundaries.
*   **Metadata Extraction**:
    *   **Basic**: Filename, Upload Date, User ID.
    *   **Advanced (LLM-based)**:
        *   **Summary**: Generate a brief summary of the document.
        *   **Keywords**: Extract top 5-10 keywords/entities.
        *   **Title**: Infer a display title if not provided.

### 2.4 Vectorization & Storage
*   **Batch Processing**:
    *   Group chunks into batches (e.g., 10-20) to optimize embedding API calls.
    *   **Rate Limiting**: Implement exponential backoff for API errors (429).
*   **Storage**:
    *   **Qdrant**: Store vectors + payload (text, metadata).
    *   **Versioning**: Add `version` field to metadata. When re-ingesting, increment version and soft-delete old chunks.

### 2.5 Error Handling & Retry
*   **Queue System**: Use a job queue (BullMQ / Redis) for background processing.
*   **Retry Logic**:
    *   **Transient Errors** (Network, API 5xx): Retry 3 times with backoff.
    *   **Permanent Errors** (Corrupt file, Parse error): Mark as "Failed", log error, notify user.
*   **Quarantine**: Move failed files to a "quarantine" bucket/folder for analysis.

## 3. Implementation Plan

### Phase 1: Core Parsing & Chunking
1.  **Refactor**: Create `src/modules/ingest/parsers` and `src/modules/ingest/chunkers`.
2.  **Implement**: `RecursiveCharacterTextSplitter` class.
3.  **Implement**: `PDFParser`, `DocxParser`, `TextParser` implementing a common `DocumentParser` interface.

### Phase 2: Queue & Error Handling
1.  **Setup**: Install `bullmq` and Redis.
2.  **Worker**: Create a background worker to process ingestion jobs.
3.  **Status Tracking**: Create a database table `ingestion_jobs` (id, status, progress, error).

### Phase 3: Cloud Integration
1.  **Storage**: Integrate AWS S3 SDK / R2.
2.  **Upload API**: Create endpoint to generate presigned URLs.
