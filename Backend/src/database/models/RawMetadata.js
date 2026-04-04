'use strict';

const mongoose = require('mongoose');

const rawMetadataSchema = new mongoose.Schema(
  {
    tenant_id: { type: String, required: true, index: true },
    event_ref_id: { type: mongoose.Schema.Types.ObjectId, ref: 'UsageEvent', index: true },
    upload_id: { type: mongoose.Schema.Types.ObjectId, ref: 'UploadedFile', index: true },
    metadata_type: { type: String, required: true, index: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { collection: 'raw_metadata', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

rawMetadataSchema.index({ tenant_id: 1, metadata_type: 1, created_at: -1 });

module.exports = mongoose.models.RawMetadata || mongoose.model('RawMetadata', rawMetadataSchema);
