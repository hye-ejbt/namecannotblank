WITH 
-- (1) 링크 ID 시퀀스 (입력 순서대로 번호 부여)
LinkSeq AS (
    SELECT 
        ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS seq_no,
        link_id
    FROM (VALUES
        (67666),
        (67667),
        (12345),
        (88888)
    ) AS t(link_id)
),
-- (2) 출발점
StartPos AS (
    SELECT 
        CAST(60610    AS INT) AS start_node_id,
        CAST(57160000 AS INT) AS start_map_id
),
-- (3) 도엽 경계 노드 짝 매핑 미리 계산
--     같은 좌표를 가진 NODE_KIND=7 노드끼리 self-join
--     (한 좌표에 도엽 N개가 만나면 모든 조합이 행으로 나옴)
BoundaryPair AS (
    SELECT 
        a.NODE_ID     AS from_node_id,
        a.NODE_MAP_ID AS from_map_id,
        b.NODE_ID     AS to_node_id,
        b.NODE_MAP_ID AS to_map_id
    FROM RTM_NODE a
    INNER JOIN RTM_NODE b
            ON a.NODE_KIND   = 7
           AND b.NODE_KIND   = 7
           AND a.NODE_MAP_ID <> b.NODE_MAP_ID
           AND a.NODE_XY_GRS.STEquals(b.NODE_XY_GRS) = 1
),
-- (4) 재귀 CTE: 도엽 추적
Walk AS (
    -- ── Anchor: 첫 번째 링크 ──
    SELECT 
        s.seq_no,
        s.link_id,
        l.LINK_MAP_ID                                      AS link_map_id,
        l.ST_ND_ID                                         AS st_nd_id,
        l.ED_ND_ID                                         AS ed_nd_id,
        -- 반대편 노드 (도엽 점프 전)
        CASE WHEN l.ST_ND_ID = sp.start_node_id 
             THEN l.ED_ND_ID ELSE l.ST_ND_ID END           AS opposite_node_id,
        -- 다음 위치: 경계 노드면 짝 노드로 점프, 아니면 그대로
        COALESCE(bp.to_node_id,
                 CASE WHEN l.ST_ND_ID = sp.start_node_id 
                      THEN l.ED_ND_ID ELSE l.ST_ND_ID END) AS next_node_id,
        COALESCE(bp.to_map_id, l.LINK_MAP_ID)              AS next_map_id,
        CASE WHEN bp.to_node_id IS NOT NULL 
             THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END   AS crossed_bnd
    FROM      LinkSeq  s
    CROSS JOIN StartPos sp
    INNER JOIN RTM_LINK l
            ON l.LINK_ID     = s.link_id
           AND l.LINK_MAP_ID = sp.start_map_id
           AND (l.ST_ND_ID = sp.start_node_id OR l.ED_ND_ID = sp.start_node_id)
    -- 경계 노드 짝 조회 (단순 LEFT JOIN으로 대체)
    LEFT JOIN BoundaryPair bp
            ON bp.from_node_id = CASE WHEN l.ST_ND_ID = sp.start_node_id 
                                      THEN l.ED_ND_ID ELSE l.ST_ND_ID END
           AND bp.from_map_id  = l.LINK_MAP_ID
    WHERE s.seq_no = 1

    UNION ALL

    -- ── Recursive: 이전 행의 next_node_id / next_map_id 사용 ──
    SELECT 
        s.seq_no,
        s.link_id,
        l.LINK_MAP_ID,
        l.ST_ND_ID,
        l.ED_ND_ID,
        CASE WHEN l.ST_ND_ID = w.next_node_id 
             THEN l.ED_ND_ID ELSE l.ST_ND_ID END,
        COALESCE(bp.to_node_id,
                 CASE WHEN l.ST_ND_ID = w.next_node_id 
                      THEN l.ED_ND_ID ELSE l.ST_ND_ID END),
        COALESCE(bp.to_map_id, l.LINK_MAP_ID),
        CASE WHEN bp.to_node_id IS NOT NULL 
             THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END
    FROM      Walk     w
    INNER JOIN LinkSeq s
            ON s.seq_no = w.seq_no + 1
    INNER JOIN RTM_LINK l
            ON l.LINK_ID     = s.link_id
           AND l.LINK_MAP_ID = w.next_map_id
           AND (l.ST_ND_ID = w.next_node_id OR l.ED_ND_ID = w.next_node_id)
    LEFT JOIN BoundaryPair bp
            ON bp.from_node_id = CASE WHEN l.ST_ND_ID = w.next_node_id 
                                      THEN l.ED_ND_ID ELSE l.ST_ND_ID END
           AND bp.from_map_id  = l.LINK_MAP_ID
)
SELECT 
    seq_no,
    link_id,
    link_map_id,
    st_nd_id,
    ed_nd_id,
    opposite_node_id,
    crossed_bnd
FROM Walk
ORDER BY seq_no
OPTION (MAXRECURSION 0);
