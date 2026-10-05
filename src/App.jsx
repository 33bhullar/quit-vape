import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import "./App.css";

const triggerOptions = [
  "Stress",
  "Boredom",
  "Driving",
  "After eating",
  "Social",
  "Studying / Work",
  "Alcohol",
  "Other",
];

const challenges = [
  { title: "Walk for 3 minutes.", seconds: 180, xp: 50 },
  { title: "Drink a full glass of water.", seconds: 60, xp: 35 },
  { title: "Take 10 slow breaths.", seconds: 90, xp: 40 },
  {
    title: "Put your phone down and move around.",
    seconds: 120,
    xp: 45,
  },
  { title: "Chew gum or grab a mint.", seconds: 120, xp: 40 },
  {
    title: "Do 15 pushups or bodyweight squats.",
    seconds: 90,
    xp: 50,
  },
  {
    title: "Change rooms and do something else.",
    seconds: 180,
    xp: 50,
  },
  { title: "Step outside for fresh air.", seconds: 120, xp: 45 },
  { title: "Wash your face with cold water.", seconds: 60, xp: 35 },
  {
    title: "Do something productive for 3 minutes.",
    seconds: 180,
    xp: 50,
  },
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

  const start = new Date(dateString);
  const now = new Date();

  return Math.max(
    0,
    Math.floor((now.getTime() - start.getTime()) / 86400000)
  );
}

function getChallengeStreak(logs) {
  const sorted = [...logs].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );

  let streak = 0;

  for (const log of sorted) {
    if (log.outcome === "beat") {
      streak += 1;
    } else if (log.outcome === "vaped") {
      break;
    }
  }

  return streak;
}

function getMaxConsecutiveWins(logs) {
  const sorted = [...logs].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
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
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );

  let lapseSeen = false;

  for (const log of sorted) {
    if (log.outcome === "vaped") {
      lapseSeen = true;
    }

    if (lapseSeen && log.outcome === "beat") {
      return true;
    }
  }

  return false;
}

function getTimePeriod(dateString) {
  const hour = new Date(dateString).getHours();

  if (hour >= 5 && hour < 12) return "Morning";
  if (hour >= 12 && hour < 17) return "Afternoon";
  if (hour >= 17 && hour < 22) return "Evening";

  return "Late night";
}

