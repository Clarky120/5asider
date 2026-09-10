import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  players: defineTable({
    firstName: v.string(),
    lastName: v.string(),
    elo: v.number(),
    wins: v.number(),
    losses: v.number(),
  }).index("by_name", ["lastName", "firstName"]),
});
