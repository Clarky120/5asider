import { describe, it, expect } from "vitest";
import { calculateEloDelta, winChance } from "./elo.js";

// Mirrors the constant in elo.js - if you retune K_FACTOR there, bump it here
// too so the "delta can never exceed K" guard below stays meaningful.
const K_FACTOR = 25;

const GAMES = 10000;
const SQUAD_SIZE = 12;
const TEAM_SIZE = 5;
const PLAYERS_ARRAY = ["Pete", "Jay", "Matt", "Aspo", "Stobbs", "Sharix", "Djimi", "Steve Finnan", "Josh", "Danny", "Sam", "Plate"]
// Match winner, same shape as matches.js's `winner` field - NOT a per-side
// outcome. (Using "win"/"loss" here directly would silently never equal
// either "a" or "b" and everyone would be scored as a loss - ask me how I
// know.)
const WINNERS = ["a", "b", "draw"];

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const average = (nums) =>
  nums.length ? nums.reduce((sum, n) => sum + n, 0) / nums.length : 0;

/** Apply a result to one player exactly like matches.js's adjustTeam does. */
function applyDelta(player, opponentAvgElo, outcome) {
  const delta = calculateEloDelta(player.elo, opponentAvgElo, outcome);

  // Regression guard for the "returns the new rating instead of a delta"
  // bug: a single match can never move a rating by more than the K-factor.
  expect(Math.abs(delta)).toBeLessThanOrEqual(K_FACTOR);
  // A win can never cost you rating, a loss can never gain you rating.
  if (outcome === "win") expect(delta).toBeGreaterThanOrEqual(0);
  if (outcome === "loss") expect(delta).toBeLessThanOrEqual(0);

  player.elo += delta;
}

describe("ELO simulation", () => {
  it("survives 1000 random matches without the maths breaking down", () => {
    const players = Array.from({ length: SQUAD_SIZE }, (_, i) => ({
      name: PLAYERS_ARRAY[i],
      elo: 800,
    }));

    for (let game = 0; game < GAMES; game++) {
      const lineup = shuffle(players);
      const teamA = lineup.slice(0, TEAM_SIZE);
      const teamB = lineup.slice(TEAM_SIZE, TEAM_SIZE * 2);
      const avgA = average(teamA.map((p) => p.elo));
      const avgB = average(teamB.map((p) => p.elo));

      // Regression guard for the "inverted sign" bug: winChance must stay a
      // valid probability, agree with itself when the sides are swapped,
      // and favour whichever side actually has the higher rating.
      const chanceA = winChance(avgA, avgB);
      const chanceB = winChance(avgB, avgA);
      expect(chanceA).toBeGreaterThan(0);
      expect(chanceA).toBeLessThan(1);
      expect(chanceA + chanceB).toBeCloseTo(1, 6);
      if (avgA !== avgB) {
        expect(chanceA > 0.5).toBe(avgA > avgB);
      }

      // The result itself is pure noise - the point of this test is to see
      // the rating maths hold up over volume, not to model real form.
      const winner = WINNERS[Math.floor(Math.random() * WINNERS.length)];
      const outcomeFor = (side) =>
        winner === "draw" ? "draw" : winner === side ? "win" : "loss";

      for (const p of teamA) applyDelta(p, avgB, outcomeFor("a"));
      for (const p of teamB) applyDelta(p, avgA, outcomeFor("b"));
    }

    const sorted = players.sort((a, b) => a.elo - b.elo);

    for (const p of sorted) {
      expect(Number.isFinite(p.elo)).toBe(true);
      // Wide but real bounds - a broken implementation (e.g. the old bug
      // that added the *new rating* as if it were a delta) blows past
      // these almost immediately, even over a handful of games.
      expect(p.elo).toBeGreaterThan(-1000);
      expect(p.elo).toBeLessThan(5000);
      console.log(p)
    }

    const ratings = players.map((p) => p.elo);

    console.log(
      `After ${GAMES} random games: min=${Math.min(...ratings)} ` +
        `max=${Math.max(...ratings)} avg=${Math.round(average(ratings))}`,
    );
  });
});
