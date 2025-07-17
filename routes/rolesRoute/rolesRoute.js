const express = require("express");
const checkAccess = require("../../middleware/roleVerify.js");
const { getAllUsers, assignRole, deleteUser, stripRoles, editUserRole, updateUserDetails, fetchUser, removeRoles } = require("../../controller/userManagement/userManagement.js");
const verifyToken = require("../../middleware/verifyToken.js");
const { checkTenantStatus, requireTenantStatus } = require("../../middleware/requireTenantStatus.js");
const { TenantStatus } = require("@prisma/client");
const { getTenantStatus } = require("../../controller/tenants/tenantupdate.js");


const router = express.Router();

// View all users (Super Admin only)
router.get("/users", verifyToken, checkAccess("user", "read"), getAllUsers);

router.get("/users/:userId", verifyToken, checkAccess("user", "read"), fetchUser);


// // Assign roles to a user
router.post("/assign-roles", verifyToken,checkTenantStatus,                          // 2️⃣ loads req.tenantStatus from DB
  requireTenantStatus([TenantStatus.ACTIVE]), checkAccess("user", "update"), assignRole);
router.put("/remove-roles", verifyToken, checkAccess("user", "update"), removeRoles);

router.put("/update-user", verifyToken, updateUserDetails);

// // Delete a user
router.delete("/user/:userId",verifyToken, checkAccess("user", "delete"), deleteUser);

// // Strip all roles from a user
router.post("/user/strip-roles",verifyToken, checkAccess("users", "update"), stripRoles);



module.exports = router;
