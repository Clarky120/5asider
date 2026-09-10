import { useState, useEffect } from "react";

const STORAGE_KEY = "5asider.players";

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

function loadPlayers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [players, setPlayers] = useState(loadPlayers);
  const [name, setName] = useState("");
  const [teams, setTeams] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(players));
    } catch {
      // ignore write failures (private mode, quota, etc.)
    }
  }, [players]);

  const addPlayer = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const exists = players.some(
      (p) => p.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      setName("");
      return;
    }
    setPlayers((current) => [
      ...current,
      { id: crypto.randomUUID(), name: trimmed },
    ]);
    setName("");
  };

  const removePlayer = (id) => {
    setPlayers((current) => current.filter((p) => p.id !== id));
  };

  const clearAll = () => {
    setPlayers([]);
    setTeams(null);
  };

  const handleDraw = () => {
    setTeams(drawTeams(players));
  };

  const canDraw = players.length >= 2;

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
              {players.length} {players.length === 1 ? "player" : "players"} in the pool
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
                  className="flex-1 border border-gray-200 px-4 py-3 rounded-xl text-gray-800 placeholder-gray-300 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 transition-all"
                  placeholder="ex. Liam Clark"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addPlayer()}
                  style={{ fontFamily: "Inter" }}
                />
                <button
                  className="bg-emerald-600 hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-600/30 active:scale-[0.98] text-white px-5 rounded-xl font-medium tracking-wide transition-all duration-200"
                  onClick={addPlayer}
                  style={{ fontFamily: "Inter" }}
                >
                  Add
                </button>
              </div>

              {players.length > 0 && (
                <ul className="space-y-2">
                  {players.map((player) => (
                    <li
                      key={player.id}
                      className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5"
                    >
                      <span
                        className="text-gray-800 text-sm"
                        style={{ fontFamily: "Inter" }}
                      >
                        {player.name}
                      </span>
                      <button
                        className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none"
                        onClick={() => removePlayer(player.id)}
                        aria-label={`Remove ${player.name}`}
                      >
                        &times;
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {players.length > 0 && (
                <button
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  onClick={clearAll}
                  style={{ fontFamily: "Inter" }}
                >
                  Clear all players
                </button>
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

              {!canDraw && (
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
              Coming soon: ELO ratings, match history and saved seasons.
            </p>

          </div>
        </div>
      </div>
    </div>
  );
}

function TeamCard({ title, players, accent, badge }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-3 h-3 rounded-full ${badge}`}></span>
        <h3
          className="text-lg"
          style={{ fontFamily: "Playfair Display" }}
        >
          {title}
        </h3>
      </div>
      <ul className="space-y-1.5">
        {players.map((player) => (
          <li
            key={player.id}
            className="text-sm"
            style={{ fontFamily: "Inter" }}
          >
            {player.name}
          </li>
        ))}
        {players.length === 0 && (
          <li className="text-sm opacity-50" style={{ fontFamily: "Inter" }}>
            &ndash;
          </li>
        )}
      </ul>
    </div>
  );
}
