import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

const SHOP_CATEGORIES = [
  ["body", "Bodies"],
  ["face", "Faces"],
  ["accessory", "Accessories"],
  ["effect", "Effects"],
  ["background", "Backgrounds"],
  ["title", "Titles"],
];

function normalizeNicCategory(category) {
  if (
    [
      "accessory",
      "glasses",
      "hat",
      "watch",
      "chain",
      "backpack",
    ].includes(category)
  ) {
    return "accessory";
  }

  return category;
}

export default function NicScreen({
  userId,
  coins,
  xp,
  level,
  streak,
  cravingsBeaten,
  onCoinsChange,
}) {
  const [character, setCharacter] = useState(null);

  const [items, setItems] = useState([]);
  const [ownedIds, setOwnedIds] = useState([]);
  const [equippedRows, setEquippedRows] = useState([]);

  const [section, setSection] = useState("character");
  const [shopCategory, setShopCategory] = useState("body");

  const [editingName, setEditingName] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState("");

  const [loading, setLoading] = useState(true);
  const [busyItem, setBusyItem] = useState(null);

  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!userId) return;

    loadNic();
  }, [userId]);

  async function loadNic() {
    setLoading(true);
    setErrorMessage("");

    try {
      const starterResult =
        await supabase.rpc("claim_nic_starters");

      if (starterResult.error) {
        throw starterResult.error;
      }

      let {
        data: characterRow,
        error: characterError,
      } = await supabase
        .from("characters")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (characterError) {
        throw characterError;
      }

      if (!characterRow) {
        const {
          data: createdCharacter,
          error: createError,
        } = await supabase
          .from("characters")
          .insert({
            user_id: userId,
            nickname: "Nic",

            body: "body_1",
            skin_tone: "medium",

            hair_style: "short",
            hair_color: "brown",

            shirt: "basic_black_shirt",
            pants: "basic_black_pants",
            shoes: "basic_white_shoes",

            background: "default",
          })
          .select()
          .single();

        if (createError) {
          throw createError;
        }

        characterRow = createdCharacter;
      }

      const [
        itemResponse,
        ownedResponse,
        equippedResponse,
      ] = await Promise.all([
        supabase
          .from("character_items")
          .select("*")
          .order("price", {
            ascending: true,
          }),

        supabase
          .from("owned_items")
          .select("item_id")
          .eq("user_id", userId),

        supabase
          .from("equipped_items")
          .select("*")
          .eq("user_id", userId),
      ]);

      if (itemResponse.error) {
        throw itemResponse.error;
      }

      if (ownedResponse.error) {
        throw ownedResponse.error;
      }

      if (equippedResponse.error) {
        throw equippedResponse.error;
      }

      setCharacter(characterRow);

      setNicknameDraft(
        characterRow.nickname || "Nic"
      );

      setItems(itemResponse.data || []);

      setOwnedIds(
        (ownedResponse.data || []).map(
          (row) => row.item_id
        )
      );

      setEquippedRows(
        equippedResponse.data || []
      );
    } catch (error) {
      console.error(error);

      setErrorMessage(
        error.message ||
          "Could not load Nic."
      );
    } finally {
      setLoading(false);
    }
  }

  const itemMap = useMemo(() => {
    const map = {};

    items.forEach((item) => {
      map[item.id] = item;
    });

    return map;
  }, [items]);

  const equipped = useMemo(() => {
    const result = {};

    equippedRows.forEach((row) => {
      const item = itemMap[row.item_id];

      if (item) {
        const category =
          normalizeNicCategory(
            row.category
          );

        result[category] = item;
      }
    });

    return result;
  }, [equippedRows, itemMap]);

  const body =
    equipped.body?.asset_value ||
    "body_black";

  const face =
    equipped.face?.asset_value ||
    "face_happy";

  const accessory =
    equipped.accessory?.asset_value ||
    "none";

  const effect =
    equipped.effect?.asset_value ||
    "none";

  const background =
    equipped.background?.asset_value ||
    "default";

  const title =
    equipped.title?.asset_value ||
    "No title equipped";

  const moodText = useMemo(() => {
    if (streak >= 30) {
      return "Nic says: We're on another level.";
    }

    if (streak >= 7) {
      return "Nic says: We're locked in.";
    }

    if (cravingsBeaten >= 10) {
      return "Nic says: Cravings don't run this.";
    }

    if (cravingsBeaten > 0) {
      return "Nic says: Another craving down.";
    }

    return "Nic says: Let's build something.";
  }, [streak, cravingsBeaten]);

  async function saveNickname() {
    const cleaned =
      nicknameDraft.trim().slice(0, 18);

    if (!cleaned) {
      setErrorMessage(
        "Give Nic a nickname first."
      );

      return;
    }

    setErrorMessage("");
    setMessage("");

    const { data, error } =
      await supabase
        .from("characters")
        .update({
          nickname: cleaned,
          updated_at:
            new Date().toISOString(),
        })
        .eq("user_id", userId)
        .select()
        .single();

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setCharacter(data);
    setNicknameDraft(data.nickname);

    setEditingName(false);

    setMessage("Nickname saved.");
  }

  async function buyItem(item) {
    if (busyItem) return;

    setBusyItem(item.id);

    setMessage("");
    setErrorMessage("");

    try {
      const { data, error } =
        await supabase.rpc(
          "purchase_nic_item",
          {
            p_item_id: item.id,
          }
        );

      if (error) throw error;

      if (
        data &&
        typeof data.coins === "number"
      ) {
        onCoinsChange(data.coins);
      }

      const { data: ownedData, error: ownedError } =
        await supabase
          .from("owned_items")
          .select("item_id")
          .eq("user_id", userId);

      if (ownedError) {
        throw ownedError;
      }

      setOwnedIds(
        (ownedData || []).map(
          (row) => row.item_id
        )
      );

      setMessage(
        data?.already_owned
          ? "You already own this."
          : `${item.name} added to your closet.`
      );
    } catch (error) {
      setErrorMessage(
        error.message ||
          "Could not purchase item."
      );
    } finally {
      setBusyItem(null);
    }
  }

  async function equipItem(item) {
    if (!ownedIds.includes(item.id)) {
      setErrorMessage("You do not own this item yet.");
      return;
    }

    if (busyItem) return;

    setBusyItem(item.id);

    setMessage("");
    setErrorMessage("");

    try {
      const { data, error } = await supabase.rpc(
        "equip_nic_item",
        {
          p_item_id: item.id,
        }
      );

      if (error) throw error;

      if (!data?.success) {
        throw new Error("Could not equip this item.");
      }

      const { data: equippedData, error: equippedError } =
        await supabase
          .from("equipped_items")
          .select("*")
          .eq("user_id", userId);

      if (equippedError) {
        throw equippedError;
      }

      setEquippedRows(equippedData || []);

      setMessage(`${item.name} equipped.`);
    } catch (error) {
      console.error(error);

      setErrorMessage(
        error.message ||
          "Could not equip item."
      );
    } finally {
      setBusyItem(null);
    }
  }

  async function unequipItem(item) {
    if (busyItem) return;

    setBusyItem(item.id);

    setMessage("");
    setErrorMessage("");

    try {
      const category =
        normalizeNicCategory(
          item.category
        );

      const { data, error } =
        await supabase.rpc(
          "unequip_nic_item",
          {
            p_category: category,
          }
        );

      if (error) throw error;

      if (!data?.success) {
        throw new Error(
          "Could not remove this item."
        );
      }

      const {
        data: equippedData,
        error: equippedError,
      } = await supabase
        .from("equipped_items")
        .select("*")
        .eq("user_id", userId);

      if (equippedError) {
        throw equippedError;
      }

      setEquippedRows(
        equippedData || []
      );

      setMessage(
        `${item.name} removed.`
      );
    } catch (error) {
      console.error(error);

      setErrorMessage(
        error.message ||
          "Could not remove item."
      );
    } finally {
      setBusyItem(null);
    }
  }

  const filteredShopItems =
    items.filter(
      (item) =>
        item.category === shopCategory &&
        item.unlock_type !==
          "achievement"
    );

  const NIC_CATEGORIES = [
    "body",
    "face",
    "accessory",
    "glasses",
    "hat",
    "watch",
    "chain",
    "backpack",
    "effect",
    "background",
    "title",
  ];

  const ownedItems = items.filter(
    (item) =>
      ownedIds.includes(item.id) &&
      NIC_CATEGORIES.includes(item.category)
  );

  if (loading) {
    return (
      <main className="nic-screen nic-loading">
        <div className="loading-ring" />
        <p>Waking Nic up...</p>
      </main>
    );
  }

  return (
    <main className="nic-screen">
      <p className="eyebrow">
        YOUR NIC
      </p>

      <div className="nic-title-row">
        <div>
          <h1>
            {character?.nickname || "Nic"}
          </h1>

          <p>{title}</p>
        </div>

        <div className="nic-coins">
          🪙 {coins}
        </div>
      </div>

      {message && (
        <div className="nic-message">
          {message}
        </div>
      )}

      {errorMessage && (
        <div className="nic-error">
          {errorMessage}
        </div>
      )}

      <NicAvatar
        body={body}
        face={face}
        accessory={accessory}
        effect={effect}
        background={background}
      />

      <div className="nic-active-title">
        {title === "No title equipped"
          ? "No title equipped"
          : title}
      </div>

      <div className="nic-mood">
        {moodText}
      </div>

      <section className="nic-stats">
        <div>
          <strong>{level}</strong>
          <span>Level</span>
        </div>

        <div>
          <strong>{xp}</strong>
          <span>XP</span>
        </div>

        <div>
          <strong>{streak}</strong>
          <span>Day streak</span>
        </div>

        <div>
          <strong>
            {cravingsBeaten}
          </strong>

          <span>Cravings</span>
        </div>
      </section>

      <nav className="nic-tabs">
        <button
          className={
            section === "character"
              ? "active"
              : ""
          }
          onClick={() =>
            setSection("character")
          }
        >
          Nic
        </button>

        <button
          className={
            section === "closet"
              ? "active"
              : ""
          }
          onClick={() =>
            setSection("closet")
          }
        >
          Closet
        </button>

        <button
          className={
            section === "shop"
              ? "active"
              : ""
          }
          onClick={() =>
            setSection("shop")
          }
        >
          Shop
        </button>
      </nav>

      {section === "character" && (
        <section className="nic-panel">
          <p className="card-label">
            NICKNAME
          </p>

          {!editingName ? (
            <>
              <div className="nic-setting-row">
                <div>
                  <strong>
                    {character?.nickname ||
                      "Nic"}
                  </strong>

                  <p>
                    Make your Nic yours.
                  </p>
                </div>

                <button
                  onClick={() =>
                    setEditingName(true)
                  }
                >
                  Rename
                </button>
              </div>
            </>
          ) : (
            <div className="nic-name-editor">
              <input
                maxLength={18}
                value={nicknameDraft}
                onChange={(event) =>
                  setNicknameDraft(
                    event.target.value
                  )
                }
                autoFocus
              />

              <button
                className="primary-action"
                onClick={saveNickname}
              >
                Save Name
              </button>

              <button
                className="secondary-action"
                onClick={() => {
                  setNicknameDraft(
                    character?.nickname ||
                      "Nic"
                  );

                  setEditingName(false);
                }}
              >
                Cancel
              </button>
            </div>
          )}

          <div className="nic-equipped">
            <p className="card-label">
              CURRENT LOOK
            </p>

            <NicEquippedRow
              label="Body"
              value={
                equipped.body?.name ||
                "Matte Black"
              }
            />

            <NicEquippedRow
              label="Face"
              value={
                equipped.face?.name ||
                "Happy"
              }
            />

            <NicEquippedRow
              label="Accessory"
              value={
                equipped.accessory?.name ||
                "None"
              }
            />

            <NicEquippedRow
              label="Effect"
              value={
                equipped.effect?.name ||
                "None"
              }
            />

            <NicEquippedRow
              label="Background"
              value={
                equipped.background?.name ||
                "Default"
              }
            />

            <NicEquippedRow
              label="Title"
              value={title}
            />
          </div>
        </section>
      )}

      {section === "closet" && (
        <section className="nic-panel">
          <div className="nic-section-heading">
            <div>
              <p className="card-label">
                YOUR COLLECTION
              </p>

              <h2>Closet</h2>
            </div>

            <span>
              {ownedItems.length} items
            </span>
          </div>

          <div className="nic-item-list">
            {ownedItems.map((item) => {
              const itemCategory =
                normalizeNicCategory(
                  item.category
                );

              const isEquipped =
                equipped[
                  itemCategory
                ]?.id === item.id;

              return (
                <NicItemCard
                  key={item.id}
                  item={item}
                  owned
                  equipped={isEquipped}
                  busy={
                    busyItem === item.id
                  }
                  onAction={() =>
                    isEquipped
                      ? unequipItem(item)
                      : equipItem(item)
                  }
                  actionLabel={
                    isEquipped
                      ? "Remove"
                      : "Equip"
                  }
                />
              );
            })}
          </div>
        </section>
      )}

      {section === "shop" && (
        <section className="nic-panel">
          <div className="nic-section-heading">
            <div>
              <p className="card-label">
                NIC SHOP
              </p>

              <h2>
                Spend your coins.
              </h2>
            </div>

            <span>🪙 {coins}</span>
          </div>

          <div className="nic-category-scroll">
            {SHOP_CATEGORIES.map(
              ([key, label]) => (
                <button
                  key={key}
                  className={
                    shopCategory === key
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    setShopCategory(key)
                  }
                >
                  {label}
                </button>
              )
            )}
          </div>

          <div className="nic-item-list">
            {filteredShopItems.map(
              (item) => {
                const owned =
                  ownedIds.includes(item.id);

                const itemCategory =
                  normalizeNicCategory(
                    item.category
                  );

                const isEquipped =
                  equipped[
                    itemCategory
                  ]?.id === item.id;

                return (
                  <NicItemCard
                    key={item.id}
                    item={item}
                    owned={owned}
                    equipped={isEquipped}
                    busy={
                      busyItem === item.id
                    }
                    onAction={() =>
                      isEquipped
                        ? unequipItem(item)
                        : owned
                          ? equipItem(item)
                          : buyItem(item)
                    }
                    actionLabel={
                      isEquipped
                        ? "Remove"
                        : owned
                          ? "Equip"
                          : item.price === 0
                            ? "Get"
                            : `🪙 ${item.price}`
                    }
                  />
                );
              }
            )}
          </div>
        </section>
      )}
    </main>
  );
}

