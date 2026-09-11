//Stolen from faceit lol
const K_FACTOR = 25;

/**
 * @param {number} playerElo - the player's rating going into this match
 * @param {number} opponentAvgElo - average rating of the opposing team
 *   going into this match (0 if the opposing team is empty)
 * @param {"win" | "loss" | "draw"} outcome - this player's result
 * @returns {number} amount to add to playerElo (negative is a drop)
 */
export function calculateEloDelta(playerElo, opponentAvgElo, outcome) {
  const expectedScore = winChance(playerElo, opponentAvgElo);
  const actualScore = outcome === "win" ? 1 : outcome === "draw" ? 0.5 : 0;

  return Math.round(K_FACTOR * (actualScore - expectedScore));
}

export function winChance(playerElo, opponentAvgElo) {
  return 1 / (1 + Math.pow(10, (opponentAvgElo - playerElo) / 400));
}
