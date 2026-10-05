import { useEffect, useMemo, useRef, useState } from "react";

export const GAME_CATALOG = [
  {
    key: "pattern_tap",
    name: "Pattern Tap",
    description: "Remember the highlighted tiles and repeat the pattern.",
    unlockLevel: 1,
    icon: "◫",
  },
  {
    key: "quick_math",
    name: "Quick Math",
    description: "Solve fast, simple arithmetic problems.",
    unlockLevel: 1,
    icon: "＋",
  },
  {
    key: "sequence_memory",
    name: "Sequence Memory",
    description: "Remember and recreate the sequence.",
    unlockLevel: 2,
    icon: "123",
  },
  {
    key: "stroop",
    name: "Stroop Challenge",
    description: "Choose the displayed color, not the word.",
    unlockLevel: 3,
    icon: "A",
  },
  {
    key: "focus_tap",
    name: "Focus Tap",
    description: "Hit the correct targets and ignore distractions.",
    unlockLevel: 4,
    icon: "◎",
  },
  {
    key: "mental_rotation",
    name: "Mental Rotation",
    description: "Match the rotated shape.",
    unlockLevel: 5,
    icon: "◇",
  },
];

export function getLevelFromXp(xp) {
  const thresholds = [0, 100, 250, 450, 700, 1000, 1350, 1750, 2200, 2700];

  for (let i = thresholds.length - 1; i >= 0; i -= 1) {
    if (xp >= thresholds[i]) {
      return i + 1;
    }
  }

  return 1;
}

export function getXpForNextLevel(level) {
  const thresholds = [0, 100, 250, 450, 700, 1000, 1350, 1750, 2200, 2700];

  return thresholds[level] ?? thresholds[thresholds.length - 1] + 600;
}