function NicAvatar({
  body,
  face,
  accessory,
  effect,
  background,
}) {
  const bodyStyle = getNicBodyStyle(body);

  return (
    <section
      className="nic-stage"
      style={getNicBackgroundStyle(background)}
    >
      <div
        className={`nic-effect nic-effect-${effect}`}
      >
        <div
          className="nic-body"
          style={bodyStyle}
        >
          <div
            className="nic-mouthpiece"
            style={getNicMouthpieceStyle(body)}
          />

          <div
            className={`nic-face nic-${face}`}
          >
            <div className="nic-eyes">
              <span />
              <span />
            </div>

            <div className="nic-mouth" />
          </div>

          {accessory !== "none" && (
            <div
              className={`nic-wearable nic-wearable-${accessory}`}
              aria-label={accessory}
            >
              {accessory === "headphones" && (
                <>
                  <span className="nic-headphone-band" />
                  <span className="nic-headphone-ear nic-headphone-left" />
                  <span className="nic-headphone-ear nic-headphone-right" />
                </>
              )}

              {accessory === "star_glasses" && (
                <>
                  <span className="nic-star-lens nic-star-left">★</span>
                  <span className="nic-star-lens nic-star-right">★</span>
                  <span className="nic-glasses-bridge" />
                </>
              )}

              {accessory === "heart_glasses" && (
                <>
                  <span className="nic-heart-lens nic-heart-left">♥</span>
                  <span className="nic-heart-lens nic-heart-right">♥</span>
                  <span className="nic-glasses-bridge" />
                </>
              )}
            </div>
          )}

          <div className="nic-arm nic-arm-left" />
          <div className="nic-arm nic-arm-right" />

          <div className="nic-leg nic-leg-left" />
          <div className="nic-leg nic-leg-right" />
        </div>
      </div>
    </section>
  );
}

