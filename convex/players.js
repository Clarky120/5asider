import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/** Every new player starts here; the ELO system will adjust it after matches. */
export const BASE_ELO = 800;

function clean(value) {
  return value.trim().replace(/\s+/g, " ");
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const players = await ctx.db.query("players").collect();
    // Highest rated first, then alphabetical for equal ratings.
    return players.sort(
      (a, b) =>
        b.elo - a.elo ||
        a.lastName.localeCompare(b.lastName) ||
        a.firstName.localeCompare(b.firstName),
    );
  },
});

export const add = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
  },
  handler: async (ctx, args) => {
    const firstName = clean(args.firstName);
    const lastName = clean(args.lastName);

    if (!firstName || !lastName) {
      throw new Error("Please enter both a first and last name.");
    }

    const existing = await ctx.db.query("players").collect();
    const duplicate = existing.some(
      (p) =>
        p.firstName.toLowerCase() === firstName.toLowerCase() &&
        p.lastName.toLowerCase() === lastName.toLowerCase(),
    );
    if (duplicate) {
      throw new Error(`${firstName} ${lastName} is already in the pool.`);
    }

    return await ctx.db.insert("players", {
      firstName,
      lastName,
      elo: BASE_ELO,
      wins: 0,
      losses: 0,
    });
  },
});

export const remove = mutation({
  args: {
    id: v.id("players"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
