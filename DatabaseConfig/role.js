const ROLE_PERMISSIONS = {
  ADMIN: {
    customer: ["create", "read", "update", "delete"],
    user: ["create", "read", "update", "delete"],
    invoices: ["create", "read", "update", "delete"], 
    receipts: ["create", "read", "update", "delete"],
    payments: ["create", "read", "update", "delete"],
    sms: ["create", "read", "update", "delete"],
    mpesaTransactions: ["read"],
    trashBagIssuance: ["create", "read", "update"], 
    config: ["create", "read", "update", "delete"],
  },
  customer_manager: {
    customer: ["create", "read"],
    invoices: ["read", "create"],
    trashBagIssuance: ["create", "read", "update"],
    user: ["create", "read"],
    invoices: ["create", "read"], // Note: Duplicate 'invoices' key; last one overrides
    receipts: ["read", "create"],
    payments: ["read","create"],
    sms: ["create", "read"],
    mpesaTransactions: ["read"],
  },
  accountant: {
    receipts: ["create", "read"],
    payments: ["create", "read"],
  },
  collector: {
    customer: ["read", "update_collected"],
    trashBagIssuance: ["create", "read", "update"],
  },
  DEFAULT_ROLE: {},

  // New roles added below
  support_agent: {
    customer: ["read", "update"],
    invoices: ["read"],
    receipts: ["read"],
    payments: ["read"],
    sms: ["create", "read"],
    trashBagIssuance: ["read"],
  },
  billing_clerk: {
    customer: ["read"],
    invoices: ["create", "read", "update"],
    receipts: ["create", "read"],
    payments: ["create", "read"],
    mpesaTransactions: ["read"],
    reports: ["read"],
  },
  collection_supervisor: {
    customer: ["read", "update_collected"],
    collector: ["read", "update"], // Manage collectors
    trashBagIssuance: ["create", "read", "update"],
    sms: ["create", "read"],
    reports: ["read"],
  },
};

module.exports = ROLE_PERMISSIONS;