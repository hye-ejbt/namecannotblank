upsertBranches: (incoming: BranchMappingMap[]) =>
  setBranches(s => 
    produce(s, draft => {
      for (const item of incoming) {
        let branch = draft.find(
          v => v.inLink === item.inLink && v.crossType === item.crossType
        );
        if (!branch) {
          draft.push(item);
        } else {
          // 기존 branch에 patterns 병합
          item.patterns.forEach((pattern, patternId) => {
            const existing = branch!.patterns.get(patternId);
            if (!existing) {
              branch!.patterns.set(patternId, pattern);
            } else {
              // arrows 병합
              pattern.arrows.forEach((arrow, arrowId) => {
                const existingArrow = existing.arrows.get(arrowId);
                if (!existingArrow) {
                  existing.arrows.set(arrowId, arrow);
                } else {
                  arrow.outLinks.forEach(link => existingArrow.outLinks.add(link));
                }
              });
            }
          });
        }
      }
    })
  ),
