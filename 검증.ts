export function validatePatternAndArrow(
  fullPatternCode: string,
  fullArrowCode: string
): void {

  if (fullArrowCode === "0") return;

  const secondChar = fullPatternCode.substring(1, 2);
  const isCT = secondChar === "c" || secondChar === "t";

  if (isCT) {
    const firstArrowChar = fullArrowCode.substring(0, 1);

    if (!["c", "r", "t"].includes(firstArrowChar)) {
      return message.error(
        `화살표 코드는 c, r, t 중 하나로 시작해야 합니다. (현재: ${firstArrowChar})`
      );
    }

    if (fullPatternCode.slice(-6) !== fullArrowCode.slice(-6)) {
      return message.error(
        `패턴 번호(${fullPatternCode.slice(-6)})와 화살표 번호(${fullArrowCode.slice(-6)})가 일치하지 않습니다.`
      );
    }

  } else {
    if (fullPatternCode.slice(-7) !== fullArrowCode.slice(-7)) {
      return message.error(
        `패턴 번호(${fullPatternCode.slice(-7)})와 화살표 번호(${fullArrowCode.slice(-7)})가 일치하지 않습니다.`
      );
    }
  }
}