function calculateSuccessRate(logs) {
  if (!logs.length) return 0;

  const wins = logs.filter((log) => log.outcome === "beat").length;

  return Math.round((wins / logs.length) * 100);
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

  const [screen, setScreen] = useState("home");
  const [trigger, setTrigger] = useState("");

  const [challengeIndex, setChallengeIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(challenges[0].seconds);
  const [timerRunning, setTimerRunning] = useState(false);
  const [challengeFinished, setChallengeFinished] = useState(false);
  const [lastXpEarned, setLastXpEarned] = useState(0);

  const currentChallenge = challenges[challengeIndex];

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user?.id) {
      setProfile(null);
      setLogs([]);
      setDailyBonuses([]);
      return;
    }

    loadUserData(session.user.id);
  }, [session]);

  useEffect(() => {
    if (!timerRunning) return;

    if (secondsLeft <= 0) {
      setTimerRunning(false);
      setChallengeFinished(true);
      return;
    }

    const timer = setInterval(() => {
      setSecondsLeft((current) => current - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timerRunning, secondsLeft]);

  async function loadUserData(userId) {
    setDataLoading(true);
    setErrorMessage("");

    try {
      let { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profileData) {
        const { data: newProfile, error: createError } = await supabase
          .from("profiles")
          .insert({
            id: userId,
            xp: 0,
            streak_start: new Date().toISOString(),
            longest_streak_days: 0,
          })
          .select()
          .single();

        if (createError) throw createError;

        profileData = newProfile;
      }

      const { data: logData, error: logError } = await supabase
        .from("craving_logs")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (logError) throw logError;

      const { data: bonusData, error: bonusError } = await supabase
        .from("daily_bonuses")
        .select("*")
        .eq("user_id", userId);

      if (bonusError) throw bonusError;

      setProfile(profileData);
      setLogs(logData || []);
      setDailyBonuses(bonusData || []);
    } catch (error) {
      console.error(error);
      setErrorMessage(error.message || "Could not load your data.");
    } finally {
      setDataLoading(false);
    }
  }

  async function handleAuth(event) {
    event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
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

      setSuccessMessage("Account created. You're signed in.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
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

  const xp = profile?.xp || 0;

  const currentStreak = getDaysSince(profile?.streak_start);

  const longestStreak = Math.max(
    profile?.longest_streak_days || 0,
    currentStreak
  );

  const cravingsBeaten = logs.filter(
    (log) => log.outcome === "beat"
  ).length;

  const vapingEvents = logs.filter(
    (log) => log.outcome === "vaped"
  ).length;

  const totalResolvedCravings = cravingsBeaten + vapingEvents;

  const successRate =
    totalResolvedCravings === 0
      ? 0
      : Math.round((cravingsBeaten / totalResolvedCravings) * 100);

  const challengeStreak = getChallengeStreak(logs);
  const maxChallengeStreak = getMaxConsecutiveWins(logs);

  const level = Math.floor(xp / 250) + 1;
  const levelXp = xp % 250;
  const levelPercent = Math.round((levelXp / 250) * 100);

  const todayKey = getDateKey();

  const cravingsBeatenToday = logs.filter(
    (log) =>
      log.outcome === "beat" &&
      getDateKey(log.created_at) === todayKey
  ).length;

  const dailyChallengeCompleted = dailyBonuses.some(
    (bonus) => bonus.bonus_date === todayKey
  );

  const topTrigger = useMemo(() => {
    if (!logs.length) {
      return { name: "No data yet", percentage: 0 };
    }

    const counts = {};

    logs.forEach((log) => {
      counts[log.trigger] = (counts[log.trigger] || 0) + 1;
    });

    const entries = Object.entries(counts).sort(
      (a, b) => b[1] - a[1]
    );

    const [name, count] = entries[0];

    return {
      name,
      percentage: Math.round((count / logs.length) * 100),
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

  const stressWins = logs.filter(
    (log) => log.outcome === "beat" && log.trigger === "Stress"
  ).length;

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
        recentRate: 0,
        earlierRate: 0,
        insight:
          "Complete a few craving challenges and your personalized trends will begin appearing here.",
      };
    }

    const timeCounts = {
      Morning: 0,
      Afternoon: 0,
      Evening: 0,
      "Late night": 0,
    };

    logs.forEach((log) => {
      timeCounts[getTimePeriod(log.created_at)] += 1;
    });

    const peakTime = Object.entries(timeCounts).sort(
      (a, b) => b[1] - a[1]
    )[0][0];

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

    const challengeEntries = Object.entries(challengeStats)
      .map(([name, stats]) => ({
        name,
        attempts: stats.attempts,
        rate: Math.round((stats.wins / stats.attempts) * 100),
      }))
      .sort((a, b) => {
        if (b.rate !== a.rate) return b.rate - a.rate;
        return b.attempts - a.attempts;
      });

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

    const triggerEntries = Object.entries(triggerStats).map(
      ([name, stats]) => ({
        name,
        attempts: stats.attempts,
        rate: Math.round((stats.wins / stats.attempts) * 100),
      })
    );

    const hardest = [...triggerEntries].sort((a, b) => {
      if (a.rate !== b.rate) return a.rate - b.rate;
      return b.attempts - a.attempts;
    })[0];

    const strongest = [...triggerEntries].sort((a, b) => {
      if (b.rate !== a.rate) return b.rate - a.rate;
      return b.attempts - a.attempts;
    })[0];

    const sortedRecent = [...logs].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );

    const recentLogs = sortedRecent.slice(0, 10);
    const earlierLogs = sortedRecent.slice(10, 20);

    const recentRate = calculateSuccessRate(recentLogs);
    const earlierRate = calculateSuccessRate(earlierLogs);

    const now = new Date();

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const fourteenDaysAgo = new Date(now);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const thisWeekLogs = logs.filter(
      (log) => new Date(log.created_at) >= sevenDaysAgo
    );

    const previousWeekLogs = logs.filter((log) => {
      const date = new Date(log.created_at);

      return date >= fourteenDaysAgo && date < sevenDaysAgo;
    });

    let insight = `Your cravings happen most often during the ${peakTime.toLowerCase()}.`;

    if (
      challengeEntries[0] &&
      challengeEntries[0].attempts >= 2
    ) {
      insight += ` "${challengeEntries[0].name}" has been your most effective challenge so far.`;
    }

    if (hardest?.name) {
      insight += ` ${hardest.name} appears to be one of your tougher triggers.`;
    }

    return {
      peakTime,
      bestChallenge: challengeEntries[0]?.name || "No data yet",
      bestChallengeRate: challengeEntries[0]?.rate || 0,
      hardestTrigger: hardest?.name || "No data yet",
      hardestTriggerRate: hardest?.rate || 0,
      strongestTrigger: strongest?.name || "No data yet",
      strongestTriggerRate: strongest?.rate || 0,
      thisWeekCount: thisWeekLogs.length,
      previousWeekCount: previousWeekLogs.length,
      recentRate,
      earlierRate,
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
      progress: Math.min(maxChallengeStreak, 3),
      goal: 3,
    },
    {
      id: "crusher",
      icon: "💥",
      name: "Craving Crusher",
      description: "Beat 10 cravings.",
      unlocked: cravingsBeaten >= 10,
      progress: Math.min(cravingsBeaten, 10),
      goal: 10,
    },
    {
      id: "three",
      icon: "🔥",
      name: "Three Days Strong",
      description: "Reach a 3-day vape-free streak.",
      unlocked: longestStreak >= 3,
      progress: Math.min(longestStreak, 3),
      goal: 3,
    },
    {
      id: "week",
      icon: "🏆",
      name: "One Week",
      description: "Reach a 7-day vape-free streak.",
      unlocked: longestStreak >= 7,
      progress: Math.min(longestStreak, 7),
      goal: 7,
    },
    {
      id: "comeback",
      icon: "↗",
      name: "Comeback",
      description: "Beat a craving after a lapse.",
      unlocked: hasComeback(logs),
      progress: hasComeback(logs) ? 1 : 0,
      goal: 1,
    },
    {
      id: "stress",
      icon: "🛡",
      name: "Pressure Proof",
      description: "Beat 5 stress-triggered cravings.",
      unlocked: stressWins >= 5,
      progress: Math.min(stressWins, 5),
      goal: 5,
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
    {
      id: "level10",
      icon: "👑",
      name: "Level 10",
      description: "Reach Level 10.",
      unlocked: level >= 10,
      progress: Math.min(level, 10),
      goal: 10,
    },
  ];

  const unlockedAchievements = achievements.filter(
    (achievement) => achievement.unlocked
  ).length;

  function openCravingMode() {
    setTrigger("");
    setTimerRunning(false);
    setChallengeFinished(false);
    setScreen("trigger");
  }

  function chooseTrigger(selectedTrigger) {
    setTrigger(selectedTrigger);

    const randomIndex = Math.floor(Math.random() * challenges.length);

    setChallengeIndex(randomIndex);
    setSecondsLeft(challenges[randomIndex].seconds);
    setTimerRunning(false);
    setChallengeFinished(false);
    setScreen("challenge");
  }

  function startChallenge() {
    setTimerRunning(true);
  }

  function anotherChallenge() {
    let nextIndex;

    do {
      nextIndex = Math.floor(Math.random() * challenges.length);
    } while (nextIndex === challengeIndex);

    setChallengeIndex(nextIndex);
    setSecondsLeft(challenges[nextIndex].seconds);
    setTimerRunning(false);
    setChallengeFinished(false);
  }

  async function beatCraving() {
    setErrorMessage("");

    const userId = session.user.id;
    const createdAt = new Date().toISOString();

    let bonusXp = 0;

    if (
      cravingsBeatenToday + 1 >= 3 &&
      !dailyChallengeCompleted
    ) {
      bonusXp = 100;
    }

    const xpEarned = currentChallenge.xp + bonusXp;
    const newXp = xp + xpEarned;

    const { data: newLog, error: logError } = await supabase
      .from("craving_logs")
      .insert({
        user_id: userId,
        trigger,
        outcome: "beat",
        challenge: currentChallenge.title,
        xp_earned: xpEarned,
        created_at: createdAt,
      })
      .select()
      .single();

    if (logError) {
      setErrorMessage(logError.message);
      return;
    }

    if (bonusXp > 0) {
      const { data: bonusRow, error: bonusError } = await supabase
        .from("daily_bonuses")
        .insert({
          user_id: userId,
          bonus_date: todayKey,
        })
        .select()
        .single();

      if (!bonusError && bonusRow) {
        setDailyBonuses((current) => [...current, bonusRow]);
      }
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        xp: newXp,
      })
      .eq("id", userId);

    if (profileError) {
      setErrorMessage(profileError.message);
      return;
    }

    setLogs((current) => [...current, newLog]);

    setProfile((current) => ({
      ...current,
      xp: newXp,
    }));

    setLastXpEarned(xpEarned);
    setScreen("success");
  }

  async function logVape() {
    setErrorMessage("");

    const userId = session.user.id;
    const createdAt = new Date().toISOString();

    const streakAtLapse = getDaysSince(profile.streak_start);

    const newLongestStreak = Math.max(
      profile.longest_streak_days || 0,
      streakAtLapse
    );

    const { data: newLog, error: logError } = await supabase
      .from("craving_logs")
      .insert({
        user_id: userId,
        trigger,
        outcome: "vaped",
        challenge: currentChallenge.title,
        xp_earned: 0,
        created_at: createdAt,
      })
      .select()
      .single();

    if (logError) {
      setErrorMessage(logError.message);
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        streak_start: createdAt,
        longest_streak_days: newLongestStreak,
      })
      .eq("id", userId);

    if (profileError) {
      setErrorMessage(profileError.message);
      return;
    }

    setLogs((current) => [...current, newLog]);

    setProfile((current) => ({
      ...current,
      streak_start: createdAt,
      longest_streak_days: newLongestStreak,
    }));

    setScreen("lapse");
  }

  function goHome() {
    setTrigger("");
    setTimerRunning(false);
    setChallengeFinished(false);
    setScreen("home");
  }

  function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(
      seconds
    ).padStart(2, "0")}`;
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

        <p className="eyebrow">TAKE BACK CONTROL</p>

        <h1>
          {authMode === "signin"
            ? "Welcome back."
            : "Create your account."}
        </h1>

        <p className="auth-subtext">
          Build streaks, beat cravings, earn XP and learn what
          actually works for you.
        </p>

        <div className="auth-toggle">
          <button
            className={authMode === "signin" ? "active" : ""}
            onClick={() => {
              setAuthMode("signin");
              setErrorMessage("");
              setSuccessMessage("");
            }}
          >
            Sign In
          </button>

          <button
            className={authMode === "signup" ? "active" : ""}
            onClick={() => {
              setAuthMode("signup");
              setErrorMessage("");
              setSuccessMessage("");
            }}
          >
            Create Account
          </button>
        </div>

        <form className="auth-form" onSubmit={handleAuth}>
          <label>Email</label>

          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label className="password-label">Password</label>

          <input
            type="password"
            placeholder="At least 6 characters"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={6}
          />

          <button className="primary-action" type="submit">
            {authMode === "signin"
              ? "Sign In"
              : "Create Account"}
          </button>
        </form>

        {successMessage && (
          <div className="login-message">{successMessage}</div>
        )}

        {errorMessage && (
          <div className="error-message">{errorMessage}</div>
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
        <div className="error-banner">{errorMessage}</div>
      )}

      {screen === "home" && (
        <>
          <header className="topbar">
            <div>
              <p className="eyebrow">TODAY</p>
              <h1>Stay in control.</h1>
            </div>

            <button
              className="level-pill"
              onClick={() => setScreen("progress")}
            >
              <span>Level {level}</span>
              <strong>{xp} XP</strong>
            </button>
          </header>

          <main>
            <section className="hero-card">
              <p className="card-label">CURRENT STREAK</p>

              <div className="streak">
                <span className="streak-number">{currentStreak}</span>

                <span className="streak-unit">
                  {currentStreak === 1 ? "day" : "days"}
                </span>
              </div>

              <p className="streak-subtext">
                {currentStreak < 3
                  ? "Your next milestone is 3 days."
                  : currentStreak < 7
                    ? "Your next milestone is 7 days."
                    : "Keep building the streak."}
              </p>

              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{
                    width: `${
                      currentStreak < 3
                        ? Math.min((currentStreak / 3) * 100, 100)
                        : Math.min((currentStreak / 7) * 100, 100)
                    }%`,
                  }}
                />
              </div>
            </section>

            <section className="stats-grid">
              <div className="stat-card">
                <span className="stat-number">{cravingsBeaten}</span>
                <span className="stat-label">Cravings beaten</span>
              </div>

              <div className="stat-card">
                <span className="stat-number">{challengeStreak}</span>
                <span className="stat-label">Challenge streak</span>
              </div>
            </section>

            <section className="challenge-card">
              <div>
                <p className="card-label">DAILY CHALLENGE</p>

                <h2>
                  {dailyChallengeCompleted
                    ? "Challenge complete"
                    : "Beat 3 cravings today"}
                </h2>

                <p className="challenge-progress">
                  {Math.min(cravingsBeatenToday, 3)} of 3 completed
                </p>
              </div>

              <div
                className={`xp-reward ${
                  dailyChallengeCompleted ? "reward-complete" : ""
                }`}
              >
                {dailyChallengeCompleted ? "DONE" : "+100 XP"}
              </div>
            </section>

            <button
              className="craving-button"
              onClick={openCravingMode}
            >
              <span className="craving-small">
                HAVING A CRAVING?
              </span>

              <span className="craving-main">I WANT TO VAPE</span>
            </button>
          </main>

          <BottomNav active="home" setScreen={setScreen} />
        </>
      )}

      {screen === "progress" && (
        <>
          <main className="progress-screen">
            <p className="eyebrow">YOUR PROGRESS</p>
            <h1>You're building momentum.</h1>

            <section className="progress-hero-card">
              <div>
                <p className="card-label">CURRENT STREAK</p>

                <div className="progress-big-number">
                  {currentStreak}
                  <span>
                    {" "}
                    {currentStreak === 1 ? "day" : "days"}
                  </span>
                </div>
              </div>

              <div className="streak-badge">🔥</div>
            </section>

            <section className="progress-stats-grid">
              <ProgressStat value={longestStreak} label="Longest streak" />
              <ProgressStat value={cravingsBeaten} label="Cravings beaten" />
              <ProgressStat value={`${successRate}%`} label="Success rate" />
              <ProgressStat value={challengeStreak} label="Challenge streak" />
            </section>

            <section className="weekly-card">
              <div className="section-heading">
                <div>
                  <p className="card-label">LAST 7 DAYS</p>
                  <h2>Cravings defeated</h2>
                </div>

                <strong>{weeklyTotal}</strong>
              </div>

              <div className="week-bars">
                {weeklyData.map((day) => (
                  <div className="day-bar-wrap" key={day.key}>
                    <div className="bar-background">
                      <div
                        className="bar-fill"
                        style={{
                          height: `${
                            day.count === 0
                              ? 0
                              : Math.max(
                                  (day.count / maxWeeklyCount) * 100,
                                  15
                                )
                          }%`,
                        }}
                      />
                    </div>

                    <span>{day.label}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="trigger-insight-card">
              <p className="card-label">TOP TRIGGER</p>

              <div className="insight-row">
                <div>
                  <h2>{topTrigger.name}</h2>

                  <p>
                    {logs.length
                      ? "This is currently your most common craving trigger."
                      : "Start logging cravings to discover your patterns."}
                  </p>
                </div>

                <div className="insight-number">
                  {topTrigger.percentage}%
                </div>
              </div>
            </section>

            <section className="xp-progress-card">
              <p className="card-label">LEVEL PROGRESS</p>

              <div className="level-row">
                <div>
                  <h2>Level {level}</h2>
                  <p>{levelXp} / 250 XP</p>
                </div>

                <strong>{levelPercent}%</strong>
              </div>

              <div className="progress-track">
                <div
                  className="level-progress-fill"
                  style={{ width: `${levelPercent}%` }}
                />
              </div>
            </section>

            <section className="history-card">
              <p className="card-label">RECENT ACTIVITY</p>

              {!logs.length ? (
                <p className="empty-text">
                  Your completed cravings will appear here.
                </p>
              ) : (
                [...logs]
                  .reverse()
                  .slice(0, 5)
                  .map((log) => (
                    <div className="history-row" key={log.id}>
                      <div>
                        <strong>
                          {log.outcome === "beat"
                            ? "Craving defeated"
                            : "Lapse logged"}
                        </strong>

                        <p>
                          {log.trigger} ·{" "}
                          {new Date(log.created_at).toLocaleDateString()}
                        </p>
                      </div>

                      <span className="history-win">
                        {log.outcome === "beat"
                          ? `+${log.xp_earned} XP`
                          : "↻"}
                      </span>
                    </div>
                  ))
              )}
            </section>

            <button className="signout-button" onClick={signOut}>
              Sign out
            </button>
          </main>

          <BottomNav active="progress" setScreen={setScreen} />
        </>
      )}

      {screen === "trends" && (
        <>
          <main className="trends-screen">
            <p className="eyebrow">YOUR TRENDS</p>
            <h1>Learn your patterns.</h1>

            <section className="ai-insight-card">
              <div className="ai-heading">
                <div className="ai-icon">✦</div>

                <div>
                  <p className="card-label">SMART INSIGHT</p>
                  <h2>What we're noticing</h2>
                </div>
              </div>

              <p className="ai-insight-text">
                {trendData.insight}
              </p>
            </section>

            <section className="trend-grid">
              <TrendCard
                label="PEAK CRAVING TIME"
                value={trendData.peakTime}
                text="When cravings appear most often."
              />

              <TrendCard
                label="HARDEST TRIGGER"
                value={trendData.hardestTrigger}
                text={`${trendData.hardestTriggerRate}% success rate`}
              />
            </section>

            <section className="best-tool-card">
              <p className="card-label">WHAT WORKS BEST</p>

              <div className="best-tool-row">
                <div>
                  <h2>{trendData.bestChallenge}</h2>
                  <p>Your highest-performing craving challenge.</p>
                </div>

                <div className="big-percentage">
                  {trendData.bestChallengeRate}%
                </div>
              </div>
            </section>

            <section className="trend-card-full">
              <p className="card-label">STRONGEST AREA</p>

              <div className="trend-detail-row">
                <div>
                  <h2>{trendData.strongestTrigger}</h2>
                  <p>
                    Trigger you currently resist most successfully.
                  </p>
                </div>

                <strong>{trendData.strongestTriggerRate}%</strong>
              </div>
            </section>

            <section className="weekly-comparison-card">
              <p className="card-label">CRAVING ACTIVITY</p>

              <div className="comparison-grid">
                <div>
                  <span>{trendData.thisWeekCount}</span>
                  <p>Last 7 days</p>
                </div>

                <div>
                  <span>{trendData.previousWeekCount}</span>
                  <p>Previous 7 days</p>
                </div>
              </div>
            </section>
          </main>

          <BottomNav active="trends" setScreen={setScreen} />
        </>
      )}

      {screen === "achievements" && (
        <>
          <main className="achievement-screen">
            <p className="eyebrow">ACHIEVEMENTS</p>
            <h1>Keep unlocking.</h1>

            <section className="achievement-summary">
              <div>
                <span>{unlockedAchievements}</span>
                <p>Unlocked</p>
              </div>

              <div>
                <span>{achievements.length}</span>
                <p>Total</p>
              </div>
            </section>

            <div className="achievement-grid">
              {achievements.map((achievement) => {
                const percent = Math.min(
                  (achievement.progress / achievement.goal) * 100,
                  100
                );

                return (
                  <section
                    key={achievement.id}
                    className={`achievement-card ${
                      achievement.unlocked
                        ? "achievement-unlocked"
                        : "achievement-locked"
                    }`}
                  >
                    <div className="achievement-icon">
                      {achievement.icon}
                    </div>

                    <div className="achievement-content">
                      <div className="achievement-title-row">
                        <h2>{achievement.name}</h2>

                        {achievement.unlocked && (
                          <span className="unlocked-pill">
                            UNLOCKED
                          </span>
                        )}
                      </div>

                      <p>{achievement.description}</p>

                      {!achievement.unlocked && (
                        <>
                          <div className="achievement-progress-row">
                            <span>
                              {achievement.progress} / {achievement.goal}
                            </span>

                            <span>{Math.round(percent)}%</span>
                          </div>

                          <div className="achievement-progress-track">
                            <div
                              className="achievement-progress-fill"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </main>

          <BottomNav active="achievements" setScreen={setScreen} />
        </>
      )}

      {screen === "trigger" && (
        <main className="flow-screen">
          <button className="back-button" onClick={goHome}>
            ← Back
          </button>

          <p className="eyebrow">CRAVING MODE</p>
          <h1>What triggered it?</h1>

          <p className="flow-subtext">
            Pick the closest match. This helps the app learn your
            patterns.
          </p>

          <div className="trigger-grid">
            {triggerOptions.map((item) => (
              <button
                key={item}
                className="trigger-button"
                onClick={() => chooseTrigger(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </main>
      )}

      {screen === "challenge" && (
        <main className="flow-screen">
          <button
            className="back-button"
            onClick={() => setScreen("trigger")}
          >
            ← Back
          </button>

          <p className="eyebrow">CRAVING BATTLE</p>

          <h1>
            {timerRunning
              ? "You've got this."
              : challengeFinished
                ? "How do you feel?"
                : "Do this first."}
          </h1>

          <section className="active-challenge-card">
            <p className="card-label">YOUR CHALLENGE</p>

            <h2>{currentChallenge.title}</h2>

            <p className="flow-subtext">
              Trigger: <strong>{trigger}</strong>
            </p>

            <div
              className={
                timerRunning
                  ? "challenge-timer timer-active"
                  : "challenge-timer"
              }
            >
              {formatTime(secondsLeft)}
            </div>

            <div className="challenge-reward">
              +{currentChallenge.xp} XP
            </div>
          </section>

          {!timerRunning && !challengeFinished && (
            <>
              <button
                className="primary-action"
                onClick={startChallenge}
              >
                Start Challenge
              </button>

              <button className="secondary-action" onClick={goHome}>
                Not now
              </button>
            </>
          )}

          {timerRunning && (
            <button
              className="secondary-action"
              onClick={() => {
                setTimerRunning(false);
                setChallengeFinished(true);
              }}
            >
              I'm done early
            </button>
          )}

          {challengeFinished && (
            <div className="outcome-section">
              <button className="success-action" onClick={beatCraving}>
                I BEAT IT
              </button>

              <button
                className="another-action"
                onClick={anotherChallenge}
              >
                Still craving — give me another challenge
              </button>

              <button className="lapse-action" onClick={logVape}>
                I vaped
              </button>
            </div>
          )}
        </main>
      )}

      {screen === "success" && (
        <main className="result-screen">
          <div className="result-icon">✓</div>

          <p className="eyebrow">CRAVING DEFEATED</p>
          <h1>Nice work.</h1>

          <p className="result-text">
            You felt the craving and chose not to act on it.
          </p>

          <div className="xp-earned">+{lastXpEarned} XP</div>

          <button className="primary-action" onClick={goHome}>
            Back Home
          </button>
        </main>
      )}

      {screen === "lapse" && (
        <main className="result-screen">
          <div className="result-icon lapse-icon">↻</div>

          <p className="eyebrow">KEEP GOING</p>

          <h1>One moment doesn't erase your progress.</h1>

          <p className="result-text">
            Your XP, achievements and cravings you've already beaten
            are still yours.
          </p>

          <button className="primary-action" onClick={goHome}>
            Keep Going
          </button>
        </main>
      )}
    </div>
  );
}

function BottomNav({ active, setScreen }) {
  return (
    <nav className="bottom-nav">
      <button
        className={active === "home" ? "active" : ""}
        onClick={() => setScreen("home")}
      >
        Home
      </button>

      <button
        className={active === "progress" ? "active" : ""}
        onClick={() => setScreen("progress")}
      >
        Progress
      </button>

      <button
        className={active === "trends" ? "active" : ""}
        onClick={() => setScreen("trends")}
      >
        Trends
      </button>

      <button
        className={active === "achievements" ? "active" : ""}
        onClick={() => setScreen("achievements")}
      >
        Achievements
      </button>
    </nav>
  );
}

function ProgressStat({ value, label }) {
  return (
    <div className="progress-stat-card">
      <span>{value}</span>
      <p>{label}</p>
    </div>
  );
}

function TrendCard({ label, value, text }) {
  return (
    <div className="trend-card">
      <p className="card-label">{label}</p>
      <strong>{value}</strong>
      <p>{text}</p>
    </div>
  );
}

export default App;