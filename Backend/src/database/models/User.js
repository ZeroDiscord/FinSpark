'use strict';

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    tenant_id: { type: String, required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    password_hash: { type: String, required: true },
    full_name: { type: String, trim: true },
    role: {
      type: String,
      enum: ['admin', 'analyst', 'viewer', 'ops'],
      default: 'admin',
      index: true,
    },
    last_login_at: Date,
    auth_provider: { type: String, default: 'local' },
  },
  { collection: 'users', timestamps: true }
);

userSchema.index({ tenant_id: 1, email: 1 }, { unique: true });

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
