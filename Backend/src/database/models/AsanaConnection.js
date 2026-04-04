'use strict';

const mongoose = require('mongoose');

const asanaConnectionSchema = new mongoose.Schema(
  {
    tenant_id: { type: String, required: true, unique: true, index: true },
    connected_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    asana_user_gid: String,
    workspace_gid: String,
    workspace_name: String,
    project_gid: String,
    project_name: String,
    default_column_gid: String,
    default_column_name: String,
    access_token_encrypted: { type: String, required: true },
    refresh_token_encrypted: String,
    token_expires_at: Date,
    connected_at: { type: Date, default: Date.now },
    last_sync_at: Date,
    last_error: String,
  },
  { collection: 'asana_connections', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

asanaConnectionSchema.index({ tenant_id: 1, workspace_gid: 1 });

module.exports =
  mongoose.models.AsanaConnection || mongoose.model('AsanaConnection', asanaConnectionSchema);
