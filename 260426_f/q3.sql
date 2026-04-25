WITH 
-- (1) 링크 시퀀스
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
-- (3) 노드 점프 매핑 (모든 노드 포함, INNER JOIN용)
--     - 일반 노드: 자기 자신으로 매핑 (점프 없음)
--     - 경계 노드(KIND=7): 인접 도엽의 짝 노드로 매핑
NodeJump AS (
    -- 모든 노드는 기본적으로 자기 자신으로 매핑됨
    SELECT 
        NODE_ID                AS from_node_id,
        NODE_MAP_ID            AS from_map_id,
        NODE_ID                AS to_node_id,
        NODE_MAP_ID            AS to_map_id,
        CAST(0 AS BIT)         AS crossed_bnd
    FROM RTM_NODE

    UNION ALL

    -- 경계 노드는 추가로 짝 노드로의 매핑도 보유
    SELECT 
        a.NODE_ID,
        a.NODE_MAP_ID,
        b.NODE_ID,
        b.NODE_MAP_ID,
        CAST(1 AS BIT)
    FROM RTM_NODE a
    INNER JOIN RTM_NODE b
            ON a.NODE_KIND   = 7
           AND b.NODE_KIND   = 7
           AND a.NODE_MAP_ID <> b.NODE_MAP_ID
           AND a.NODE_XY_GRS.STEquals(b.NODE_XY_GRS) = 1
),
-- (4) 재귀 CTE
Walk AS (
    -- ── Anchor: 첫 번째 링크 ──
    SELECT 
        s.seq_no,
        s.link_id,
        l.LINK_MAP_ID                                      AS link_map_id,
        l.ST_ND_ID                                         AS st_nd_id,
        l.ED_ND_ID                                         AS ed_nd_id,
        CASE WHEN l.ST_ND_ID = sp.start_node_id 
             THEN l.ED_ND_ID ELSE l.ST_ND_ID END           AS opposite_node_id,
        nj.to_node_id                                      AS next_node_id,
        nj.to_map_id                                       AS next_map_id,
        nj.crossed_bnd                                     AS crossed_bnd
    FROM      LinkSeq  s
    CROSS JOIN StartPos sp
    INNER JOIN RTM_LINK l
            ON l.LINK_ID     = s.link_id
           AND l.LINK_MAP_ID = sp.start_map_id
           AND (l.ST_ND_ID = sp.start_node_id OR l.ED_ND_ID = sp.start_node_id)
    -- 반대편 노드 → NodeJump를 통해 다음 위치 결정 (INNER JOIN)
    INNER JOIN NodeJump nj
            ON nj.from_node_id = CASE WHEN l.ST_ND_ID = sp.start_node_id 
                                      THEN l.ED_ND_ID ELSE l.ST_ND_ID END
           AND nj.from_map_id  = l.LINK_MAP_ID
    WHERE s.seq_no = 1
    UNION ALL
    -- ── Recursive ──
    SELECT 
        s.seq_no,
        s.link_id,
        l.LINK_MAP_ID,
        l.ST_ND_ID,
        l.ED_ND_ID,
        CASE WHEN l.ST_ND_ID = w.next_node_id 
             THEN l.ED_ND_ID ELSE l.ST_ND_ID END,
        nj.to_node_id,
        nj.to_map_id,
        nj.crossed_bnd
    FROM      Walk     w
    INNER JOIN LinkSeq s
            ON s.seq_no = w.seq_no + 1
    INNER JOIN RTM_LINK l
            ON l.LINK_ID     = s.link_id
           AND l.LINK_MAP_ID = w.next_map_id
           AND (l.ST_ND_ID = w.next_node_id OR l.ED_ND_ID = w.next_node_id)
    INNER JOIN NodeJump nj
            ON nj.from_node_id = CASE WHEN l.ST_ND_ID = w.next_node_id 
                                      THEN l.ED_ND_ID ELSE l.ST_ND_ID END
           AND nj.from_map_id  = l.LINK_MAP_ID
)
SELECT 
    seq_no,
    link_id,
    link_map_id,
    st_nd_id,
    ed_nd_id,
    opposite_node_id,
    next_node_id,
    next_map_id,
    crossed_bnd
FROM Walk
ORDER BY seq_no
OPTION (MAXRECURSION 0);
