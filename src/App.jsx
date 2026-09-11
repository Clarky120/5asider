import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { winChance } from "../convex/elo";

/** Fisher-Yates shuffle - returns a new array, does not mutate the input. */
function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const teamElo = (team) => team.reduce((sum, p) => sum + p.elo, 0);

/**
 * Split a pool into two ELO-balanced teams, sized as evenly as possible
 * (the odd player out goes to team A).
 *
 * There's no single "correct" split when several players could go either
 * way, so this tries a batch of random orderings, greedily dropping each
 * player onto whichever team currently has the lower total ELO (once a
 * team hits its target size, the rest go to the other one), then keeps
 * whichever attempt(s) came out most even. Picking randomly among the
 * best attempts keeps redraws from being pure noise while still avoiding
 * the same two teams every time.
 */
function drawTeams(pool, trials = 200) {
  const sizeA = Math.ceil(pool.length / 2);
  const sizeB = pool.length - sizeA;

  let bestDiff = Infinity;
  let bestSplits = [];

  for (let t = 0; t < trials; t++) {
    const a = [];
    const b = [];
    for (const player of shuffle(pool)) {
      if (a.length >= sizeA) b.push(player);
      else if (b.length >= sizeB) a.push(player);
      else if (teamElo(a) <= teamElo(b)) a.push(player);
      else b.push(player);
    }

    const diff = Math.abs(teamElo(a) - teamElo(b));
    if (diff < bestDiff) {
      bestDiff = diff;
      bestSplits = [{ a, b }];
    } else if (diff === bestDiff) {
      bestSplits.push({ a, b });
    }
  }

  return bestSplits[Math.floor(Math.random() * bestSplits.length)];
}

const fullName = (p) => `${p.firstName} ${p.lastName}`;

const avgElo = (players) =>
  players.length
    ? Math.round(players.reduce((sum, p) => sum + p.elo, 0) / players.length)
    : 0;

/** Each side's predicted chance to win this matchup, based on average ELO. */
function matchupChances(teamA, teamB) {
  if (!teamA.length || !teamB.length) return null;
  const avgA = avgElo(teamA);
  const avgB = avgElo(teamB);
  return { a: winChance(avgA, avgB), b: winChance(avgB, avgA) };
}

/** Pull the useful sentence out of a Convex error string. */
function cleanErr(err) {
  const message = String(err?.message ?? err);
  const match = message.match(/Uncaught Error:\s*(.+?)(?:\n|$)/);
  return match ? match[1] : message.replace(/^\[.*?\]\s*/, "");
}

function matchResult(match) {
  if (match.status !== "completed") return { text: "Pending", tone: "amber" };
  if (match.winner === "a") return { text: "Colours won", tone: "emerald" };
  if (match.winner === "b") return { text: "Whites won", tone: "emerald" };
  return { text: "Draw", tone: "slate" };
}

const toneClasses = {
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  slate: "bg-slate-100 text-slate-600 border-slate-200",
};

function Shell({ subtitle, wide, children }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 py-12"
      style={{ background: "linear-gradient(160deg, #f0fdf4 0%, #dcfce7 55%, #ecfdf5 100%)" }}
    >
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-lg"}`}>
        <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl border border-emerald-100 overflow-hidden">
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
            {subtitle && (
              <p
                className="text-sm text-emerald-800/70 mt-3"
                style={{ fontFamily: "Inter" }}
              >
                {subtitle}
              </p>
            )}
          </div>
          <div className="p-8 space-y-7">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [openMatchId, setOpenMatchId] = useState(null);

  return openMatchId ? (
    <MatchView matchId={openMatchId} onBack={() => setOpenMatchId(null)} />
  ) : (
    <PoolView onOpenMatch={setOpenMatchId} />
  );
}