function getNicBackgroundStyle(background) {
  const backgrounds = {
    default: {
      background:
        "radial-gradient(circle at 50% 28%, #2a2338 0%, #191b24 48%, #111319 100%)",
    },

    night_city: {
      background:
        "linear-gradient(180deg, #171226 0%, #292141 48%, #171926 69%, #0c0f15 100%)",
    },

    space: {
      background:
        "radial-gradient(circle at 18% 18%, rgba(255,255,255,.9) 0 1px, transparent 2px), radial-gradient(circle at 73% 26%, rgba(174,145,255,.9) 0 2px, transparent 3px), radial-gradient(circle at 38% 72%, rgba(255,255,255,.65) 0 1px, transparent 2px), radial-gradient(circle at 82% 76%, rgba(91,140,255,.8) 0 2px, transparent 3px), radial-gradient(circle at 50% 45%, #33245b 0%, #12152c 43%, #070a14 100%)",
      backgroundSize:
        "83px 83px, 117px 117px, 71px 71px, 139px 139px, auto",
    },

    gym: {
      background:
        "linear-gradient(180deg, #333840 0%, #24282e 58%, #14171b 58%, #101216 100%)",
    },

    galaxy_background: {
      background:
        "radial-gradient(circle at 25% 22%, rgba(255,100,225,.65), transparent 18%), radial-gradient(circle at 76% 68%, rgba(78,119,255,.65), transparent 23%), radial-gradient(circle at 56% 35%, rgba(155,98,255,.35), transparent 30%), linear-gradient(145deg, #251347, #0b1025 70%)",
    },

    bedroom: {
      background:
        "linear-gradient(180deg, #282231 0%, #302735 62%, #19171d 62%, #111216 100%)",
    },

    beach: {
      background:
        "linear-gradient(180deg, #527a9c 0%, #6f9caf 49%, #345e72 50%, #31596c 62%, #9a7b55 63%, #514331 100%)",
    },

    mountains: {
      background:
        "linear-gradient(145deg, transparent 45%, #343b46 46% 62%, transparent 63%), linear-gradient(215deg, transparent 42%, #272e38 43% 65%, transparent 66%), linear-gradient(180deg, #25293c 0%, #171a25 55%, #101319 100%)",
    },
  };

  return backgrounds[background] || backgrounds.default;
}

