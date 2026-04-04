'use strict';

const mongoose = require('mongoose');

const exportHistorySchema = new mongoose.Schema(
  {
    tenant_id: { type: String, required: true, index: true },
    requested_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    export_type: {
      type: String,
      enum: ['powerbi_csv', 'powerbi_excel', 'feature_csv', 'recommendation_csv'],
      required: true,
      index: true,
    },
    status: { type: String, enum: ['processing', 'ready', 'failed', 'expired'], default: 'processing', index: true },
    filters: { type: mongoose.Schema.Types.Mixed, default: {} },
    file_path: String,
    download_count: { type: Number, default: 0 },
    expires_at: Date,
  },
  { collection: 'export_history', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

exportHistorySchema.index({ tenant_id: 1, created_at: -1 });

module.exports = mongoose.models.ExportHistory || mongoose.model('ExportHistory', exportHistorySchema);
