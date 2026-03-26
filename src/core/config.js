import dotenv from "dotenv";
dotenv.config();

export const MASTER_KEY = process.env.MASTER_KEY;
// For a multi-tenant bot, individual bot tokens should be in the Master Registry.
// This config will hold global settings only.
