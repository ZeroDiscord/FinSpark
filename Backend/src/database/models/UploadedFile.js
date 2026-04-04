'use strict';

const mongoose = require('mongoose');

const uploadedFileSchema = new mongoose.Schema(
  {
    tenant_id: { type: String, required: true, index: true },
    uploaded_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    source_type: { type: String, enum: ['apk', 'url', 'csv'], required: true, index: true },
    original_name: String,
    storage_path: String,
    source_url: String,
    mime_type: String,
    file_size_bytes: Number,
    checksum_sha256: String,
    status: {
      type: String,
      enum: ['processing', 'complete', 'failed'],
      default: 'processing',
      index: true,
    },
    schema_match_score: Number,
    events_ingested: Number,
    warnings: { type: [String], default: [] },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    completed_at: Date,
  },
  { collection: 'uploaded_files', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

uploadedFileSchema.index({ tenant_id: 1, source_type: 1, created_at: -1 });

module.exports =
  mongoose.models.UploadedFile || mongoose.model('UploadedFile', uploadedFileSchema);