function getNicBodyStyle(body) {
  const styles = {
    body_black: {
      background:
        "linear-gradient(145deg, #353941, #16191e)",
      borderColor: "#454b55",
    },

    body_white: {
      background:
        "linear-gradient(145deg, #f0f1f3, #aeb3ba)",
      borderColor: "#d6d9dd",
    },

    body_purple: {
      background:
        "linear-gradient(145deg, #a576ff, #55358f)",
      borderColor: "#c0a1ff",
    },

    body_blue: {
      background:
        "linear-gradient(145deg, #63a0ff, #274b91)",
      borderColor: "#8ab6ff",
    },

    body_gold: {
      background:
        "linear-gradient(145deg, #f4cf79, #9b7027)",
      borderColor: "#ffe0a0",
    },

    body_galaxy: {
      background:
        "radial-gradient(circle at 25% 25%, #ff75e6, transparent 28%), radial-gradient(circle at 75% 70%, #5b8cff, transparent 32%), linear-gradient(145deg, #513087, #10152d)",
      borderColor: "#aa8cff",
    },
  };

  return styles[body] || styles.body_black;
}

function getNicMouthpieceStyle(body) {
  const styles = {
    body_black: {
      background:
        "linear-gradient(145deg, #353941, #15181d)",
      borderColor: "#454b55",
    },

    body_white: {
      background:
        "linear-gradient(145deg, #f0f1f3, #aeb3ba)",
      borderColor: "#d6d9dd",
    },

    body_purple: {
      background:
        "linear-gradient(145deg, #a576ff, #55358f)",
      borderColor: "#c0a1ff",
    },

    body_blue: {
      background:
        "linear-gradient(145deg, #63a0ff, #274b91)",
      borderColor: "#8ab6ff",
    },

    body_gold: {
      background:
        "linear-gradient(145deg, #f4cf79, #9b7027)",
      borderColor: "#ffe0a0",
    },

    body_galaxy: {
      background:
        "linear-gradient(145deg, #7047aa, #1c2145)",
      borderColor: "#aa8cff",
    },
  };

  return styles[body] || styles.body_black;
}


