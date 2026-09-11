import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { calculateEloDelta } from "./elo";

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

function average(nums) {
  return nums.length ? nums.reduce((sum, n) => sum + n, 0) / nums.length : 0;
}

/** Move every player on one team by one outcome's worth of stats + rating. */
async function adjustTeam(ctx, docs, outcome, opponentAvgElo, delta) {
  for (const p of docs) {
    if (!p) continue;
    const patch = {};
    if (outcome === "win") patch.wins = Math.max(0, p.wins + delta);
    if (outcome === "loss") patch.losses = Math.max(0, p.losses + delta);
    const eloDelta = calculateEloDelta(p.elo, opponentAvgElo, outcome);
    if (eloDelta) patch.elo = p.elo + eloDelta * delta;
    if (Object.keys(patch).length) await ctx.db.patch(p._id, patch);
  }
}

/**
 * Add (delta = +1) or reverse (delta = -1) a recorded result against the
 * given rosters. Draws don't move the win/loss counters, but still feed
 * into the ELO placeholder above. Both teams' ratings are snapshotted
 * before either is patched, so ELO deltas are computed from pre-match
 * ratings on both sides rather than one team seeing the other's post-match
 * rating.
 */
async function applyResult(ctx, teamA, teamB, winner, delta) {
  if (!winner) return;

  const [docsA, docsB] = await Promise.all([
    Promise.all(teamA.map((id) => ctx.db.get(id))),
    Promise.all(teamB.map((id) => ctx.db.get(id))),
  ]);
  const avgEloA = average(docsA.filter(Boolean).map((p) => p.elo));
  const avgEloB = average(docsB.filter(Boolean).map((p) => p.elo));

  const outcomeFor = (side) =>
    winner === "draw" ? "draw" : winner === side ? "win" : "loss";

  await adjustTeam(ctx, docsA, outcomeFor("a"), avgEloB, delta);
  await adjustTeam(ctx, docsB, outcomeFor("b"), avgEloA, delta);
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
