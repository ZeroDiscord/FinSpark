'use strict';

const CATEGORY_RULES = [
  {
    keywords: ['apply loan', 'loan application', 'document upload', 'upload documents', 'application form', 'bank statement upload'],
    l1_domain: 'Loan Management',
    l2_module: 'Loan Application',
  },
  {
    keywords: ['credit check', 'credit score', 'risk assessment', 'fraud review', 'bureau', 'underwriting'],
    l1_domain: 'Loan Management',
    l2_module: 'Risk Assessment',
  },
  {
    keywords: ['kyc', 'aadhaar', 'pan', 'identity verification', 'document verification', 'otp verification'],
    l1_domain: 'Loan Management',
    l2_module: 'Identity Verification',
  },
  {
    keywords: ['approval dashboard', 'loan approval', 'approval queue', 'decision dashboard'],
    l1_domain: 'Loan Management',
    l2_module: 'Approvals',
  },
  {
    keywords: ['emi', 'repayment', 'payment gateway', 'mandate', 'autopay', 'collections', 'payment'],
    l1_domain: 'Payments',
    l2_module: 'Collections & Payments',
  },
  {
    keywords: ['dashboard', 'reports', 'analytics', 'operations'],
    l1_domain: 'Operations',
    l2_module: 'Dashboard & Reporting',
  },
  {
    keywords: ['login', 'register', 'authentication', 'profile', 'settings'],
    l1_domain: 'User Administration',
    l2_module: 'Identity & Access',
  },
];

function classifyFeature(cleanName) {
  const value = String(cleanName || '').toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((keyword) => value.includes(keyword))) {
      return {
        l1_domain: rule.l1_domain,
        l2_module: rule.l2_module,
        l3_feature: cleanName,
        category_match: true,
      };
    }
  }

  return {
    l1_domain: 'General Operations',
    l2_module: 'General Module',
    l3_feature: cleanName,
    category_match: false,
  };
}

module.exports = { classifyFeature };
