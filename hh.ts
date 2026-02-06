const ID_FIXED = '';

const CombinedModal: React.FC = () => {
  const store = rootStore;
  const { t } = useTranslation();

  /* =========================
     source state
  ========================= */
  const [patterns, setPatterns] = useState<string[]>([]);
  const [patternMappingArrowList, setPatternMappingArrowList] =
    useState<PatternMappingArrow[]>([]);
  const [responseBranchData, setResponseBranchData] =
    useState<any[]>([]);

  /* =========================
     selection state
  ========================= */
  const [selectedPattern, setSelectedPattern] = useState<string>('');
  const [selectedArrow, setSelectedArrow] = useState<string>('');

  const [regType, setRegType] = useState<RegType>({
    crossType: CrossTypeEnum.CROSS_TYPE_NORMAL,
    nodeId: store.node?.getNodeId() ?? 0,
    inlink: store.inLinks?.[0] ?? 0,
    outlink: 0,
  });

  /* =========================
     derived state (NO setState)
  ========================= */
  const arrows = useMemo<string[]>(() => {
    if (!selectedPattern || selectedPattern === ID_FIXED) return [];

    return (
      patternMappingArrowList.find(
        m =>
          m.patternId === selectedPattern &&
          m.outLink === regType.outlink
      )?.list ?? []
    );
  }, [selectedPattern, regType.outlink, patternMappingArrowList]);

  const patternsDataSource = useMemo(
    () => patterns.map(p => ({ key: p, patternId: p })),
    [patterns]
  );

  const arrowsDataSource = useMemo(
    () => arrows.map(a => ({ key: a, arrowId: a })),
    [arrows]
  );

  /* =========================
     data load (SOURCE ONLY)
  ========================= */
  const loadBranchData = async (outLink: number) => {
    if (!store.node) return;

    const resp = await useCombinedService.getBranchData(
      regType.nodeId,
      store.node.getNodeMapId(),
      regType.inlink,
      outLink,
      regType.crossType
    );

    setResponseBranchData(resp);

    setPatternMappingArrowList(prev => {
      const map = new Map<string, PatternMappingArrow>();

      // 기존 유지
      for (const item of prev) {
        map.set(`${item.patternId}_${item.outLink}`, {
          ...item,
          list: [...item.list],
        });
      }

      // 서버 병합
      for (const { patternId, outLinkId, arrowId } of resp) {
        const key = `${patternId}_${outLinkId}`;
        if (!map.has(key)) {
          map.set(key, {
            patternId,
            outLink: outLinkId,
            list: [arrowId],
          });
        } else {
          const item = map.get(key)!;
          if (!item.list.includes(arrowId)) {
            item.list.push(arrowId);
          }
        }
      }

      return Array.from(map.values());
    });

    setPatterns([...new Set(resp.map(r => r.patternId))]);
  };

  /* =========================
     handlers (SELECTION ONLY)
  ========================= */
  const onSelectPattern = (patternId: string) => {
    setSelectedPattern(prev =>
      prev === patternId ? '' : patternId
    );
    setSelectedArrow('');
  };

  const onSelectArrow = (arrowId: string) => {
    setSelectedArrow(prev =>
      prev === arrowId ? '' : arrowId
    );
  };

  const onDeleteArrow = () => {
    if (!selectedPattern || !selectedArrow) {
      message.error('삭제할 항목을 선택해주세요.');
      return;
    }

    setPatternMappingArrowList(prev =>
      prev.map(item =>
        item.patternId === selectedPattern &&
        item.outLink === regType.outlink
          ? {
              ...item,
              list: item.list.filter(a => a !== selectedArrow),
            }
          : item
      )
    );

    setSelectedArrow('');
  };

  /* =========================
     UI
  ========================= */
  return (
    <div>
      <Table
        dataSource={patternsDataSource}
        pagination={false}
        rowClassName={r =>
          r.key === selectedPattern ? 'selected-row' : ''
        }
        onRow={record => ({
          onClick: () => onSelectPattern(record.key),
        })}
        columns={[
          { title: 'PATTERN', dataIndex: 'patternId', key: 'patternId' },
        ]}
      />

      <Table
        dataSource={arrowsDataSource}
        pagination={false}
        rowClassName={r =>
          r.key === selectedArrow ? 'selected-row' : ''
        }
        onRow={record => ({
          onClick: () => onSelectArrow(record.key),
        })}
        columns={[
          { title: 'ARROW', dataIndex: 'arrowId', key: 'arrowId' },
        ]}
      />

      <Button danger onClick={onDeleteArrow}>
        삭제
      </Button>
    </div>
  );
};

export default CombinedModal;
