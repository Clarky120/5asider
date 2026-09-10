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

  matches: defineTable({
    // Team rosters, stored as references into the players table.
    teamA: v.array(v.id("players")),
    teamB: v.array(v.id("players")),
    status: v.union(v.literal("pending"), v.literal("completed")),
    // Only set once a result has been recorded.
    winner: v.optional(
      v.union(v.literal("a"), v.literal("b"), v.literal("draw")),
    ),
    playedAt: v.optional(v.number()),
  }).index("by_status", ["status"]),
});
