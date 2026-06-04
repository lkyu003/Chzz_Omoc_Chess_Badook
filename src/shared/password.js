const koreanKeyboardMap = new Map(
  Object.entries({
    ㅂ: "q",
    ㅃ: "q",
    ㅈ: "w",
    ㅉ: "w",
    ㄷ: "e",
    ㄸ: "e",
    ㄱ: "r",
    ㄲ: "r",
    ㅅ: "t",
    ㅆ: "t",
    ㅛ: "y",
    ㅕ: "u",
    ㅑ: "i",
    ㅐ: "o",
    ㅒ: "o",
    ㅔ: "p",
    ㅖ: "p",
    ㅁ: "a",
    ㄴ: "s",
    ㅇ: "d",
    ㄹ: "f",
    ㅎ: "g",
    ㅗ: "h",
    ㅓ: "j",
    ㅏ: "k",
    ㅣ: "l",
    ㅋ: "z",
    ㅌ: "x",
    ㅊ: "c",
    ㅍ: "v",
    ㅠ: "b",
    ㅜ: "n",
    ㅡ: "m",
  }),
);

const choseong = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const jungseong = ["ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"];
const jongseong = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const compoundJamo = {
  ㄳ: ["ㄱ", "ㅅ"],
  ㄵ: ["ㄴ", "ㅈ"],
  ㄶ: ["ㄴ", "ㅎ"],
  ㄺ: ["ㄹ", "ㄱ"],
  ㄻ: ["ㄹ", "ㅁ"],
  ㄼ: ["ㄹ", "ㅂ"],
  ㄽ: ["ㄹ", "ㅅ"],
  ㄾ: ["ㄹ", "ㅌ"],
  ㄿ: ["ㄹ", "ㅍ"],
  ㅀ: ["ㄹ", "ㅎ"],
  ㅄ: ["ㅂ", "ㅅ"],
  ㅘ: ["ㅗ", "ㅏ"],
  ㅙ: ["ㅗ", "ㅐ"],
  ㅚ: ["ㅗ", "ㅣ"],
  ㅝ: ["ㅜ", "ㅓ"],
  ㅞ: ["ㅜ", "ㅔ"],
  ㅟ: ["ㅜ", "ㅣ"],
  ㅢ: ["ㅡ", "ㅣ"],
};

export function normalizePassword(value) {
  return [...String(value || "")]
    .flatMap((char) => hangulToKeys(char))
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function hangulToKeys(char) {
  if (/[a-zA-Z0-9]/.test(char)) return [char];
  if (koreanKeyboardMap.has(char)) return [koreanKeyboardMap.get(char)];

  const code = char.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return [];

  const offset = code - 0xac00;
  const initial = Math.floor(offset / 588);
  const medial = Math.floor((offset % 588) / 28);
  const final = offset % 28;
  return [
    ...jamoToKeys(choseong[initial]),
    ...jamoToKeys(jungseong[medial]),
    ...jamoToKeys(jongseong[final]),
  ];
}

function jamoToKeys(jamo) {
  if (!jamo) return [];
  if (compoundJamo[jamo]) return compoundJamo[jamo].flatMap(jamoToKeys);
  return koreanKeyboardMap.has(jamo) ? [koreanKeyboardMap.get(jamo)] : [];
}
