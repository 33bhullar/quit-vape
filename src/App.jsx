import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import {
  GAME_CATALOG,
  GamesScreen,
  GameRunner,
  getLevelFromXp,
  getXpForNextLevel,
} from "./Games";
import NicScreen from "./Nic";
import "./App.css";

const XP_THRESHOLDS = [
  0,
  100,
  250,
  450,
  700,
  1000,
  1350,
  1750,
  2200,
  2700,
];

const triggerOptions = [
  "Stress",
  "Boredom",
  "Driving",
  "After eating",
  "After waking up",
  "Social",
  "Studying / Work",
  "Alcohol",
  "Other",
];

function getDateKey(dateInput = new Date()) {
  const date = new Date(dateInput);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDaysSince(dateString) {
  if (!dateString) return 0;

  return Math.max(
    0,
    Math.floor(
      (Date.now() - new Date(dateString).getTime()) / 86400000
    )
  );
}

function getChallengeStreak(logs) {
  const sorted = [...logs].sort(
    (a, b) =>
      new Date(b.created_at) - new Date(a.created_at)
  );

  let streak = 0;

  for (const log of sorted) {
    if (log.outcome === "beat") {
      streak += 1;
    } else {
      break;
    }
  }

  return streak;
}

function getMaxConsecutiveWins(logs) {
  const sorted = [...logs].sort(
    (a, b) =>
      new Date(a.created_at) - new Date(b.created_at)
  );

  let current = 0;
  let best = 0;

  for (const log of sorted) {
    if (log.outcome === "beat") {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }

  return best;
}

function hasComeback(logs) {
  const sorted = [...logs].sort(
    (a, b) =>
      new Date(a.created_at) - new Date(b.created_at)
  );

  let sawLapse = false;

  for (const log of sorted) {
    if (log.outcome === "vaped") {
      sawLapse = true;
    }

    if (sawLapse && log.outcome === "beat") {
      return true;
    }
  }

  return false;
}

function calculateSuccessRate(logs) {
  if (!logs.length) return 0;

  return Math.round(
    (logs.filter((log) => log.outcome === "beat").length /
      logs.length) *
      100
  );
}

function getTimePeriod(dateString) {
  const hour = new Date(dateString).getHours();

  if (hour >= 5 && hour < 12) return "Morning";
  if (hour >= 12 && hour < 17) return "Afternoon";
  if (hour >= 17 && hour < 22) return "Evening";

  return "Late night";
}

function getCurrentLevelStart(level) {
  return XP_THRESHOLDS[level - 1] ?? 0;
}

function App() {
  const [session, setSession] = useState(null);

  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);

  const [authMode, setAuthMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [profile, setProfile] = useState(null);
  const [logs, setLogs] = useState([]);
  const [dailyBonuses, setDailyBonuses] = useState([]);

  const [gameRows, setGameRows] = useState([]);
  const [gameSessions, setGameSessions] = useState([]);
  const [cravingSessions, setCravingSessions] = useState([]);

  const [leaderboards, setLeaderboards] = useState([]);
  const [leaderboardGame, setLeaderboardGame] = useState("pattern_tap");
  const [leaderboardNameDraft, setLeaderboardNameDraft] = useState("");
  const [leaderboardMessage, setLeaderboardMessage] = useState("");
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  const [screen, setScreen] = useState("home");

  const [trigger, setTrigger] = useState("");
  const [cravingBefore, setCravingBefore] = useState(null);
  const [cravingAfter, setCravingAfter] = useState(null);

  const [selectedGame, setSelectedGame] = useState(null);
  const [gameOrigin, setGameOrigin] = useState(null);

  const [activeCravingSessionId, setActiveCravingSessionId] =
    useState(null);

  const [gameResult, setGameResult] = useState(null);
  const [rewardSummary, setRewardSummary] = useState(null);

  const [processingGame, setProcessingGame] = useState(false);

  const [supportActivity, setSupportActivity] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        setAuthLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user?.id) {
      setProfile(null);
      return;
    }

    loadUserData(session.user.id);
  }, [session]);

  async function loadUserData(userId) {
    setDataLoading(true);
    setErrorMessage("");

    try {
      let { data: profileData, error: profileError } =
        await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .maybeSingle();

      if (profileError) throw profileError;

      if (!profileData) {
        const { data, error } = await supabase
          .from("profiles")
          .insert({
            id: userId,
            xp: 0,
            coins: 0,
            streak_start: new Date().toISOString(),
            longest_streak_days: 0,
          })
          .select()
          .single();

        if (error) throw error;

        profileData = data;
      }

      const [
        logResponse,
        bonusResponse,
        gamesResponse,
        sessionsResponse,
        cravingsResponse,
      ] = await Promise.all([
        supabase
          .from("craving_logs")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: true }),

        supabase
          .from("daily_bonuses")
          .select("*")
          .eq("user_id", userId),

        supabase
          .from("games")
          .select("*")
          .eq("active", true),

        supabase
          .from("game_sessions")
          .select("*")
          .eq("user_id", userId),

        supabase
          .from("craving_sessions")
          .select("*")
          .eq("user_id", userId),
      ]);

      if (logResponse.error) throw logResponse.error;
      if (bonusResponse.error) throw bonusResponse.error;
      if (gamesResponse.error) throw gamesResponse.error;
      if (sessionsResponse.error) throw sessionsResponse.error;
      if (cravingsResponse.error) throw cravingsResponse.error;

      setProfile(profileData);

      setLeaderboardNameDraft(
        profileData.leaderboard_name || ""
      );

      setLogs(logResponse.data || []);
      setDailyBonuses(bonusResponse.data || []);
      setGameRows(gamesResponse.data || []);
      setGameSessions(sessionsResponse.data || []);
      setCravingSessions(cravingsResponse.data || []);
    } catch (error) {
      console.error(error);

      setErrorMessage(
        error.message || "Could not load your data."
      );
    } finally {
      setDataLoading(false);
    }
  }

  async function handleAuth(event) {
    event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");

    if (password.length < 6) {
      setErrorMessage(
        "Password must be at least 6 characters."
      );
      return;
    }

    if (authMode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setSuccessMessage("Account created.");
      return;
    }

    const { error } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (error) {
      setErrorMessage(error.message);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setScreen("home");
  }

  async function loadLeaderboards() {
    if (!session?.user?.id) return;

    setLeaderboardLoading(true);

    try {
      const { data, error } = await supabase.rpc(
        "get_game_leaderboards"
      );

      if (error) throw error;

      setLeaderboards(data || []);
    } catch (error) {
      console.error(error);

      setLeaderboardMessage(
        error.message ||
          "Could not load leaderboards."
      );
    } finally {
      setLeaderboardLoading(false);
    }
  }

  async function saveLeaderboardName() {
    const cleaned =
      leaderboardNameDraft.trim();

    setLeaderboardMessage("");

    if (cleaned.length < 2) {
      setLeaderboardMessage(
        "Nickname must be at least 2 characters."
      );

      return;
    }

    try {
      const { data, error } =
        await supabase.rpc(
          "set_leaderboard_name",
          {
            p_name: cleaned,
          }
        );

      if (error) throw error;

      setLeaderboardNameDraft(data);

      setProfile((current) => ({
        ...current,
        leaderboard_name: data,
      }));

      setLeaderboardMessage(
        "Leaderboard nickname saved."
      );

      await loadLeaderboards();
    } catch (error) {
      console.error(error);

      setLeaderboardMessage(
        error.message ||
          "Could not save nickname."
      );
    }
  }

  useEffect(() => {
    if (
      screen === "progress" &&
      session?.user?.id
    ) {
      loadLeaderboards();
    }
  }, [screen, session?.user?.id, gameSessions]);

  const xp = profile?.xp || 0;
  const coins = profile?.coins || 0;

  const level = getLevelFromXp(xp);

  const levelStart = getCurrentLevelStart(level);
  const nextLevelXp = getXpForNextLevel(level);

  const levelProgress =
    nextLevelXp <= levelStart
      ? 100
      : Math.min(
          100,
          Math.round(
            ((xp - levelStart) /
              (nextLevelXp - levelStart)) *
              100
          )
        );

  const currentStreak = getDaysSince(
    profile?.streak_start
  );

  const longestStreak = Math.max(
    profile?.longest_streak_days || 0,
    currentStreak
  );

  const cravingsBeaten = logs.filter(
    (log) => log.outcome === "beat"
  ).length;

  const challengeStreak = getChallengeStreak(logs);
  const maxChallengeStreak =
    getMaxConsecutiveWins(logs);

  const totalResolved = logs.length;

  const successRate =
    totalResolved === 0
      ? 0
      : Math.round(
          (cravingsBeaten / totalResolved) * 100
        );

  const stressWins = logs.filter(
    (log) =>
      log.outcome === "beat" &&
      log.trigger === "Stress"
  ).length;

  const gamesPlayed = gameSessions.filter(
    (game) => game.completed
  ).length;

  const cravingsInterrupted =
    cravingSessions.filter(
      (item) => item.outcome === "passed"
    ).length;

  const highScores = useMemo(() => {
    const result = {};

    gameSessions.forEach((sessionItem) => {
      const row = gameRows.find(
        (game) => game.id === sessionItem.game_id
      );

      if (!row) return;

      result[row.game_key] = Math.max(
        result[row.game_key] || 0,
        sessionItem.score || 0
      );
    });

    return result;
  }, [gameSessions, gameRows]);

  const unlockedGames = GAME_CATALOG.filter(
    (game) => level >= game.unlockLevel
  );

  const recommendedGame =
    unlockedGames.length > 0
      ? unlockedGames[
          Math.floor(
            Math.random() * unlockedGames.length
          )
        ]
      : GAME_CATALOG[0];

  const todayKey = getDateKey();

  const cravingsBeatenToday = logs.filter(
    (log) =>
      log.outcome === "beat" &&
      getDateKey(log.created_at) === todayKey
  ).length;

  const dailyChallengeCompleted =
    dailyBonuses.some(
      (bonus) => bonus.bonus_date === todayKey
    );

  const topTrigger = useMemo(() => {
    if (!logs.length) {
      return {
        name: "No data yet",
        percentage: 0,
      };
    }

    const counts = {};

    logs.forEach((log) => {
      counts[log.trigger] =
        (counts[log.trigger] || 0) + 1;
    });

    const [name, count] = Object.entries(counts).sort(
      (a, b) => b[1] - a[1]
    )[0];

    return {
      name,
      percentage: Math.round(
        (count / logs.length) * 100
      ),
    };
  }, [logs]);

  const weeklyData = useMemo(() => {
    const days = [];

    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date();

      date.setDate(date.getDate() - i);

      const key = getDateKey(date);

      const count = logs.filter(
        (log) =>
          log.outcome === "beat" &&
          getDateKey(log.created_at) === key
      ).length;

      days.push({
        key,
        label: date.toLocaleDateString("en-US", {
          weekday: "short",
        })[0],
        count,
      });
    }

    return days;
  }, [logs]);

  const weeklyTotal = weeklyData.reduce(
    (sum, day) => sum + day.count,
    0
  );

  const maxWeeklyCount = Math.max(
    ...weeklyData.map((day) => day.count),
    1
  );

  const trendData = useMemo(() => {
    if (!logs.length) {
      return {
        peakTime: "No data yet",
        bestChallenge: "No data yet",
        bestChallengeRate: 0,
        hardestTrigger: "No data yet",
        hardestTriggerRate: 0,
        strongestTrigger: "No data yet",
        strongestTriggerRate: 0,
        thisWeekCount: 0,
        previousWeekCount: 0,
        insight:
          "Complete a few craving interventions and your trends will appear here.",
      };
    }

    const timeCounts = {
      Morning: 0,
      Afternoon: 0,
      Evening: 0,
      "Late night": 0,
    };

    logs.forEach((log) => {
      timeCounts[
        getTimePeriod(log.created_at)
      ] += 1;
    });

    const peakTime = Object.entries(
      timeCounts
    ).sort((a, b) => b[1] - a[1])[0][0];

    const challengeStats = {};

    logs.forEach((log) => {
      if (!log.challenge) return;

      if (!challengeStats[log.challenge]) {
        challengeStats[log.challenge] = {
          attempts: 0,
          wins: 0,
        };
      }

      challengeStats[log.challenge].attempts += 1;

      if (log.outcome === "beat") {
        challengeStats[log.challenge].wins += 1;
      }
    });

    const challengeEntries = Object.entries(
      challengeStats
    )
      .map(([name, stats]) => ({
        name,
        attempts: stats.attempts,
        rate: Math.round(
          (stats.wins / stats.attempts) * 100
        ),
      }))
      .sort((a, b) => b.rate - a.rate);

    const triggerStats = {};

    logs.forEach((log) => {
      if (!triggerStats[log.trigger]) {
        triggerStats[log.trigger] = {
          attempts: 0,
          wins: 0,
        };
      }

      triggerStats[log.trigger].attempts += 1;

      if (log.outcome === "beat") {
        triggerStats[log.trigger].wins += 1;
      }
    });

    const triggerEntries = Object.entries(
      triggerStats
    ).map(([name, stats]) => ({
      name,
      attempts: stats.attempts,
      rate: Math.round(
        (stats.wins / stats.attempts) * 100
      ),
    }));

    const hardest = [...triggerEntries].sort(
      (a, b) => a.rate - b.rate
    )[0];

    const strongest = [...triggerEntries].sort(
      (a, b) => b.rate - a.rate
    )[0];

    const now = new Date();

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(
      sevenDaysAgo.getDate() - 7
    );

    const fourteenDaysAgo = new Date(now);
    fourteenDaysAgo.setDate(
      fourteenDaysAgo.getDate() - 14
    );

    const thisWeekCount = logs.filter(
      (log) =>
        new Date(log.created_at) >= sevenDaysAgo
    ).length;

    const previousWeekCount = logs.filter(
      (log) => {
        const date = new Date(log.created_at);

        return (
          date >= fourteenDaysAgo &&
          date < sevenDaysAgo
        );
      }
    ).length;

    let insight =
      `Your cravings happen most often during the ${peakTime.toLowerCase()}.`;

    if (challengeEntries[0]) {
      insight += ` ${challengeEntries[0].name} has worked best so far.`;
    }

    return {
      peakTime,
      bestChallenge:
        challengeEntries[0]?.name ||
        "No data yet",

      bestChallengeRate:
        challengeEntries[0]?.rate || 0,

      hardestTrigger:
        hardest?.name || "No data yet",

      hardestTriggerRate:
        hardest?.rate || 0,

      strongestTrigger:
        strongest?.name || "No data yet",

      strongestTriggerRate:
        strongest?.rate || 0,

      thisWeekCount,
      previousWeekCount,
      insight,
    };
  }, [logs]);

  const achievements = [
    {
      id: "first",
      icon: "⚡",
      name: "First Victory",
      description: "Beat your first craving.",
      unlocked: cravingsBeaten >= 1,
      progress: Math.min(cravingsBeaten, 1),
      goal: 1,
    },
    {
      id: "hat",
      icon: "🔥",
      name: "Hat Trick",
      description: "Beat 3 cravings in a row.",
      unlocked: maxChallengeStreak >= 3,
      progress: Math.min(
        maxChallengeStreak,
        3
      ),
      goal: 3,
    },
    {
      id: "crusher",
      icon: "💥",
      name: "Craving Crusher",
      description: "Beat 10 cravings.",
      unlocked: cravingsBeaten >= 10,
      progress: Math.min(
        cravingsBeaten,
        10
      ),
      goal: 10,
    },
    {
      id: "three",
      icon: "🔥",
      name: "Three Days Strong",
      description:
        "Reach a 3-day vape-free streak.",
      unlocked: longestStreak >= 3,
      progress: Math.min(longestStreak, 3),
      goal: 3,
    },
    {
      id: "week",
      icon: "🏆",
      name: "One Week",
      description:
        "Reach a 7-day vape-free streak.",
      unlocked: longestStreak >= 7,
      progress: Math.min(longestStreak, 7),
      goal: 7,
    },
    {
      id: "comeback",
      icon: "↗",
      name: "Comeback",
      description:
        "Beat a craving after a lapse.",
      unlocked: hasComeback(logs),
      progress: hasComeback(logs) ? 1 : 0,
      goal: 1,
    },
    {
      id: "stress",
      icon: "🛡",
      name: "Pressure Proof",
      description:
        "Beat 5 stress-triggered cravings.",
      unlocked: stressWins >= 5,
      progress: Math.min(stressWins, 5),
      goal: 5,
    },
    {
      id: "games10",
      icon: "🎮",
      name: "Game On",
      description: "Complete 10 minigames.",
      unlocked: gamesPlayed >= 10,
      progress: Math.min(gamesPlayed, 10),
      goal: 10,
    },
    {
      id: "level5",
      icon: "⭐",
      name: "Level 5",
      description: "Reach Level 5.",
      unlocked: level >= 5,
      progress: Math.min(level, 5),
      goal: 5,
    },
  ];

  const unlockedAchievements =
    achievements.filter(
      (achievement) => achievement.unlocked
    ).length;

  function openCravingMode() {
    resetCravingFlow();
    setScreen("cravingIntro");
  }

  function resetCravingFlow() {
    setTrigger("");
    setCravingBefore(null);
    setCravingAfter(null);
    setSelectedGame(null);
    setGameOrigin(null);
    setActiveCravingSessionId(null);
    setGameResult(null);
    setRewardSummary(null);
    setSupportActivity(null);
  }

  function goHome() {
    resetCravingFlow();
    setScreen("home");
  }

  async function ensureCravingSession() {
    if (activeCravingSessionId) {
      return activeCravingSessionId;
    }

    const { data, error } = await supabase
      .from("craving_sessions")
      .insert({
        user_id: session.user.id,
        trigger,
        craving_before: cravingBefore,
      })
      .select()
      .single();

    if (error) throw error;

    setCravingSessions((current) => [
      ...current,
      data,
    ]);

    setActiveCravingSessionId(data.id);

    return data.id;
  }

  async function startCravingGame(game) {
    try {
      setErrorMessage("");

      await ensureCravingSession();

      setSelectedGame(game);
      setGameOrigin("craving");
      setScreen("gameRunner");
    } catch (error) {
      setErrorMessage(error.message);
    }
  }

  function startStandaloneGame(game) {
    setSelectedGame(game);
    setGameOrigin("games");
    setGameResult(null);
    setRewardSummary(null);
    setScreen("gameRunner");
  }

  async function insertUniqueTransaction(
    table,
    values
  ) {
    const { error } = await supabase
      .from(table)
      .insert(values);

    if (!error) return true;

    if (error.code === "23505") {
      return false;
    }

    throw error;
  }

  async function addRewards({
    xpAmount = 0,
    coinAmount = 0,
    reason,
    gameSessionId = null,
    cravingSessionId = null,
    uniqueBase,
  }) {
    let xpAdded = 0;
    let coinsAdded = 0;

    if (coinAmount > 0) {
      const added =
        await insertUniqueTransaction(
          "coin_transactions",
          {
            user_id: session.user.id,
            amount: coinAmount,
            reason,
            game_session_id: gameSessionId,
            craving_session_id:
              cravingSessionId,
            unique_key: `${uniqueBase}:coins`,
          }
        );

      if (added) coinsAdded = coinAmount;
    }

    if (xpAmount > 0) {
      const added =
        await insertUniqueTransaction(
          "xp_transactions",
          {
            user_id: session.user.id,
            amount: xpAmount,
            reason,
            game_session_id: gameSessionId,
            craving_session_id:
              cravingSessionId,
            unique_key: `${uniqueBase}:xp`,
          }
        );

      if (added) xpAdded = xpAmount;
    }

    if (xpAdded || coinsAdded) {
      const newXp = (profile.xp || 0) + xpAdded;

      const newCoins =
        (profile.coins || 0) + coinsAdded;

      const { error } = await supabase
        .from("profiles")
        .update({
          xp: newXp,
          coins: newCoins,
        })
        .eq("id", session.user.id);

      if (error) throw error;

      setProfile((current) => ({
        ...current,
        xp: newXp,
        coins: newCoins,
      }));
    }

    return {
      xpAdded,
      coinsAdded,
    };
  }

  async function handleGameComplete(result) {
    if (processingGame) return;

    setProcessingGame(true);
    setErrorMessage("");

    try {
      const databaseGame = gameRows.find(
        (row) =>
          row.game_key === result.game.key
      );

      if (!databaseGame) {
        throw new Error(
          "Game could not be found in the database."
        );
      }

      const oldBest =
        highScores[result.game.key] || 0;

      const highScoreBonus =
        result.score > oldBest ? 5 : 0;

      const cravingSessionId =
        gameOrigin === "craving"
          ? activeCravingSessionId
          : null;

      const { data: sessionRow, error } =
        await supabase
          .from("game_sessions")
          .insert({
            user_id: session.user.id,
            game_id: databaseGame.id,
            craving_session_id:
              cravingSessionId,
            score: result.score,
            duration_seconds:
              result.durationSeconds,
            completed: true,
            reward_claimed: false,
          })
          .select()
          .single();

      if (error) throw error;

      const gameCoins =
        10 + highScoreBonus;

      const gameXp = 10;

      const awarded = await addRewards({
        xpAmount: gameXp,
        coinAmount: gameCoins,
        reason:
          highScoreBonus > 0
            ? "Completed game + new high score"
            : "Completed game",
        gameSessionId: sessionRow.id,
        cravingSessionId,
        uniqueBase: `game:${sessionRow.id}:completion`,
      });

      const { data: updatedSession } =
        await supabase
          .from("game_sessions")
          .update({
            xp_earned: awarded.xpAdded,
            coins_earned:
              awarded.coinsAdded,
            reward_claimed: true,
          })
          .eq("id", sessionRow.id)
          .select()
          .single();

      if (
        gameOrigin === "craving" &&
        cravingSessionId
      ) {
        await supabase
          .from("craving_sessions")
          .update({
            game_session_id:
              sessionRow.id,
          })
          .eq("id", cravingSessionId);
      }

      setGameSessions((current) => [
        ...current,
        updatedSession || sessionRow,
      ]);

      setGameResult({
        ...result,
        sessionId: sessionRow.id,
        xpEarned: awarded.xpAdded,
        coinsEarned:
          awarded.coinsAdded,
        highScoreBonus:
          highScoreBonus > 0,
      });

      if (gameOrigin === "craving") {
        setScreen("cravingAfter");
      } else {
        setRewardSummary({
          xp: awarded.xpAdded,
          coins: awarded.coinsAdded,
        });

        setScreen("gameComplete");
      }
    } catch (error) {
      console.error(error);
      setErrorMessage(error.message);
    } finally {
      setProcessingGame(false);
    }
  }

  async function resolveCraving(
    outcome
  ) {
    try {
      setErrorMessage("");

      const cravingSessionId =
        await ensureCravingSession();

      const passed = outcome === "passed";

      const { error } = await supabase
        .from("craving_sessions")
        .update({
          craving_after: cravingAfter,
          outcome,
          vaping_reported:
            outcome === "vaped",
          completed_at:
            new Date().toISOString(),
          reward_claimed: true,
        })
        .eq("id", cravingSessionId);

      if (error) throw error;

      let outcomeXp = 0;
      let outcomeCoins = 0;

      if (gameResult) {
        outcomeXp = 15;

        outcomeCoins =
          outcome === "passed"
            ? 35
            : outcome === "vaped"
              ? 15
              : 0;
      }

      let awarded = {
        xpAdded: 0,
        coinsAdded: 0,
      };

      if (
        outcomeXp > 0 ||
        outcomeCoins > 0
      ) {
        awarded = await addRewards({
          xpAmount: outcomeXp,
          coinAmount: outcomeCoins,
          reason:
            outcome === "passed"
              ? "Craving interrupted"
              : "Completed craving intervention",
          gameSessionId:
            gameResult?.sessionId || null,
          cravingSessionId,
          uniqueBase: `craving:${cravingSessionId}:${outcome}`,
        });
      }

      const createdAt =
        new Date().toISOString();

      const { data: legacyLog, error: logError } =
        await supabase
          .from("craving_logs")
          .insert({
            user_id: session.user.id,
            trigger,
            outcome:
              passed ? "beat" : "vaped",
            challenge: gameResult
              ? `Game: ${gameResult.game.name}`
              : "Logged without game",
            xp_earned:
              awarded.xpAdded,
            created_at: createdAt,
          })
          .select()
          .single();

      if (logError) throw logError;

      setLogs((current) => [
        ...current,
        legacyLog,
      ]);

      setCravingSessions((current) =>
        current.map((item) =>
          item.id === cravingSessionId
            ? {
                ...item,
                craving_after:
                  cravingAfter,
                outcome,
                vaping_reported:
                  outcome === "vaped",
                completed_at: createdAt,
              }
            : item
        )
      );

      if (outcome === "vaped") {
        const streakAtLapse =
          getDaysSince(
            profile.streak_start
          );

        const newLongest = Math.max(
          profile.longest_streak_days ||
            0,
          streakAtLapse
        );

        await supabase
          .from("profiles")
          .update({
            streak_start: createdAt,
            longest_streak_days:
              newLongest,
          })
          .eq("id", session.user.id);

        setProfile((current) => ({
          ...current,
          streak_start: createdAt,
          longest_streak_days:
            newLongest,
        }));
      }

      setRewardSummary({
        xp:
          (gameResult?.xpEarned || 0) +
          awarded.xpAdded,

        coins:
          (gameResult?.coinsEarned ||
            0) +
          awarded.coinsAdded,
      });

      setScreen(
        passed
          ? "cravingResolved"
          : "lapse"
      );
    } catch (error) {
      console.error(error);
      setErrorMessage(error.message);
    }
  }

  async function markStillCraving() {
    try {
      const cravingSessionId =
        await ensureCravingSession();

      await supabase
        .from("craving_sessions")
        .update({
          craving_after: cravingAfter,
          outcome: "still_craving",
        })
        .eq("id", cravingSessionId);

      setScreen("stillCraving");
    } catch (error) {
      setErrorMessage(error.message);
    }
  }

  async function skipGame() {
    try {
      await ensureCravingSession();
      setGameResult(null);
      setScreen("skipLog");
    } catch (error) {
      setErrorMessage(error.message);
    }
  }

  if (authLoading) {
    return (
      <div className="app centered-screen">
        <div className="loading-ring" />
        <p>Loading...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="app auth-screen">
        <div className="auth-logo">✦</div>

        <p className="eyebrow">
          BE LIKE ALLIE C
        </p>

        <h1>
          {authMode === "signin"
            ? "Welcome back."
            : "Create your account."}
        </h1>

        <p className="auth-subtext">
          Beat cravings, build streaks,
          earn XP and stay in control.
        </p>

        <div className="auth-toggle">
          <button
            className={
              authMode === "signin"
                ? "active"
                : ""
            }
            onClick={() =>
              setAuthMode("signin")
            }
          >
            Sign In
          </button>

          <button
            className={
              authMode === "signup"
                ? "active"
                : ""
            }
            onClick={() =>
              setAuthMode("signup")
            }
          >
            Create Account
          </button>
        </div>

        <form
          className="auth-form"
          onSubmit={handleAuth}
        >
          <label>Email</label>

          <input
            type="email"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            required
          />

          <label className="password-label">
            Password
          </label>

          <input
            type="password"
            value={password}
            onChange={(event) =>
              setPassword(
                event.target.value
              )
            }
            required
            minLength={6}
          />

          <button
            className="primary-action"
            type="submit"
          >
            {authMode === "signin"
              ? "Sign In"
              : "Create Account"}
          </button>
        </form>

        {successMessage && (
          <div className="login-message">
            {successMessage}
          </div>
        )}

        {errorMessage && (
          <div className="error-message">
            {errorMessage}
          </div>
        )}
      </div>
    );
  }

  if (dataLoading || !profile) {
    return (
      <div className="app centered-screen">
        <div className="loading-ring" />
        <p>Loading your progress...</p>
      </div>
    );
  }

  return (
    <div className="app">
      {errorMessage && (
        <div className="error-banner">
          {errorMessage}
        </div>
      )}

      {screen === "home" && (
        <>
          <header className="topbar">
            <div>
              <p className="eyebrow">
                TODAY
              </p>

              <h1>Stay in control.</h1>
            </div>

            <button
              className="level-pill"
              onClick={() =>
                setScreen("progress")
              }
            >
              <span>Level {level}</span>
              <strong>{xp} XP</strong>
              <small>🪙 {coins}</small>
            </button>
          </header>

          <main>
            <section className="hero-card">
              <p className="card-label">
                CURRENT STREAK
              </p>

              <div className="streak">
                <span className="streak-number">
                  {currentStreak}
                </span>

                <span className="streak-unit">
                  {currentStreak === 1
                    ? "day"
                    : "days"}
                </span>
              </div>

              <p className="streak-subtext">
                Every craving you interrupt is
                another rep.
              </p>

              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{
                    width: `${Math.min(
                      (currentStreak / 7) *
                        100,
                      100
                    )}%`,
                  }}
                />
              </div>
            </section>

            <section className="stats-grid">
              <div className="stat-card">
                <span className="stat-number">
                  {cravingsBeaten}
                </span>

                <span className="stat-label">
                  Cravings beaten
                </span>
              </div>

              <div className="stat-card">
                <span className="stat-number">
                  {challengeStreak}
                </span>

                <span className="stat-label">
                  Win streak
                </span>
              </div>
            </section>

            <section className="challenge-card">
              <div>
                <p className="card-label">
                  YOUR PROGRESS
                </p>

                <h2>
                  Level {level}
                </h2>

                <p className="challenge-progress">
                  {xp} XP · 🪙 {coins} coins
                </p>
              </div>

              <div className="xp-reward">
                {levelProgress}%
              </div>
            </section>

            <button
              className="craving-button"
              onClick={openCravingMode}
            >
              <span className="craving-small">
                HAVING A CRAVING?
              </span>

              <span className="craving-main">
                I WANT TO VAPE
              </span>
            </button>
          </main>

          <BottomNav
            active="home"
            setScreen={setScreen}
          />
        </>
      )}

      {screen === "nic" && (
        <>
          <NicScreen
            userId={session.user.id}
            coins={coins}
            xp={xp}
            level={level}
            streak={currentStreak}
            cravingsBeaten={cravingsBeaten}
            onCoinsChange={(newCoins) =>
              setProfile((current) => ({
                ...current,
                coins: newCoins,
              }))
            }
          />

          <BottomNav
            active="nic"
            setScreen={setScreen}
          />
        </>
      )}

      {screen === "games" && (
        <>
          <section className="games-summary">
            <div>
              <span>{level}</span>
              <small>Level</small>
            </div>

            <div>
              <span>🪙 {coins}</span>
              <small>Coins</small>
            </div>

            <div>
              <span>{gamesPlayed}</span>
              <small>Games</small>
            </div>

            <div>
              <span>
                {cravingsInterrupted}
              </span>
              <small>Interrupted</small>
            </div>
          </section>

          <GamesScreen
            level={level}
            highScores={highScores}
            onPlayGame={startStandaloneGame}
          />

          <BottomNav
            active="games"
            setScreen={setScreen}
          />
        </>
      )}

      {screen === "gameRunner" && (
        <GameRunner
          game={selectedGame}
          onComplete={handleGameComplete}
          onExit={() => {
            if (gameOrigin === "craving") {
              setScreen(
                "cravingGameChoice"
              );
            } else {
              setScreen("games");
            }
          }}
        />
      )}

      {screen === "gameComplete" && (
        <main className="result-screen">
          <div className="result-icon">
            🎮
          </div>

          <p className="eyebrow">
            GAME COMPLETE
          </p>

          <h1>{gameResult?.game.name}</h1>

          <section className="game-result-card">
            <ResultRow
              label="Score"
              value={gameResult?.score || 0}
            />

            <ResultRow
              label="XP"
              value={`+${
                rewardSummary?.xp || 0
              }`}
            />

            <ResultRow
              label="Coins"
              value={`+${
                rewardSummary?.coins || 0
              } 🪙`}
            />

            {gameResult?.highScoreBonus && (
              <div className="craving-change">
                New high score! +5 bonus
                coins
              </div>
            )}
          </section>

          <button
            className="primary-action"
            onClick={() =>
              setScreen("games")
            }
          >
            Back to Games
          </button>
        </main>
      )}

      {screen === "cravingIntro" && (
        <main className="flow-screen">
          <button
            className="back-button"
            onClick={goHome}
          >
            ← Back
          </button>

          <p className="eyebrow">
            CRAVING MODE
          </p>

          <h1>
            You don't have to decide
            anything yet.
          </h1>

          <section className="craving-intro-card">
            <h2>Give me 90 seconds.</h2>

            <p>
              We'll interrupt the craving
              first. Then you can decide what
              you want to do.
            </p>
          </section>

          <button
            className="primary-action"
            style={{ marginTop: 18 }}
            onClick={() =>
              setScreen("trigger")
            }
          >
            Beat This Craving
          </button>
        </main>
      )}

      {screen === "trigger" && (
        <main className="flow-screen">
          <button
            className="back-button"
            onClick={() =>
              setScreen("cravingIntro")
            }
          >
            ← Back
          </button>

          <p className="eyebrow">
            CRAVING MODE
          </p>

          <h1>What triggered it?</h1>

          <p className="flow-subtext">
            Pick the closest match.
          </p>

          <div className="trigger-grid">
            {triggerOptions.map((item) => (
              <button
                key={item}
                className="trigger-button"
                onClick={() => {
                  setTrigger(item);
                  setScreen(
                    "cravingBefore"
                  );
                }}
              >
                {item}
              </button>
            ))}
          </div>
        </main>
      )}

      {screen === "cravingBefore" && (
        <CravingRating
          title="How strong is the craving right now?"
          value={cravingBefore}
          setValue={setCravingBefore}
          buttonText="Continue"
          onContinue={() =>
            setScreen(
              "cravingGameChoice"
            )
          }
          onBack={() =>
            setScreen("trigger")
          }
        />
      )}

      {screen ===
        "cravingGameChoice" && (
        <main className="flow-screen">
          <button
            className="back-button"
            onClick={() =>
              setScreen("cravingBefore")
            }
          >
            ← Back
          </button>

          <p className="eyebrow">
            BEAT THIS CRAVING
          </p>

          <h1>Let's redirect your brain.</h1>

          <section className="recommended-game-card">
            <p className="card-label">
              RECOMMENDED
            </p>

            <h2>
              {recommendedGame.name}
            </h2>

            <p>
              {recommendedGame.description}
            </p>
          </section>

          <button
            className="primary-action"
            style={{ marginTop: 16 }}
            onClick={() =>
              startCravingGame(
                recommendedGame
              )
            }
          >
            Play Recommended Game
          </button>

          <button
            className="secondary-action"
            onClick={() =>
              setScreen(
                "chooseCravingGame"
              )
            }
          >
            Choose Another Game
          </button>

          <button
            className="lapse-action"
            onClick={skipGame}
          >
            Skip game and log craving
          </button>
        </main>
      )}

      {screen ===
        "chooseCravingGame" && (
        <GamesScreen
          level={level}
          highScores={highScores}
          onPlayGame={
            startCravingGame
          }
          onBack={() =>
            setScreen(
              "cravingGameChoice"
            )
          }
        />
      )}

      {screen === "cravingAfter" && (
        <CravingRating
          title="How strong is your craving now?"
          value={cravingAfter}
          setValue={setCravingAfter}
          buttonText="See Results"
          onContinue={() =>
            setScreen(
              "cravingDecision"
            )
          }
          onBack={() =>
            setScreen(
              "cravingGameChoice"
            )
          }
        />
      )}

      {screen ===
        "cravingDecision" && (
        <main className="result-screen">
          <p className="eyebrow">
            CRAVING CHECK
          </p>

          <h1>
            How are you feeling now?
          </h1>

          {gameResult && (
            <section className="game-result-card">
              <ResultRow
                label={`${gameResult.game.name} score`}
                value={
                  gameResult.score
                }
              />

              <ResultRow
                label="Craving before"
                value={`${cravingBefore}/10`}
              />

              <ResultRow
                label="Craving after"
                value={`${cravingAfter}/10`}
              />

              <div className="craving-change">
                {cravingBefore -
                  cravingAfter >
                0
                  ? `${
                      cravingBefore -
                      cravingAfter
                    } points lower`
                  : cravingBefore ===
                      cravingAfter
                    ? "Craving stayed the same"
                    : "Craving is still elevated"}
              </div>
            </section>
          )}

          <button
            className="success-action"
            onClick={() =>
              resolveCraving("passed")
            }
          >
            I'm Good
          </button>

          <button
            className="another-action"
            onClick={markStillCraving}
          >
            I Still Want to Vape
          </button>
        </main>
      )}

      {screen === "stillCraving" && (
        <main className="flow-screen">
          <p className="eyebrow">
            KEEP GOING
          </p>

          <h1>
            Let's try something else.
          </h1>

          <button
            className="primary-action"
            onClick={() =>
              setScreen(
                "chooseCravingGame"
              )
            }
          >
            Play Another Game
          </button>

          {[
            "10 slow breaths",
            "Drink water",
            "Walk for 2 minutes",
          ].map((item) => (
            <button
              key={item}
              className="secondary-action"
              onClick={() => {
                setSupportActivity(item);
                setScreen(
                  "supportActivity"
                );
              }}
            >
              {item}
            </button>
          ))}

          <button
            className="lapse-action"
            onClick={() =>
              resolveCraving("vaped")
            }
          >
            Log the vape
          </button>
        </main>
      )}

      {screen ===
        "supportActivity" && (
        <main className="result-screen">
          <p className="eyebrow">
            ONE MORE STEP
          </p>

          <h1>{supportActivity}</h1>

          <p className="result-text">
            Do this now, then check the
            craving again.
          </p>

          <button
            className="primary-action"
            onClick={() => {
              setCravingAfter(null);
              setScreen(
                "cravingAfter"
              );
            }}
          >
            I Did It
          </button>

          <button
            className="lapse-action"
            onClick={() =>
              resolveCraving("vaped")
            }
          >
            Log the vape
          </button>
        </main>
      )}

      {screen === "skipLog" && (
        <main className="result-screen">
          <p className="eyebrow">
            LOG CRAVING
          </p>

          <h1>What happened?</h1>

          <button
            className="success-action"
            onClick={() => {
              setCravingAfter(
                cravingBefore
              );

              resolveCraving("passed");
            }}
          >
            The craving passed
          </button>

          <button
            className="lapse-action"
            onClick={() => {
              setCravingAfter(
                cravingBefore
              );

              resolveCraving("vaped");
            }}
          >
            I vaped
          </button>
        </main>
      )}

      {screen ===
        "cravingResolved" && (
        <main className="result-screen">
          <div className="result-icon">
            ✓
          </div>

          <p className="eyebrow">
            CRAVING INTERRUPTED
          </p>

          <h1>Nice work.</h1>

          {gameResult && (
            <section className="game-result-card">
              <ResultRow
                label="Game"
                value={
                  gameResult.game.name
                }
              />

              <ResultRow
                label="Score"
                value={
                  gameResult.score
                }
              />

              <ResultRow
                label="Craving before"
                value={`${cravingBefore}/10`}
              />

              <ResultRow
                label="Craving after"
                value={`${cravingAfter}/10`}
              />

              <ResultRow
                label="XP earned"
                value={`+${
                  rewardSummary?.xp ||
                  0
                }`}
              />

              <ResultRow
                label="Coins earned"
                value={`+${
                  rewardSummary?.coins ||
                  0
                } 🪙`}
              />

              {cravingBefore >
                cravingAfter && (
                <div className="craving-change">
                  {cravingBefore -
                    cravingAfter}{" "}
                  points lower
                </div>
              )}
            </section>
          )}

          <button
            className="primary-action"
            onClick={goHome}
          >
            Back Home
          </button>
        </main>
      )}

      {screen === "lapse" && (
        <main className="result-screen">
          <div className="result-icon lapse-icon">
            ↻
          </div>

          <p className="eyebrow">
            KEEP GOING
          </p>

          <h1>
            One moment doesn't erase your
            progress.
          </h1>

          <p className="result-text">
            Your XP, coins, achievements
            and everything you've earned
            are still yours.
          </p>

          <button
            className="primary-action"
            onClick={goHome}
          >
            Keep Going
          </button>
        </main>
      )}

      {screen === "progress" && (
        <>
          <main className="progress-screen">
            <p className="eyebrow">
              YOUR PROGRESS
            </p>

            <h1>
              You're building momentum.
            </h1>

            <section className="progress-hero-card">
              <div>
                <p className="card-label">
                  CURRENT STREAK
                </p>

                <div className="progress-big-number">
                  {currentStreak}
                  <span> days</span>
                </div>
              </div>

              <div className="streak-badge">
                🔥
              </div>
            </section>

            <section className="progress-stats-grid">
              <ProgressStat
                value={longestStreak}
                label="Longest streak"
              />

              <ProgressStat
                value={cravingsBeaten}
                label="Cravings beaten"
              />

              <ProgressStat
                value={`${successRate}%`}
                label="Success rate"
              />

              <ProgressStat
                value={`🪙 ${coins}`}
                label="Coins"
              />
            </section>

            <section className="xp-progress-card">
              <p className="card-label">
                LEVEL PROGRESS
              </p>

              <div className="level-row">
                <div>
                  <h2>
                    Level {level}
                  </h2>

                  <p>
                    {xp} / {nextLevelXp} XP
                  </p>
                </div>

                <strong>
                  {levelProgress}%
                </strong>
              </div>

              <div className="progress-track">
                <div
                  className="level-progress-fill"
                  style={{
                    width: `${levelProgress}%`,
                  }}
                />
              </div>
            </section>

            <section className="weekly-card">
              <div className="section-heading">
                <div>
                  <p className="card-label">
                    LAST 7 DAYS
                  </p>

                  <h2>
                    Cravings defeated
                  </h2>
                </div>

                <strong>
                  {weeklyTotal}
                </strong>
              </div>

              <div className="week-bars">
                {weeklyData.map(
                  (day) => (
                    <div
                      className="day-bar-wrap"
                      key={day.key}
                    >
                      <div className="bar-background">
                        <div
                          className="bar-fill"
                          style={{
                            height:
                              day.count ===
                              0
                                ? 0
                                : `${Math.max(
                                    (day.count /
                                      maxWeeklyCount) *
                                      100,
                                    15
                                  )}%`,
                          }}
                        />
                      </div>

                      <span>
                        {day.label}
                      </span>
                    </div>
                  )
                )}
              </div>
            </section>

            <section className="trigger-insight-card">
              <p className="card-label">
                TOP TRIGGER
              </p>

              <div className="insight-row">
                <div>
                  <h2>
                    {topTrigger.name}
                  </h2>
                </div>

                <div className="insight-number">
                  {topTrigger.percentage}%
                </div>
              </div>
            </section>

            <section className="personal-records-card">
              <div className="section-heading">
                <div>
                  <p className="card-label">
                    GAME PERSONAL RECORDS
                  </p>

                  <h2>Your best scores</h2>
                </div>

                <div className="records-icon">
                  🏆
                </div>
              </div>

              <div className="personal-records-list">
                {GAME_CATALOG.map((game) => {
                  const score =
                    highScores[game.key];

                  const hasPlayed =
                    score !== undefined;

                  return (
                    <div
                      className="personal-record-row"
                      key={game.key}
                    >
                      <div className="personal-record-game">
                        <div className="personal-record-icon">
                          {game.icon}
                        </div>

                        <div>
                          <strong>
                            {game.name}
                          </strong>

                          <span>
                            {hasPlayed
                              ? "Personal best"
                              : "No score yet"}
                          </span>
                        </div>
                      </div>

                      <div
                        className={
                          hasPlayed
                            ? "personal-record-score"
                            : "personal-record-score empty"
                        }
                      >
                        {hasPlayed
                          ? score.toLocaleString()
                          : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="leaderboard-card">
              <div className="leaderboard-heading">
                <div>
                  <p className="card-label">
                    GLOBAL LEADERBOARDS
                  </p>

                  <h2>Top players</h2>
                </div>

                <div className="leaderboard-trophy">
                  ♛
                </div>
              </div>

              <div className="leaderboard-name-card">
                <div>
                  <strong>
                    Your leaderboard name
                  </strong>

                  <p>
                    This is the only name other players will see.
                  </p>
                </div>

                <div className="leaderboard-name-controls">
                  <input
                    type="text"
                    maxLength={18}
                    value={leaderboardNameDraft}
                    placeholder="Choose nickname"
                    onChange={(event) =>
                      setLeaderboardNameDraft(
                        event.target.value
                      )
                    }
                  />

                  <button
                    onClick={saveLeaderboardName}
                  >
                    Save
                  </button>
                </div>

                {leaderboardMessage && (
                  <span className="leaderboard-message">
                    {leaderboardMessage}
                  </span>
                )}
              </div>

              <div className="leaderboard-game-tabs">
                {GAME_CATALOG.map((game) => (
                  <button
                    key={game.key}
                    className={
                      leaderboardGame === game.key
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setLeaderboardGame(game.key)
                    }
                  >
                    <span>{game.icon}</span>
                    {game.name}
                  </button>
                ))}
              </div>

              <div className="leaderboard-game-title">
                <div>
                  <span>
                    {
                      GAME_CATALOG.find(
                        (game) =>
                          game.key === leaderboardGame
                      )?.icon
                    }
                  </span>

                  <div>
                    <strong>
                      {
                        GAME_CATALOG.find(
                          (game) =>
                            game.key === leaderboardGame
                        )?.name
                      }
                    </strong>

                    <p>All-time personal bests</p>
                  </div>
                </div>
              </div>

              {leaderboardLoading ? (
                <div className="leaderboard-empty">
                  Loading rankings...
                </div>
              ) : leaderboards.filter(
                  (entry) =>
                    entry.game_key === leaderboardGame
                ).length === 0 ? (
                <div className="leaderboard-empty">
                  No scores yet. Be the first.
                </div>
              ) : (
                <div className="leaderboard-list">
                  {leaderboards
                    .filter(
                      (entry) =>
                        entry.game_key === leaderboardGame
                    )
                    .slice(0, 50)
                    .map((entry, index) => {
                      const isMe =
                        profile.leaderboard_name &&
                        entry.nickname.toLowerCase() ===
                          profile.leaderboard_name.toLowerCase();

                      return (
                        <div
                          className={`leaderboard-row ${
                            isMe
                              ? "leaderboard-me"
                              : ""
                          }`}
                          key={`${entry.game_key}-${entry.leaderboard_rank}-${entry.nickname}-${index}`}
                        >
                          <div className="leaderboard-rank">
                            {entry.leaderboard_rank === 1
                              ? "🥇"
                              : entry.leaderboard_rank === 2
                                ? "🥈"
                                : entry.leaderboard_rank === 3
                                  ? "🥉"
                                  : `#${entry.leaderboard_rank}`}
                          </div>

                          <div className="leaderboard-player">
                            <strong>
                              {entry.nickname}
                            </strong>

                            {isMe && (
                              <span>You</span>
                            )}
                          </div>

                          <div className="leaderboard-score">
                            {Number(
                              entry.best_score
                            ).toLocaleString()}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </section>

            <button
              className="signout-button"
              onClick={signOut}
            >
              Sign out
            </button>
          </main>

          <BottomNav
            active="progress"
            setScreen={setScreen}
          />
        </>
      )}

      {screen === "trends" && (
        <>
          <main className="trends-screen">
            <p className="eyebrow">
              YOUR TRENDS
            </p>

            <h1>
              Learn your patterns.
            </h1>

            <section className="ai-insight-card">
              <div className="ai-heading">
                <div className="ai-icon">
                  ✦
                </div>

                <div>
                  <p className="card-label">
                    SMART INSIGHT
                  </p>

                  <h2>
                    What we're noticing
                  </h2>
                </div>
              </div>

              <p className="ai-insight-text">
                {trendData.insight}
              </p>
            </section>

            <section className="trend-grid">
              <TrendCard
                label="PEAK CRAVING TIME"
                value={
                  trendData.peakTime
                }
                text="When cravings appear most often."
              />

              <TrendCard
                label="HARDEST TRIGGER"
                value={
                  trendData.hardestTrigger
                }
                text={`${trendData.hardestTriggerRate}% success rate`}
              />
            </section>

            <section className="best-tool-card">
              <p className="card-label">
                WHAT WORKS BEST
              </p>

              <div className="best-tool-row">
                <div>
                  <h2>
                    {
                      trendData.bestChallenge
                    }
                  </h2>

                  <p>
                    Your highest-performing
                    intervention.
                  </p>
                </div>

                <div className="big-percentage">
                  {
                    trendData.bestChallengeRate
                  }
                  %
                </div>
              </div>
            </section>

            <section className="weekly-comparison-card">
              <p className="card-label">
                CRAVING ACTIVITY
              </p>

              <div className="comparison-grid">
                <div>
                  <span>
                    {
                      trendData.thisWeekCount
                    }
                  </span>

                  <p>Last 7 days</p>
                </div>

                <div>
                  <span>
                    {
                      trendData.previousWeekCount
                    }
                  </span>

                  <p>Previous 7 days</p>
                </div>
              </div>
            </section>
          </main>

          <BottomNav
            active="trends"
            setScreen={setScreen}
          />
        </>
      )}

      {screen ===
        "achievements" && (
        <>
          <main className="achievement-screen">
            <p className="eyebrow">
              ACHIEVEMENTS
            </p>

            <h1>
              Keep unlocking.
            </h1>

            <section className="achievement-summary">
              <div>
                <span>
                  {unlockedAchievements}
                </span>

                <p>Unlocked</p>
              </div>

              <div>
                <span>
                  {achievements.length}
                </span>

                <p>Total</p>
              </div>
            </section>

            <div className="achievement-grid">
              {achievements.map(
                (achievement) => {
                  const percent =
                    Math.min(
                      (achievement.progress /
                        achievement.goal) *
                        100,
                      100
                    );

                  return (
                    <section
                      key={
                        achievement.id
                      }
                      className={`achievement-card ${
                        achievement.unlocked
                          ? "achievement-unlocked"
                          : "achievement-locked"
                      }`}
                    >
                      <div className="achievement-icon">
                        {
                          achievement.icon
                        }
                      </div>

                      <div className="achievement-content">
                        <div className="achievement-title-row">
                          <h2>
                            {
                              achievement.name
                            }
                          </h2>

                          {achievement.unlocked && (
                            <span className="unlocked-pill">
                              UNLOCKED
                            </span>
                          )}
                        </div>

                        <p>
                          {
                            achievement.description
                          }
                        </p>

                        {!achievement.unlocked && (
                          <>
                            <div className="achievement-progress-row">
                              <span>
                                {
                                  achievement.progress
                                }{" "}
                                /{" "}
                                {
                                  achievement.goal
                                }
                              </span>

                              <span>
                                {Math.round(
                                  percent
                                )}
                                %
                              </span>
                            </div>

                            <div className="achievement-progress-track">
                              <div
                                className="achievement-progress-fill"
                                style={{
                                  width: `${percent}%`,
                                }}
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </section>
                  );
                }
              )}
            </div>
          </main>

          <BottomNav
            active="achievements"
            setScreen={setScreen}
          />
        </>
      )}
    </div>
  );
}

function CravingRating({
  title,
  value,
  setValue,
  buttonText,
  onContinue,
  onBack,
}) {
  return (
    <main className="flow-screen">
      <button
        className="back-button"
        onClick={onBack}
      >
        ← Back
      </button>

      <p className="eyebrow">
        CRAVING CHECK
      </p>

      <h1>{title}</h1>

      <p className="flow-subtext">
        1 is barely there. 10 is extremely
        strong.
      </p>

      <div className="craving-scale">
        {Array.from(
          { length: 10 },
          (_, index) => index + 1
        ).map((number) => (
          <button
            key={number}
            className={
              value === number
                ? "selected"
                : ""
            }
            onClick={() =>
              setValue(number)
            }
          >
            {number}
          </button>
        ))}
      </div>

      <button
        className="primary-action"
        style={{ marginTop: 22 }}
        disabled={!value}
        onClick={onContinue}
      >
        {buttonText}
      </button>
    </main>
  );
}

function ResultRow({
  label,
  value,
}) {
  return (
    <div className="game-result-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function BottomNav({
  active,
  setScreen,
}) {
  return (
    <nav className="bottom-nav">
      <button
        className={
          active === "home"
            ? "active"
            : ""
        }
        onClick={() =>
          setScreen("home")
        }
      >
        Home
      </button>

      <button
        className={
          active === "progress"
            ? "active"
            : ""
        }
        onClick={() =>
          setScreen("progress")
        }
      >
        Progress
      </button>

      <button
        className={
          active === "nic"
            ? "active"
            : ""
        }
        onClick={() =>
          setScreen("nic")
        }
      >
        Nic
      </button>

      <button
        className={
          active === "trends"
            ? "active"
            : ""
        }
        onClick={() =>
          setScreen("trends")
        }
      >
        Trends
      </button>

      <button
        className={
          active === "achievements"
            ? "active"
            : ""
        }
        onClick={() =>
          setScreen("achievements")
        }
      >
        Awards
      </button>
    </nav>
  );
}

function ProgressStat({
  value,
  label,
}) {
  return (
    <div className="progress-stat-card">
      <span>{value}</span>
      <p>{label}</p>
    </div>
  );
}

function TrendCard({
  label,
  value,
  text,
}) {
  return (
    <div className="trend-card">
      <p className="card-label">
        {label}
      </p>

      <strong>{value}</strong>

      <p>{text}</p>
    </div>
  );
}

export default App;
