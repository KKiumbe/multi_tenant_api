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
    },
    customer_manager: {
      customers: ["create", "read", "update"],
      invoices: ["read"],
      trashBagIssuance: ["create", "read", "update"],

      user: ["create", "read"],
      invoices: ["create", "read"],
      receipts: ["read"],
      payments: ["read"],
      sms: ["create", "read"],
      mpesaTransactions: ["read"],
    },
    accountant: {
      receipts: ["create", "read"],
      payments: ["create", "read"],
    },
    collector: {
      customers: ["read", "update_collected"],
      trashBagIssuance: ["create", "read", "update"],
    },


    DEFAULT_ROLE: {},
  };
   
  module.exports = ROLE_PERMISSIONS;
  