function NicEquippedRow({
  label,
  value,
}) {
  return (
    <div className="nic-equipped-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function NicItemCard({
  item,
  owned,
  equipped,
  busy,
  onAction,
  actionLabel,
}) {
  return (
    <article className="nic-item-card">
      <div
        className={`nic-item-preview nic-preview-${item.asset_value}`}
      >
        <span>
          {getItemIcon(item)}
        </span>
      </div>

      <div className="nic-item-info">
        <div className="nic-item-name-row">
          <strong>{item.name}</strong>

          <span
            className={`nic-rarity nic-rarity-${item.rarity}`}
          >
            {item.rarity}
          </span>
        </div>

        <p>
          {formatCategory(
            item.category
          )}
        </p>
      </div>

      <button
        className={
          equipped
            ? "nic-item-button equipped"
            : "nic-item-button"
        }
        disabled={busy}
        onClick={onAction}
      >
        {busy ? "..." : actionLabel}
      </button>
    </article>
  );
}

function getItemIcon(item) {
  const icons = {
    body_black: "⬛",
    body_white: "⬜",
    body_purple: "🟪",
    body_blue: "🟦",
    body_gold: "🟨",
    body_galaxy: "🌌",

    face_happy: "☺",
    face_focused: "◉",
    face_cool: "😎",
    face_wink: "😉",

    sunglasses: "🕶️",
    headphones: "🎧",
    crown: "👑",
    gold_chain: "⛓️",

    baseball_cap: "🧢",
    beanie: "🧶",
    halo: "😇",
    devil_horns: "😈",
    bow_tie: "🎀",
    scarf: "🧣",
    monocle: "🧐",
    eye_patch: "🏴‍☠️",
    mustache: "🥸",
    backpack: "🎒",
    cape: "🦸",
    star_glasses: "🤩",
    heart_glasses: "😍",
    party_hat: "🥳",
    wizard_hat: "🧙",

    purple_aura: "✦",
    lightning: "⚡",
    legendary_aura: "✨",

    night_city: "🌃",
    space: "🌌",
    gym: "🏋️",

    "Locked In": "🔒",
    "Unbothered": "😌",
    "No Puff Needed": "🚫",
    "Built Different": "⭐",
  };

  return (
    icons[item.asset_value] ||
    icons[item.item_key] ||
    "✦"
  );
}


function formatCategory(category) {
  return (
    category.charAt(0).toUpperCase() +
    category.slice(1)
  );
}