export function GamesScreen({
  level,
  highScores = {},
  onPlayGame,
  onBack,
}) {
  return (
    <main className="games-screen">
      {onBack && (
        <button className="back-button" onClick={onBack}>
          ← Back
        </button>
      )}

      <p className="eyebrow">GAMES</p>
      <h1>Beat the craving.</h1>

      <p className="flow-subtext">
        Short games designed to grab your attention when a craving hits.
      </p>

      <div className="games-grid">
        {GAME_CATALOG.map((game) => {
          const unlocked = level >= game.unlockLevel;

          return (
            <button
              key={game.key}
              className={`game-card ${!unlocked ? "game-card-locked" : ""}`}
              onClick={() => unlocked && onPlayGame(game)}
              disabled={!unlocked}
            >
              <div className="game-card-top">
                <div className="game-icon">{game.icon}</div>

                {!unlocked && (
                  <span className="game-lock">
                    Level {game.unlockLevel}
                  </span>
                )}
              </div>

              <h2>{game.name}</h2>
              <p>{game.description}</p>

              <div className="game-card-bottom">
                {unlocked ? (
                  <span>Play</span>
                ) : (
                  <span>Unlock at Level {game.unlockLevel}</span>
                )}

                {highScores[game.key] !== undefined && (
                  <strong>Best {highScores[game.key]}</strong>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </main>
  );
}

export function GameRunner({ game, onComplete, onExit }) {
  if (!game) return null;

  if (game.key === "pattern_tap") {
    return (
      <PatternTap
        game={game}
        onComplete={onComplete}
        onExit={onExit}
      />
    );
  }

  if (game.key === "quick_math") {
    return (
      <QuickMath
        game={game}
        onComplete={onComplete}
        onExit={onExit}
      />
    );
  }

  if (game.key === "sequence_memory") {
    return (
      <SequenceMemory
        game={game}
        onComplete={onComplete}
        onExit={onExit}
      />
    );
  }

  if (game.key === "stroop") {
    return (
      <StroopChallenge
        game={game}
        onComplete={onComplete}
        onExit={onExit}
      />
    );
  }

  if (game.key === "focus_tap") {
    return (
      <FocusTap
        game={game}
        onComplete={onComplete}
        onExit={onExit}
      />
    );
  }

  return (
    <MentalRotation
      game={game}
      onComplete={onComplete}
      onExit={onExit}
    />
  );
}

function GameShell({
  title,
  subtitle,
  score,
  timeLeft,
  children,
  onExit,
}) {
  return (
    <main className="game-runner">
      <div className="game-runner-header">
        <button className="back-button" onClick={onExit}>
          ← Exit
        </button>

        <div className="game-live-stats">
          <span>{score} pts</span>
          <span>{timeLeft}s</span>
        </div>
      </div>

      <p className="eyebrow">CRAVING GAME</p>
      <h1>{title}</h1>

      <p className="flow-subtext">{subtitle}</p>

      {children}
    </main>
  );
}

function useCountdown(seconds, onFinish) {
  const [timeLeft, setTimeLeft] = useState(seconds);

  const endTimeRef = useRef(
    Date.now() + seconds * 1000
  );

  const onFinishRef = useRef(onFinish);
  const finishedRef = useRef(false);

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    const updateClock = () => {
      const remaining = Math.max(
        0,
        Math.ceil(
          (endTimeRef.current - Date.now()) / 1000
        )
      );

      setTimeLeft(remaining);

      if (
        remaining <= 0 &&
        !finishedRef.current
      ) {
        finishedRef.current = true;
        onFinishRef.current();
      }
    };

    updateClock();

    const timer = setInterval(
      updateClock,
      250
    );

    return () => clearInterval(timer);
  }, []);

  return timeLeft;
}

function PatternTap({ game, onComplete, onExit }) {
  const [score, setScore] = useState(0);
  const [sequence, setSequence] = useState([]);
  const [playerIndex, setPlayerIndex] = useState(0);
  const [showing, setShowing] = useState(true);
  const [activeTile, setActiveTile] = useState(null);
  const [startedAt] = useState(Date.now());
  const [finished, setFinished] = useState(false);
  const [timeExpired, setTimeExpired] = useState(false);

  const finish = () => {
    if (finished) return;

    setFinished(true);

    onComplete({
      game,
      score,
      durationSeconds: Math.max(
        1,
        Math.round((Date.now() - startedAt) / 1000)
      ),
    });
  };

  const handleTimerEnd = () => {
    setTimeExpired(true);
  };

  const timeLeft = useCountdown(60, handleTimerEnd);

  function createSequence(length) {
    return Array.from(
      { length },
      () => Math.floor(Math.random() * 9)
    );
  }

  useEffect(() => {
    setSequence(createSequence(3));
  }, []);

  useEffect(() => {
    if (!sequence.length || finished) return;

    setShowing(true);
    setPlayerIndex(0);

    let position = 0;

    const interval = setInterval(() => {
      if (position >= sequence.length) {
        clearInterval(interval);

        setTimeout(() => {
          setActiveTile(null);
          setShowing(false);
        }, 350);

        return;
      }

      setActiveTile(sequence[position]);

      setTimeout(() => {
        setActiveTile(null);
      }, 350);

      position += 1;
    }, 650);

    return () => clearInterval(interval);
  }, [sequence, finished]);

  function finishOrStartNextRound(nextLength) {
    if (timeExpired) {
      finish();
      return;
    }

    setSequence(createSequence(nextLength));
  }

  function tapTile(index) {
    if (showing || finished) return;

    if (index !== sequence[playerIndex]) {
      setScore((current) => Math.max(0, current - 10));

      finishOrStartNextRound(
        Math.max(3, sequence.length)
      );

      return;
    }

    const nextIndex = playerIndex + 1;

    if (nextIndex === sequence.length) {
      setScore((current) => current + sequence.length * 20);

      finishOrStartNextRound(
        Math.min(sequence.length + 1, 8)
      );
    } else {
      setPlayerIndex(nextIndex);
    }
  }

  return (
    <GameShell
      title="Pattern Tap"
      subtitle={
        showing
          ? timeExpired
            ? "Finish watching this final pattern."
            : "Watch the tiles."
          : timeExpired
            ? "Finish this final pattern."
            : "Repeat the pattern."
      }
      score={score}
      timeLeft={timeLeft}
      onExit={onExit}
    >
      <div className="pattern-grid">
        {Array.from({ length: 9 }).map((_, index) => (
          <button
            key={index}
            className={`pattern-tile ${
              activeTile === index ? "pattern-tile-active" : ""
            }`}
            onClick={() => tapTile(index)}
          />
        ))}
      </div>
    </GameShell>
  );
}

function QuickMath({ game, onComplete, onExit }) {
  const [score, setScore] = useState(0);
  const [problem, setProblem] = useState(makeMathProblem());
  const [startedAt] = useState(Date.now());
  const [finished, setFinished] = useState(false);

  const finish = () => {
    if (finished) return;
    setFinished(true);

    onComplete({
      game,
      score,
      durationSeconds: Math.max(
        1,
        Math.round((Date.now() - startedAt) / 1000)
      ),
    });
  };

  const timeLeft = useCountdown(45, finish);

  function answer(value) {
    if (value === problem.answer) {
      setScore((current) => current + 25);
    } else {
      setScore((current) => Math.max(0, current - 5));
    }

    setProblem(makeMathProblem());
  }

  return (
    <GameShell
      title="Quick Math"
      subtitle="Answer as many as you can."
      score={score}
      timeLeft={timeLeft}
      onExit={onExit}
    >
      <section className="math-card">
        <div className="math-problem">
          {problem.text}
        </div>

        <div className="math-options">
          {problem.options.map((option) => (
            <button
              key={option}
              onClick={() => answer(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </section>
    </GameShell>
  );
}

function makeMathProblem() {
  const type = Math.floor(Math.random() * 3);

  let a;
  let b;
  let answer;
  let text;

  if (type === 0) {
    a = randomBetween(2, 15);
    b = randomBetween(2, 15);
    answer = a + b;
    text = `${a} + ${b}`;
  } else if (type === 1) {
    a = randomBetween(8, 20);
    b = randomBetween(1, a);
    answer = a - b;
    text = `${a} − ${b}`;
  } else {
    a = randomBetween(2, 8);
    b = randomBetween(2, 8);
    answer = a * b;
    text = `${a} × ${b}`;
  }

  const wrongAnswers = new Set();

  while (wrongAnswers.size < 3) {
    const wrong = Math.max(
      0,
      answer + randomBetween(-6, 6)
    );

    if (wrong !== answer) {
      wrongAnswers.add(wrong);
    }
  }

  return {
    text,
    answer,
    options: shuffle([
      answer,
      ...wrongAnswers,
    ]),
  };
}

function SequenceMemory({ game, onComplete, onExit }) {
  const [score, setScore] = useState(0);
  const [length, setLength] = useState(3);
  const [sequence, setSequence] = useState(makeDigitSequence(3));
  const [visible, setVisible] = useState(true);
  const [input, setInput] = useState("");
  const [startedAt] = useState(Date.now());
  const [finished, setFinished] = useState(false);

  const finish = () => {
    if (finished) return;
    setFinished(true);

    onComplete({
      game,
      score,
      durationSeconds: Math.max(
        1,
        Math.round((Date.now() - startedAt) / 1000)
      ),
    });
  };

  const timeLeft = useCountdown(45, finish);

  useEffect(() => {
    setVisible(true);
    setInput("");

    const timer = setTimeout(() => {
      setVisible(false);
    }, Math.max(900, length * 450));

    return () => clearTimeout(timer);
  }, [sequence, length]);

  function submit() {
    if (input === sequence) {
      setScore((current) => current + length * 20);
      const nextLength = Math.min(length + 1, 8);
      setLength(nextLength);
      setSequence(makeDigitSequence(nextLength));
    } else {
      setScore((current) => Math.max(0, current - 10));
      setSequence(makeDigitSequence(length));
    }
  }

  return (
    <GameShell
      title="Sequence Memory"
      subtitle={
        visible
          ? "Remember this sequence."
          : "Type it back."
      }
      score={score}
      timeLeft={timeLeft}
      onExit={onExit}
    >
      <section className="sequence-card">
        {visible ? (
          <div className="sequence-display">
            {sequence}
          </div>
        ) : (
          <>
            <input
              className="sequence-input"
              inputMode="numeric"
              value={input}
              onChange={(event) =>
                setInput(event.target.value.replace(/\D/g, ""))
              }
              placeholder="Enter sequence"
            />

            <button
              className="primary-action"
              onClick={submit}
              disabled={!input}
            >
              Submit
            </button>
          </>
        )}
      </section>
    </GameShell>
  );
}

function StroopChallenge({ game, onComplete, onExit }) {
  const colors = [
    { name: "RED", value: "#ef6666" },
    { name: "BLUE", value: "#5b8cff" },
    { name: "GREEN", value: "#58cf8d" },
    { name: "YELLOW", value: "#e8c753" },
  ];

  const [score, setScore] = useState(0);
  const [round, setRound] = useState(makeStroopRound(colors));
  const [startedAt] = useState(Date.now());
  const [finished, setFinished] = useState(false);

  const finish = () => {
    if (finished) return;
    setFinished(true);

    onComplete({
      game,
      score,
      durationSeconds: Math.max(
        1,
        Math.round((Date.now() - startedAt) / 1000)
      ),
    });
  };

  const timeLeft = useCountdown(40, finish);

  function choose(colorName) {
    if (colorName === round.ink.name) {
      setScore((current) => current + 20);
    } else {
      setScore((current) => Math.max(0, current - 5));
    }

    setRound(makeStroopRound(colors));
  }

  return (
    <GameShell
      title="Stroop Challenge"
      subtitle="Tap the COLOR of the word, not what it says."
      score={score}
      timeLeft={timeLeft}
      onExit={onExit}
    >
      <section className="stroop-card">
        <div
          className="stroop-word"
          style={{ color: round.ink.value }}
        >
          {round.word.name}
        </div>

        <div className="stroop-options">
          {colors.map((color) => (
            <button
              key={color.name}
              onClick={() => choose(color.name)}
            >
              {color.name}
            </button>
          ))}
        </div>
      </section>
    </GameShell>
  );
}

function makeStroopRound(colors) {
  const word = colors[randomBetween(0, colors.length - 1)];

  let ink;

  do {
    ink = colors[randomBetween(0, colors.length - 1)];
  } while (ink.name === word.name);

  return { word, ink };
}

function FocusTap({ game, onComplete, onExit }) {
  const [score, setScore] = useState(0);
  const [target, setTarget] = useState(randomBetween(0, 8));
  const [startedAt] = useState(Date.now());
  const [finished, setFinished] = useState(false);

  const finish = () => {
    if (finished) return;
    setFinished(true);

    onComplete({
      game,
      score,
      durationSeconds: Math.max(
        1,
        Math.round((Date.now() - startedAt) / 1000)
      ),
    });
  };

  const timeLeft = useCountdown(40, finish);

  function tap(index) {
    if (index === target) {
      setScore((current) => current + 20);

      let next;

      do {
        next = randomBetween(0, 8);
      } while (next === target);

      setTarget(next);
    } else {
      setScore((current) => Math.max(0, current - 5));
    }
  }

  return (
    <GameShell
      title="Focus Tap"
      subtitle="Tap the bright target. Ignore the others."
      score={score}
      timeLeft={timeLeft}
      onExit={onExit}
    >
      <div className="focus-grid">
        {Array.from({ length: 9 }).map((_, index) => (
          <button
            key={index}
            className={`focus-target ${
              index === target ? "focus-target-active" : ""
            }`}
            onClick={() => tap(index)}
          >
            {index === target ? "●" : "○"}
          </button>
        ))}
      </div>
    </GameShell>
  );
}

function MentalRotation({ game, onComplete, onExit }) {
  const shapes = ["▲", "◆", "L", "T"];

  const [score, setScore] = useState(0);
  const [shape, setShape] = useState(
    shapes[randomBetween(0, shapes.length - 1)]
  );

  const [correctRotation, setCorrectRotation] = useState(
    randomBetween(1, 3) * 90
  );

  const [startedAt] = useState(Date.now());
  const [finished, setFinished] = useState(false);

  const finish = () => {
    if (finished) return;
    setFinished(true);

    onComplete({
      game,
      score,
      durationSeconds: Math.max(
        1,
        Math.round((Date.now() - startedAt) / 1000)
      ),
    });
  };

  const timeLeft = useCountdown(45, finish);

  const options = useMemo(() => {
    return shuffle([90, 180, 270, 0]);
  }, [shape, correctRotation]);

  function choose(rotation) {
    if (rotation === correctRotation) {
      setScore((current) => current + 25);
    } else {
      setScore((current) => Math.max(0, current - 5));
    }

    setShape(
      shapes[randomBetween(0, shapes.length - 1)]
    );

    setCorrectRotation(randomBetween(1, 3) * 90);
  }

  return (
    <GameShell
      title="Mental Rotation"
      subtitle="Which option matches the target rotation?"
      score={score}
      timeLeft={timeLeft}
      onExit={onExit}
    >
      <section className="rotation-card">
        <p className="card-label">
          ROTATE THIS SHAPE {correctRotation}°
        </p>

        <div className="rotation-original">
          {shape}
        </div>

        <div className="rotation-options">
          {options.map((rotation) => (
            <button
              key={rotation}
              onClick={() => choose(rotation)}
            >
              <span
                style={{
                  transform: `rotate(${rotation}deg)`,
                }}
              >
                {shape}
              </span>
            </button>
          ))}
        </div>
      </section>
    </GameShell>
  );
}

function makeDigitSequence(length) {
  return Array.from(
    { length },
    () => randomBetween(0, 9)
  ).join("");
}

function randomBetween(min, max) {
  return Math.floor(
    Math.random() * (max - min + 1)
  ) + min;
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}