function PoolView({ onOpenMatch }) {
  const players = useQuery(api.players.list);
  const matches = useQuery(api.matches.list);
  const addPlayer = useMutation(api.players.add);
  const removePlayer = useMutation(api.players.remove);
  const createMatch = useMutation(api.matches.create);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState("");
  const [teams, setTeams] = useState(null);
  const [busy, setBusy] = useState(false);
  // Which saved players are in for this match's draw (set of player ids).
  const [picked, setPicked] = useState(() => new Set());
  const [seeded, setSeeded] = useState(false);

  const isLoading = players === undefined;
  const pool = players ?? [];

  // Start with everyone ticked the first time the pool loads.
  useEffect(() => {
    if (seeded || players === undefined) return;
    setPicked(new Set(players.map((p) => p._id)));
    setSeeded(true);
  }, [seeded, players]);

  const lineup = pool.filter((p) => picked.has(p._id));
  const canDraw = lineup.length >= 2;

  const togglePicked = (id) => {
    setPicked((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setTeams(null);
  };

  const pickAll = () => {
    setPicked(new Set(pool.map((p) => p._id)));
    setTeams(null);
  };

  const pickNone = () => {
    setPicked(new Set());
    setTeams(null);
  };

  const handleAdd = async () => {
    setError("");
    try {
      const id = await addPlayer({ firstName, lastName });
      setPicked((current) => new Set(current).add(id));
      setFirstName("");
      setLastName("");
    } catch (err) {
      setError(cleanErr(err));
    }
  };

  const handleRemove = async (id) => {
    await removePlayer({ id });
    setPicked((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setTeams(null);
  };

  const handleDraw = () => setTeams(drawTeams(lineup));

  const chances = teams ? matchupChances(teams.a, teams.b) : null;

  const handleSaveMatch = async () => {
    if (!teams) return;
    setError("");
    setBusy(true);
    try {
      const id = await createMatch({
        teamA: teams.a.map((p) => p._id),
        teamB: teams.b.map((p) => p._id),
      });
      setTeams(null);
      onOpenMatch(id);
    } catch (err) {
      setError(cleanErr(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell
      subtitle={
        isLoading
          ? "Loading players…"
          : pool.length === 0
            ? "Add players to get started"
            : `${lineup.length} of ${pool.length} players picked for the draw`
      }
    >
      {/* Players */}
      <div className="space-y-4">
        <h2 className="text-2xl text-gray-800" style={{ fontFamily: "Playfair Display" }}>
          Players
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
          <p className="text-sm text-red-500" style={{ fontFamily: "Inter" }}>
            {error}
          </p>
        )}

        {pool.length > 0 && (
          <>
            <div className="flex items-center justify-between text-xs" style={{ fontFamily: "Inter" }}>
              <span className="text-gray-500">
                {lineup.length} of {pool.length} playing
              </span>
              <span className="flex gap-3">
                <button
                  className="text-emerald-700 hover:text-emerald-800 disabled:text-gray-300"
                  onClick={pickAll}
                  disabled={lineup.length === pool.length}
                >
                  Select all
                </button>
                <button
                  className="text-emerald-700 hover:text-emerald-800 disabled:text-gray-300"
                  onClick={pickNone}
                  disabled={lineup.length === 0}
                >
                  Clear
                </button>
              </span>
            </div>
            <ul className="space-y-2">
              {pool.map((player) => {
                const isPicked = picked.has(player._id);
                return (
                  <li
                    key={player._id}
                    className={`flex items-center justify-between gap-3 border rounded-xl px-4 py-2.5 transition-colors ${
                      isPicked
                        ? "bg-emerald-50 border-emerald-200"
                        : "bg-gray-50 border-gray-100"
                    }`}
                  >
                    <label className="flex items-center gap-3 min-w-0 cursor-pointer flex-1">
                      <input
                        type="checkbox"
                        checked={isPicked}
                        onChange={() => togglePicked(player._id)}
                        className="w-4 h-4 shrink-0 accent-emerald-600"
                      />
                      <span
                        className={`text-sm truncate ${isPicked ? "text-gray-800" : "text-gray-400"}`}
                        style={{ fontFamily: "Inter" }}
                      >
                        {fullName(player)}
                      </span>
                    </label>
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
                        aria-label={`Remove ${fullName(player)}`}
                      >
                        &times;
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
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

        {canDraw && (
          <p className="text-center text-xs text-gray-400" style={{ fontFamily: "Inter" }}>
            Teams are balanced by ELO, with a bit of randomness each draw.
          </p>
        )}

        {!canDraw && !isLoading && (
          <p className="text-center text-sm text-gray-400" style={{ fontFamily: "Inter" }}>
            {pool.length < 2
              ? "Add at least 2 players to draw teams."
              : "Tick at least 2 players to draw teams."}
          </p>
        )}

        {teams && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <TeamCard title="Colours" players={teams.a} accent="bg-orange-50 border-orange-200 text-orange-900" badge="bg-orange-400" chance={chances?.a} />
              <TeamCard title="Whites" players={teams.b} accent="bg-slate-50 border-slate-200 text-slate-900" badge="bg-slate-400" chance={chances?.b} />
            </div>
            <button
              className="w-full border border-emerald-600 text-emerald-700 hover:bg-emerald-50 active:scale-[0.98] py-3 px-6 rounded-xl font-medium tracking-wide transition-all duration-200 disabled:opacity-50"
              onClick={handleSaveMatch}
              disabled={busy}
              style={{ fontFamily: "Inter" }}
            >
              {busy ? "Saving…" : "Save as new match"}
            </button>
          </>
        )}
      </div>

      {/* Matches */}
      <div className="space-y-3">
        <h2 className="text-2xl text-gray-800" style={{ fontFamily: "Playfair Display" }}>
          Matches
        </h2>
        {matches === undefined ? (
          <p className="text-sm text-gray-400" style={{ fontFamily: "Inter" }}>Loading…</p>
        ) : matches.length === 0 ? (
          <p className="text-sm text-gray-400" style={{ fontFamily: "Inter" }}>
            No matches yet. Draw teams above, then save them as a match.
          </p>
        ) : (
          <ul className="space-y-2">
            {matches.map((match) => {
              const result = matchResult(match);
              return (
                <li key={match._id}>
                  <button
                    onClick={() => onOpenMatch(match._id)}
                    className="w-full flex items-center justify-between gap-3 bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-xl px-4 py-3 transition-colors text-left"
                  >
                    <div>
                      <p className="text-sm text-gray-800" style={{ fontFamily: "Inter" }}>
                        Colours {match.teamA.length}
                        <span className="text-gray-300"> v </span>
                        {match.teamB.length} Whites
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5" style={{ fontFamily: "Inter" }}>
                        {new Date(match._creationTime).toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      className={`text-xs border rounded-full px-2.5 py-1 shrink-0 ${toneClasses[result.tone]}`}
                      style={{ fontFamily: "Inter" }}
                    >
                      {result.text}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-center text-gray-300 text-xs leading-relaxed" style={{ fontFamily: "Inter" }}>
        Coming soon: saved seasons.
      </p>
    </Shell>
  );
}

function TeamCard({ title, players, accent, badge, chance }) {
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
            {fullName(player)}
          </li>
        ))}
        {players.length === 0 && (
          <li className="text-sm opacity-50" style={{ fontFamily: "Inter" }}>
            &ndash;
          </li>
        )}
      </ul>
      <p className="text-xs opacity-60 mt-3" style={{ fontFamily: "Inter" }}>
        Avg ELO {avgElo(players)}
        {chance != null && <> &middot; Win chance {Math.round(chance * 100)}%</>}
      </p>
    </div>
  );
}

function MatchView({ matchId, onBack }) {
  const matches = useQuery(api.matches.list);
  const players = useQuery(api.players.list);
  const updateMatch = useMutation(api.matches.update);
  const removeMatch = useMutation(api.matches.remove);

  const match = matches?.find((m) => m._id === matchId);

  const [teamA, setTeamA] = useState([]);
  const [teamB, setTeamB] = useState([]);
  const [winner, setWinner] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  // Re-seed the editable copy whenever we open a different match.
  useEffect(() => {
    setReady(false);
  }, [matchId]);
  useEffect(() => {
    if (ready || !match) return;
    setTeamA(match.teamA);
    setTeamB(match.teamB);
    setWinner(match.winner ?? null);
    setReady(true);
  }, [ready, match]);

  if (!match) {
    return (
      <Shell wide subtitle="Match">
        <p className="text-sm text-gray-500" style={{ fontFamily: "Inter" }}>
          Loading match…
        </p>
        <button
          onClick={onBack}
          className="text-sm text-emerald-700 hover:text-emerald-800"
          style={{ fontFamily: "Inter" }}
        >
          &larr; Back to players
        </button>
      </Shell>
    );
  }

  const onTeam = new Set([...teamA, ...teamB].map((p) => p._id));
  const bench = (players ?? []).filter((p) => !onTeam.has(p._id));
  const chances = matchupChances(teamA, teamB);

  const dropFrom = (setter) => (id) =>
    setter((list) => list.filter((p) => p._id !== id));
  const pushTo = (setter) => (player) =>
    setter((list) => (list.some((p) => p._id === player._id) ? list : [...list, player]));

  const toA = (player) => {
    dropFrom(setTeamB)(player._id);
    pushTo(setTeamA)(player);
    setSaved(false);
  };
  const toB = (player) => {
    dropFrom(setTeamA)(player._id);
    pushTo(setTeamB)(player);
    setSaved(false);
  };
  const benchPlayer = (player) => {
    dropFrom(setTeamA)(player._id);
    dropFrom(setTeamB)(player._id);
    setSaved(false);
  };

  const chooseWinner = (value) => {
    setWinner((current) => (current === value ? null : value));
    setSaved(false);
  };

  const handleSave = async () => {
    setError("");
    setBusy(true);
    try {
      await updateMatch({
        id: matchId,
        teamA: teamA.map((p) => p._id),
        teamB: teamB.map((p) => p._id),
        winner,
      });
      setSaved(true);
    } catch (err) {
      setError(cleanErr(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this match? Player win/loss counts will be adjusted back.")) {
      return;
    }
    setBusy(true);
    try {
      await removeMatch({ id: matchId });
      onBack();
    } finally {
      setBusy(false);
    }
  };

  const result = matchResult(match);

  return (
    <Shell wide subtitle={`Match on ${new Date(match._creationTime).toLocaleDateString()} — ${result.text}`}>
      <button
        onClick={onBack}
        className="text-sm text-emerald-700 hover:text-emerald-800 -mt-1"
        style={{ fontFamily: "Inter" }}
      >
        &larr; Back to players
      </button>

      {/* Teams */}
      <div className="grid grid-cols-2 gap-4">
        <EditableTeam
          title="Colours"
          badge="bg-orange-400"
          accent="bg-orange-50 border-orange-200 text-orange-900"
          players={teamA}
          moveLabel="Move to Whites"
          onMove={toB}
          onBench={benchPlayer}
          chance={chances?.a}
        />
        <EditableTeam
          title="Whites"
          badge="bg-slate-400"
          accent="bg-slate-50 border-slate-200 text-slate-900"
          players={teamB}
          moveLabel="Move to Colours"
          onMove={toA}
          onBench={benchPlayer}
          chance={chances?.b}
        />
      </div>

      {/* Bench */}
      {bench.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm text-gray-500" style={{ fontFamily: "Playfair Display" }}>
            Not playing
          </h3>
          <ul className="space-y-2">
            {bench.map((player) => (
              <li
                key={player._id}
                className="flex items-center justify-between gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-sm"
                style={{ fontFamily: "Inter" }}
              >
                <span className="truncate text-gray-700">{fullName(player)}</span>
                <span className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => toA(player)}
                    className="text-xs px-2 py-1 rounded-lg bg-orange-100 text-orange-800 hover:bg-orange-200 transition-colors"
                  >
                    + Colours
                  </button>
                  <button
                    onClick={() => toB(player)}
                    className="text-xs px-2 py-1 rounded-lg bg-slate-200 text-slate-800 hover:bg-slate-300 transition-colors"
                  >
                    + Whites
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Result */}
      <div className="space-y-2">
        <h3 className="text-sm text-gray-500" style={{ fontFamily: "Playfair Display" }}>
          Result
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: "a", label: "Colours won" },
            { value: "draw", label: "Draw" },
            { value: "b", label: "Whites won" },
          ].map(({ value, label }) => (
            <button
              key={value}
              onClick={() => chooseWinner(value)}
              className={`py-2.5 px-2 rounded-xl text-sm font-medium border transition-all ${
                winner === value
                  ? "bg-emerald-600 border-emerald-600 text-white"
                  : "bg-white border-gray-200 text-gray-600 hover:border-emerald-300"
              }`}
              style={{ fontFamily: "Inter" }}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400" style={{ fontFamily: "Inter" }}>
          {winner
            ? "Saving records the result and updates win/loss counts."
            : "Leave unset to keep the match pending."}
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-500" style={{ fontFamily: "Inter" }}>
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="space-y-3">
        <button
          onClick={handleSave}
          disabled={busy}
          className="w-full bg-emerald-600 hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-600/30 active:scale-[0.98] text-white py-3 px-6 rounded-xl font-medium tracking-wide transition-all duration-200 disabled:opacity-50"
          style={{ fontFamily: "Inter" }}
        >
          {busy ? "Saving…" : saved ? "Saved ✓" : "Save match"}
        </button>
        <button
          onClick={handleDelete}
          disabled={busy}
          className="w-full text-xs text-gray-400 hover:text-red-500 transition-colors"
          style={{ fontFamily: "Inter" }}
        >
          Delete match
        </button>
      </div>
    </Shell>
  );
}

function EditableTeam({ title, badge, accent, players, moveLabel, onMove, onBench, chance }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-3 h-3 rounded-full ${badge}`}></span>
        <h3 className="text-lg" style={{ fontFamily: "Playfair Display" }}>
          {title}
        </h3>
        <span className="text-xs opacity-60 ml-auto">{players.length}</span>
      </div>
      <ul className="space-y-1.5">
        {players.map((player) => (
          <li
            key={player._id}
            className="flex items-center justify-between gap-2 text-sm"
            style={{ fontFamily: "Inter" }}
          >
            <span className={`truncate ${player.missing ? "italic opacity-50" : ""}`}>
              {fullName(player)}
            </span>
            <span className="flex items-center gap-1 shrink-0">
              <button
                title={moveLabel}
                onClick={() => onMove(player)}
                className="w-6 h-6 rounded-md bg-white/70 hover:bg-white text-xs leading-none"
              >
                &#8646;
              </button>
              <button
                title="Move to bench"
                onClick={() => onBench(player)}
                className="w-6 h-6 rounded-md bg-white/70 hover:bg-white text-sm leading-none text-gray-400 hover:text-red-400"
              >
                &times;
              </button>
            </span>
          </li>
        ))}
        {players.length === 0 && (
          <li className="text-sm opacity-50" style={{ fontFamily: "Inter" }}>
            No players
          </li>
        )}
      </ul>
      <p className="text-xs opacity-60 mt-3" style={{ fontFamily: "Inter" }}>
        Avg ELO {avgElo(players)}
        {chance != null && <> &middot; Win chance {Math.round(chance * 100)}%</>}
      </p>
    </div>
  );
}
