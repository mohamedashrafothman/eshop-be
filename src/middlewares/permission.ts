import guard from "express-jwt-permissions";

const permission = guard({ permissionsProperty: "role" });

export default permission;
