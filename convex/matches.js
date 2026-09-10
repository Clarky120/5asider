import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const winnerValidator = v.union(
  v.literal("a"),
  v.literal("b"),
  v.literal("draw"),
);

/** Resolve an array of player ids into display objects, tolerating deletions. */
async function resolveTeam(ctx, ids) {
  const docs = await Promise.all(ids.map((id) => ctx.db.get(id)));
  return docs.map((doc, i) =>
    doc
      ? {
          _id: doc._id,
          firstName: doc.firstName,
          lastName: doc.lastName,
          elo: doc.elo,
          wins: doc.wins,
          losses: doc.losses,
        }
      : {
          _id: ids[i],
          firstName: "(removed",
          lastName: "player)",
          elo: 0,
          wins: 0,
          losses: 0,
          missing: true,
        },
  );
}

function validateTeams(teamA, teamB) {
  if (!teamA.length || !teamB.length) {
    throw new Error("Both teams need at least one player.");
  }
  const inB = new Set(teamB);
  if (teamA.some((id) => inB.has(id))) {
    throw new Error("A player can't be on both teams.");
  }
}

/**
 * Add (delta = +1) or reverse (delta = -1) a recorded result against the
 * given rosters. Draws don't move the win/loss counters.
 */
async function applyResult(ctx, teamA, teamB, winner, delta) {
  if (!winner || winner === "draw") return;
  const winners = winner === "a" ? teamA : teamB;
  const losers = winner === "a" ? teamB : teamA;
  for (const id of winners) {
    const p = await ctx.db.get(id);
    if (p) await ctx.db.patch(id, { wins: Math.max(0, p.wins + delta) });
  }
  for (const id of losers) {
    const p = await ctx.db.get(id);
    if (p) await ctx.db.patch(id, { losses: Math.max(0, p.losses + delta) });
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const matches = await ctx.db.query("matches").order("desc").collect();
    return Promise.all(
      matches.map(async (m) => ({
        ...m,
        teamA: await resolveTeam(ctx, m.teamA),
        teamB: await resolveTeam(ctx, m.teamB),
      })),
    );
  },
});

export const create = mutation({
  args: {
    teamA: v.array(v.id("players")),
    teamB: v.array(v.id("players")),
  },
  handler: async (ctx, args) => {
    validateTeams(args.teamA, args.teamB);
    return await ctx.db.insert("matches", {
      teamA: args.teamA,
      teamB: args.teamB,
      status: "pending",
    });
  },
});

/**
 * Edit a match: swap players in/out of either team and/or record the winner.
 * Pass `winner: null` to clear a result and send the match back to pending.
 * Win/loss counters are reversed for the old result and re-applied for the
 * new one, so editing is always safe to repeat.
 */
export const update = mutation({
  args: {
    id: v.id("matches"),
    teamA: v.optional(v.array(v.id("players"))),
    teamB: v.optional(v.array(v.id("players"))),
    winner: v.optional(v.union(winnerValidator, v.null())),
  },
  handler: async (ctx, args) => {
    const match = await ctx.db.get(args.id);
    if (!match) throw new Error("Match not found.");

    const teamA = args.teamA ?? match.teamA;
    const teamB = args.teamB ?? match.teamB;
    validateTeams(teamA, teamB);

    const nextWinner =
      args.winner === undefined ? (match.winner ?? null) : args.winner;

    // Reverse the old result against the old rosters, then apply the new
    // result against the new rosters.
    await applyResult(ctx, match.teamA, match.teamB, match.winner, -1);
    await applyResult(ctx, teamA, teamB, nextWinner, +1);

    await ctx.db.patch(args.id, {
      teamA,
      teamB,
      winner: nextWinner ?? undefined,
      status: nextWinner ? "completed" : "pending",
      playedAt: nextWinner ? (match.playedAt ?? Date.now()) : undefined,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("matches") },
  handler: async (ctx, args) => {
    const match = await ctx.db.get(args.id);
    if (!match) return;
    // Keep player stats consistent when a completed match is deleted.
    await applyResult(ctx, match.teamA, match.teamB, match.winner, -1);
    await ctx.db.delete(args.id);
  },
});
