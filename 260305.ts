import { produce } from "immer";

// 패턴 추가
export const addPattern = (
  state: BranchState[],
  inLink: number,
  crossType: number,
  patternId: string
) =>
  produce(state, draft => {

    const branch = draft.find(
      v => v.inLink === inLink && v.crossType === crossType
    );

    if (!branch) return;

    if (!branch.patterns.has(patternId)) {
      branch.patterns.set(patternId, {
        patternId,
        arrows: new Map()
      });
    }
  });

// 패턴 삭제
export const removePattern = (
  state: BranchState[],
  inLink: number,
  crossType: number,
  patternId: string
) =>
  produce(state, draft => {

    const branch = draft.find(
      v => v.inLink === inLink && v.crossType === crossType
    );

    branch?.patterns.delete(patternId);
  });


// arrow 추가
export const addArrow = (
  state: BranchState[],
  inLink: number,
  crossType: number,
  patternId: string,
  arrowId: string
) =>
  produce(state, draft => {

    const branch = draft.find(
      v => v.inLink === inLink && v.crossType === crossType
    );

    const pattern = branch?.patterns.get(patternId);
    if (!pattern) return;

    if (!pattern.arrows.has(arrowId)) {
      pattern.arrows.set(arrowId, {
        arrowId,
        outLinks: new Set()
      });
    }
  });


// arrow 삭제
export const removeArrow = (
  state: BranchState[],
  inLink: number,
  crossType: number,
  patternId: string,
  arrowId: string
) =>
  produce(state, draft => {

    const branch = draft.find(
      v => v.inLink === inLink && v.crossType === crossType
    );

    const pattern = branch?.patterns.get(patternId);

    pattern?.arrows.delete(arrowId);
  });

// outlink 추가
export const addOutLink = (
  state: BranchState[],
  inLink: number,
  crossType: number,
  patternId: string,
  arrowId: string,
  outLink: number
) =>
  produce(state, draft => {

    const branch = draft.find(
      v => v.inLink === inLink && v.crossType === crossType
    );

    const arrow =
      branch?.patterns.get(patternId)?.arrows.get(arrowId);

    arrow?.outLinks.add(outLink);
  });


// outlink 삭제
export const removeOutLink = (
  state: BranchState[],
  inLink: number,
  crossType: number,
  patternId: string,
  arrowId: string,
  outLink: number
) =>
  produce(state, draft => {

    const arrow =
      draft
        .find(v => v.inLink === inLink && v.crossType === crossType)
        ?.patterns.get(patternId)
        ?.arrows.get(arrowId);

    arrow?.outLinks.delete(outLink);
  });


//hook
export function useBranchPatternEditor(initial: BranchState[]) {

  const [branches, setBranches] = useState(initial);

  const actions = {

    addPattern: (inLink: number, crossType: number, patternId: string) =>
      setBranches(s => addPattern(s, inLink, crossType, patternId)),

    removePattern: (inLink: number, crossType: number, patternId: string) =>
      setBranches(s => removePattern(s, inLink, crossType, patternId)),

    addArrow: (
      inLink: number,
      crossType: number,
      patternId: string,
      arrowId: string
    ) =>
      setBranches(s =>
        addArrow(s, inLink, crossType, patternId, arrowId)
      ),

    removeArrow: (
      inLink: number,
      crossType: number,
      patternId: string,
      arrowId: string
    ) =>
      setBranches(s =>
        removeArrow(s, inLink, crossType, patternId, arrowId)
      ),

    addOutLink: (
      inLink: number,
      crossType: number,
      patternId: string,
      arrowId: string,
      outLink: number
    ) =>
      setBranches(s =>
        addOutLink(s, inLink, crossType, patternId, arrowId, outLink)
      ),

    removeOutLink: (
      inLink: number,
      crossType: number,
      patternId: string,
      arrowId: string,
      outLink: number
    ) =>
      setBranches(s =>
        removeOutLink(
          s,
          inLink,
          crossType,
          patternId,
          arrowId,
          outLink
        )
      )
  };

  return {
    branches,
    actions
  };
}





















