import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

/** Fisher-Yates shuffle - returns a new array, does not mutate the input. */
function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Split a pool of players into two roughly even teams. */
function drawTeams(pool) {
  const shuffled = shuffle(pool);
  const half = Math.ceil(shuffled.length / 2);
  return {
    a: shuffled.slice(0, half),
    b: shuffled.slice(half),
  };
}

export default function App() {
  const players = useQuery(api.players.list);
  const addPlayer = useMutation(api.players.add);
  const removePlayer = useMutation(api.players.remove);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState("");
  const [teams, setTeams] = useState(null);

  const isLoading = players === undefined;
  const pool = players ?? [];
  const canDraw = pool.length >= 2;

  const handleAdd = async () => {
    setError("");
    try {
      await addPlayer({ firstName, lastName });
      setFirstName("");
      setLastName("");
    } catch (err) {
      setError(err.message?.replace(/^\[.*?\]\s*/, "") || "Could not add player.");
    }
  };

  const handleRemove = async (id) => {
    await removePlayer({ id });
    setTeams(null);
  };

  const handleDraw = () => {
    setTeams(drawTeams(pool));
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 py-12"
      style={{ background: "linear-gradient(160deg, #f0fdf4 0%, #dcfce7 55%, #ecfdf5 100%)" }}
    >
      <div className="w-full max-w-lg">
        <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl border border-emerald-100 overflow-hidden">

          {/* Header */}
          <div
            className="text-center px-8 pt-9 pb-7 border-b border-emerald-50"
            style={{ background: "linear-gradient(135deg, #bbf7d0, #86efac)" }}
          >
            <h1
              className="text-4xl text-emerald-900 leading-tight"
              style={{ fontFamily: "Playfair Display" }}
            >
              5-a-side Team Picker
            </h1>
            <p
              className="text-sm text-emerald-800/70 mt-3"
              style={{ fontFamily: "Inter" }}
            >
              {isLoading
                ? "Loading players…"
                : `${pool.length} ${pool.length === 1 ? "player" : "players"} in the pool`}
            </p>
          </div>

          {/* Content */}
          <div className="p-8 space-y-7">

            {/* Add players */}
            <div className="space-y-4">
              <h2
                className="text-2xl text-gray-800"
                style={{ fontFamily: "Playfair Display" }}
              >
                Add players
              </h2>
              <div className="flex gap-2">
                <input
                  className="flex-1 min-w-0 border border-gray-200 px-4 py-3 rounded-xl text-gray-800 placeholder-gray-300 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 transition-all"
                  placeholder="First name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  style={{ fontFamily: "Inter" }}
                />
                <input
                  className="flex-1 min-w-0 border border-gray-200 px-4 py-3 rounded-xl text-gray-800 placeholder-gray-300 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 transition-all"
                  placeholder="Last name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  style={{ fontFamily: "Inter" }}
                />
                <button
                  className="bg-emerald-600 hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-600/30 active:scale-[0.98] text-white px-5 rounded-xl font-medium tracking-wide transition-all duration-200"
                  onClick={handleAdd}
                  style={{ fontFamily: "Inter" }}
                >
                  Add
                </button>
              </div>

              {error && (
                <p
                  className="text-sm text-red-500"
                  style={{ fontFamily: "Inter" }}
                >
                  {error}
                </p>
              )}

              {pool.length > 0 && (
                <ul className="space-y-2">
                  {pool.map((player) => (
                    <li
                      key={player._id}
                      className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5"
                    >
                      <span
                        className="text-gray-800 text-sm truncate"
                        style={{ fontFamily: "Inter" }}
                      >
                        {player.firstName} {player.lastName}
                      </span>
                      <div className="flex items-center gap-3 shrink-0">
                        <span
                          className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5"
                          style={{ fontFamily: "Inter" }}
                          title="ELO rating"
                        >
                          {player.elo}
                        </span>
                        <span
                          className="text-xs text-gray-400"
                          style={{ fontFamily: "Inter" }}
                          title="Wins – losses"
                        >
                          {player.wins}W&nbsp;{player.losses}L
                        </span>
                        <button
                          className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none"
                          onClick={() => handleRemove(player._id)}
                          aria-label={`Remove ${player.firstName} ${player.lastName}`}
                        >
                          &times;
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Decorative divider */}
            <div className="flex items-center gap-3">
              <div
                className="flex-1 h-px"
                style={{ background: "linear-gradient(to right, transparent, #6ee7b7)" }}
              ></div>
              <span className="text-emerald-300 text-xl select-none">&#9917;</span>
              <div
                className="flex-1 h-px"
                style={{ background: "linear-gradient(to left, transparent, #6ee7b7)" }}
              ></div>
            </div>

            {/* Draw teams */}
            <div className="space-y-5">
              <button
                className="w-full bg-emerald-600 hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-600/30 active:scale-[0.98] text-white py-3 px-6 rounded-xl font-medium tracking-wide transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
                onClick={handleDraw}
                disabled={!canDraw}
                style={{ fontFamily: "Inter" }}
              >
                {teams ? "Redraw teams" : "Draw teams"}
              </button>

              {!canDraw && !isLoading && (
                <p
                  className="text-center text-sm text-gray-400"
                  style={{ fontFamily: "Inter" }}
                >
                  Add at least 2 players to draw teams.
                </p>
              )}

              {teams && (
                <div className="grid grid-cols-2 gap-4">
                  <TeamCard
                    title="Colours"
                    players={teams.a}
                    accent="bg-orange-50 border-orange-200 text-orange-900"
                    badge="bg-orange-400"
                  />
                  <TeamCard
                    title="Whites"
                    players={teams.b}
                    accent="bg-slate-50 border-slate-200 text-slate-900"
                    badge="bg-slate-400"
                  />
                </div>
              )}
            </div>

            <p
              className="text-center text-gray-300 text-xs leading-relaxed"
              style={{ fontFamily: "Inter" }}
            >
              Coming soon: ELO changes after matches, match history and saved seasons.
            </p>

          </div>
        </div>
      </div>
    </div>
  );
}

function TeamCard({ title, players, accent, badge }) {
  const avgElo = players.length
    ? Math.round(players.reduce((sum, p) => sum + p.elo, 0) / players.length)
    : 0;

  return (
    <div className={`rounded-2xl border p-4 ${accent}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-3 h-3 rounded-full ${badge}`}></span>
        <h3 className="text-lg" style={{ fontFamily: "Playfair Display" }}>
          {title}
        </h3>
      </div>
      <ul className="space-y-1.5">
        {players.map((player) => (
          <li key={player._id} className="text-sm" style={{ fontFamily: "Inter" }}>
            {player.firstName} {player.lastName}
          </li>
        ))}
        {players.length === 0 && (
          <li className="text-sm opacity-50" style={{ fontFamily: "Inter" }}>
            &ndash;
          </li>
        )}
      </ul>
      <p className="text-xs opacity-60 mt-3" style={{ fontFamily: "Inter" }}>
        Avg ELO {avgElo}
      </p>
    </div>
  );
}
